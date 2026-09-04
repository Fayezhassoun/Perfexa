// Optimization loop (Phase 3, CONTRACTS §11): reads campaigns_mirror metrics
// and turns them into *suggested* actions. Every suggestion becomes a PENDING
// approval a human must decide — the loop never executes tools itself. The
// Budget Guardian remains the only actor that touches campaigns autonomously;
// when a suggestion is approved, the gated tool path re-runs the Guardian
// check at execution time anyway.

import { and, desc, eq } from 'drizzle-orm';
import { approvals, campaignsMirror, connectedAccounts, type CampaignMirror } from '@growthcrew/db';
import type { MirrorMetrics } from '../store.js';
import { payloadHash } from '../audit.js';
import type { AgentContext } from '../types.js';

export interface OptimizationSuggestion {
  toolName: 'ads.pause_campaign' | 'ads.update_budget';
  args: Record<string, unknown>;
  summary: string;
  rule: 'trim_burner' | 'scale_winner' | 'shift_budget';
}

interface CampaignStats {
  row: CampaignMirror;
  dailyCents: number;
  spendCents: number;
  conversions: number;
  cplCents: number | null;
}

function statsOf(row: CampaignMirror): CampaignStats {
  const metrics = (row.metrics as MirrorMetrics | null) ?? { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 };
  const cplCents = metrics.conversions > 0 ? Math.round(metrics.spendCents / metrics.conversions) : null;
  return {
    row,
    dailyCents: row.budgetDailyCents ?? 0,
    spendCents: metrics.spendCents,
    conversions: metrics.conversions,
    cplCents,
  };
}

/**
 * Deterministic rules over active campaigns:
 * 1. trim_burner  — 0 conversions after spending ≥ 3× the daily budget → suggest pause.
 * 2. scale_winner — ≥3 conversions at ≤75% of the org's average CPL → suggest +20% daily budget.
 * 3. shift_budget — one platform's CPL is ≥2× another's (both converting) → move 20% of
 *    the worst campaign's daily budget to the best one.
 */
export function buildSuggestions(campaigns: CampaignMirror[]): OptimizationSuggestion[] {
  const active = campaigns.filter((c) => c.status === 'active' && c.externalId && c.mode !== 'live');
  const stats = active.map(statsOf);
  const suggestions: OptimizationSuggestion[] = [];

  const totalSpend = stats.reduce((s, c) => s + c.spendCents, 0);
  const totalConversions = stats.reduce((s, c) => s + c.conversions, 0);
  const orgAvgCpl = totalConversions > 0 ? totalSpend / totalConversions : null;

  for (const s of stats) {
    const base = { platform: s.row.platform as string, externalId: s.row.externalId as string };
    if (s.conversions === 0 && s.spendCents >= 3 * s.dailyCents && s.dailyCents > 0) {
      suggestions.push({
        toolName: 'ads.pause_campaign',
        args: base,
        summary: `Pause "${s.row.name}" — it has spent $${(s.spendCents / 100).toFixed(2)} with no conversions yet.`,
        rule: 'trim_burner',
      });
      continue; // paused things can't also scale
    }
    if (orgAvgCpl !== null && s.conversions >= 3 && s.cplCents !== null && s.cplCents <= 0.75 * orgAvgCpl) {
      const newBudget = Math.round(s.dailyCents * 1.2);
      if (newBudget > s.dailyCents) {
        suggestions.push({
          toolName: 'ads.update_budget',
          args: { ...base, dailyBudgetCents: newBudget },
          summary: `Raise "${s.row.name}" to $${(newBudget / 100).toFixed(2)}/day — it's converting ~25% cheaper than your average.`,
          rule: 'scale_winner',
        });
      }
    }
  }


  // shift_budget across platforms (only for campaigns without a suggestion yet)
  const byPlatform = new Map<string, CampaignStats[]>();
  for (const s of stats) {
    const list = byPlatform.get(s.row.platform ?? '') ?? [];
    list.push(s);
    byPlatform.set(s.row.platform ?? '', list);
  }
  const platformCpl = [...byPlatform.entries()]
    .map(([platform, list]) => {
      const spend = list.reduce((a, c) => a + c.spendCents, 0);
      const conv = list.reduce((a, c) => a + c.conversions, 0);
      return { platform, list, cpl: conv > 0 ? spend / conv : null };
    })
    .filter((p): p is typeof p & { cpl: number } => p.cpl !== null);
  if (platformCpl.length >= 2) {
    platformCpl.sort((a, b) => a.cpl - b.cpl);
    const best = platformCpl[0]!;
    const worst = platformCpl[platformCpl.length - 1]!;
    if (worst.cpl >= 2 * best.cpl && worst.platform !== best.platform) {
      const already = new Set(suggestions.map((s) => s.args.externalId));
      const from = worst.list
        .filter((c) => !already.has(c.row.externalId ?? ''))
        .sort((a, b) => b.spendCents - a.spendCents)[0];
      const to = best.list
        .filter((c) => !already.has(c.row.externalId ?? ''))
        .sort((a, b) => (a.cplCents ?? Infinity) - (b.cplCents ?? Infinity))[0];
      if (from && to && from.dailyCents > 0) {
        const move = Math.round(from.dailyCents * 0.2);
        if (move > 0) {
          suggestions.push({
            toolName: 'ads.update_budget',
            args: {
              platform: from.row.platform,
              externalId: from.row.externalId,
              dailyBudgetCents: from.dailyCents - move,
            },
            summary: `Move ${(move / 100).toFixed(2)}/day from "${from.row.name}"…`,
            rule: 'shift_budget',
          });
          suggestions.push({
            toolName: 'ads.update_budget',
            args: {
              platform: to.row.platform,
              externalId: to.row.externalId,
              dailyBudgetCents: to.dailyCents + move,
            },
            summary: `…to "${to.row.name}" — ${best.platform} leads are ~${Math.round(worst.cpl / best.cpl)}× cheaper right now.`,
            rule: 'shift_budget',
          });
        }
      }
    }
  }

  return suggestions;
}

export interface OptimizeRunResult {
  created: number;
  skippedDuplicates: number;
  suggestions: { approvalId: string; summary: string; rule: string }[];
}

/** Create pending approvals for every fresh suggestion (idempotent per org). */
export async function generateOptimizationApprovals(ctx: AgentContext): Promise<OptimizeRunResult> {
  const campaigns = await ctx.db
    .select()
    .from(campaignsMirror)
    .where(and(eq(campaignsMirror.orgId, ctx.orgId), eq(campaignsMirror.status, 'active')))
    .orderBy(desc(campaignsMirror.updatedAt));

  const liveAccounts = await ctx.db
    .select({ platform: connectedAccounts.platform })
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.orgId, ctx.orgId), eq(connectedAccounts.mode, 'live')));
  const livePlatforms = new Set(liveAccounts.map((account) => account.platform));
  const suggestions = buildSuggestions(
    campaigns.filter((campaign) => !livePlatforms.has(campaign.platform ?? '')),
  );
  const pending = await ctx.db
    .select()
    .from(approvals)
    .where(and(eq(approvals.orgId, ctx.orgId), eq(approvals.status, 'pending')));

  const pendingHashes = new Set(
    pending.map((a) => {
      const action = a.action as { toolName?: string; args?: Record<string, unknown> };
      return `${action?.toolName}:${payloadHash(action?.args ?? {})}`;
    }),
  );

  const result: OptimizeRunResult = { created: 0, skippedDuplicates: 0, suggestions: [] };
  for (const s of suggestions) {
    const key = `${s.toolName}:${payloadHash(s.args)}`;
    if (pendingHashes.has(key)) {
      result.skippedDuplicates += 1;
      continue;
    }
    const [approval] = await ctx.db
      .insert(approvals)
      .values({
        orgId: ctx.orgId,
        action: { type: 'tool', toolName: s.toolName, args: s.args, summary: s.summary },
        status: 'pending',
      })
      .returning();
    result.created += 1;
    result.suggestions.push({ approvalId: approval!.id, summary: s.summary, rule: s.rule });
    pendingHashes.add(key);
  }

  await ctx.audit.log({
    actorType: 'system',
    actorId: 'optimizer',
    action: 'optimize.suggestions',
    entityType: 'org',
    entityId: ctx.orgId,
    payload: {
      created: result.created,
      skippedDuplicates: result.skippedDuplicates,
      rules: result.suggestions.map((s) => s.rule),
    },
  });
  return result;
}
