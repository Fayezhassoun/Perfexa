// Budget Guardian (CONTRACTS §8): caps, velocity anomaly, zero-conversion burn.
// Every enforcement action is audit-logged. checkSpend runs inside every gated
// ads tool before the adapter write.

import { and, eq } from 'drizzle-orm';
import { budgets, campaignsMirror } from '@growthcrew/db';
import type { AdPlatform } from '@growthcrew/integrations';
import type { AgentContext } from './types.js';
import type { MirrorMetrics } from './store.js';

export interface GuardianVerdict {
  ok: boolean;
  reason?: string;
  autoPaused?: string[];
  /** Filled on cap violations so callers can throw BudgetCapExceeded. */
  scope?: string;
  capCents?: number;
  attemptedCents?: number;
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Projected month-end spend = spent so far + active daily budgets × days remaining. */
export function projectMonthEnd(spentThisMonthCents: number, activeDailyBudgetCents: number, now: Date): number {
  const daysRemaining = daysInMonth(now) - now.getDate();
  return spentThisMonthCents + activeDailyBudgetCents * Math.max(0, daysRemaining);
}

export function wouldExceed(capCents: number, projectedCents: number): boolean {
  return projectedCents > capCents;
}

interface CampaignRow {
  id: string;
  platform: string | null;
  status: string | null;
  budgetDailyCents: number | null;
  metrics: unknown;
}

function metricsOf(row: CampaignRow): { spendCents: number; conversions: number } {
  const m = row.metrics as Partial<MirrorMetrics> | null;
  return { spendCents: m?.spendCents ?? 0, conversions: m?.conversions ?? 0 };
}

async function loadBudgetCaps(ctx: AgentContext, platform?: AdPlatform) {
  const rows = await ctx.db.select().from(budgets).where(eq(budgets.orgId, ctx.orgId));
  const globalMonthly = rows.find((r) => r.scope === 'global' && r.period === 'monthly')?.capCents ?? null;
  const platformMonthly = platform
    ? (rows.find((r) => r.scope === `platform:${platform}` && r.period === 'monthly')?.capCents ?? null)
    : null;
  const platformDaily = platform
    ? (rows.find((r) => r.scope === `platform:${platform}` && r.period === 'daily')?.capCents ?? null)
    : null;
  const globalDaily = rows.find((r) => r.scope === 'global' && r.period === 'daily')?.capCents ?? null;
  return { globalMonthly, platformMonthly, platformDaily, globalDaily };
}

async function loadCampaigns(ctx: AgentContext, platform?: AdPlatform): Promise<CampaignRow[]> {
  const where = platform
    ? and(eq(campaignsMirror.orgId, ctx.orgId), eq(campaignsMirror.platform, platform))
    : eq(campaignsMirror.orgId, ctx.orgId);
  return ctx.db
    .select({
      id: campaignsMirror.id,
      platform: campaignsMirror.platform,
      status: campaignsMirror.status,
      budgetDailyCents: campaignsMirror.budgetDailyCents,
      metrics: campaignsMirror.metrics,
    })
    .from(campaignsMirror)
    .where(where);
}

function activeDailyTotal(rows: CampaignRow[]): number {
  return rows.filter((r) => r.status === 'active').reduce((s, r) => s + (r.budgetDailyCents ?? 0), 0);
}

function totalSpend(rows: CampaignRow[]): number {
  // Approximation: mirror metrics are cumulative per campaign. Mock campaigns are
  // created within the billing month, so cumulative ≈ month-to-date here.
  return rows.reduce((s, r) => s + metricsOf(r).spendCents, 0);
}

/**
 * Pre-flight check for a gated spend action. Returns {ok:false, ...} when the
 * action would breach any cap; the tool layer throws BudgetCapExceeded on it.
 */
export async function checkSpend(
  ctx: AgentContext,
  platform: AdPlatform,
  additionalDailyCents: number,
): Promise<GuardianVerdict> {
  const now = ctx.now ?? new Date();
  const caps = await loadBudgetCaps(ctx, platform);
  const platformRows = await loadCampaigns(ctx, platform);
  const allRows = platformRows; // single-platform org totals in phase 1
  const spentThisMonth = totalSpend(allRows);
  const activeDaily = activeDailyTotal(platformRows) + additionalDailyCents;

  const monthlyCap = caps.platformMonthly ?? caps.globalMonthly;
  if (monthlyCap != null) {
    const projected = projectMonthEnd(spentThisMonth, activeDaily, now);
    if (wouldExceed(monthlyCap, projected)) {
      return {
        ok: false,
        reason: `Projected month-end spend $${(projected / 100).toFixed(0)} would exceed the ${platform === 'google_ads' ? 'Google Ads' : platform} monthly cap of $${(monthlyCap / 100).toFixed(0)}.`,
        scope: `platform:${platform}`,
        capCents: monthlyCap,
        attemptedCents: projected,
      };
    }
  }

  const dailyCap = caps.platformDaily ?? caps.globalDaily;
  if (dailyCap != null) {
    const hoursElapsed = now.getHours() + now.getMinutes() / 60;
    const spentTodayEstimate = Math.round(activeDailyTotal(platformRows) * (hoursElapsed / 24));
    const attempted = spentTodayEstimate + additionalDailyCents;
    if (attempted > dailyCap) {
      return {
        ok: false,
        reason: `Today's spend would exceed the daily cap of $${(dailyCap / 100).toFixed(0)}.`,
        scope: `platform:${platform}`,
        capCents: dailyCap,
        attemptedCents: attempted,
      };
    }
  }

  return { ok: true };
}

/**
 * Periodic observation for the pilot. It records risks but never mutates an
 * external ad account. Recommendations must be reviewed by a human separately.
 */
export async function tick(ctx: AgentContext): Promise<GuardianVerdict> {
  const now = ctx.now ?? new Date();
  const reasons: string[] = [];
  const allRows = await loadCampaigns(ctx);
  const platforms = [...new Set(allRows.map((r) => r.platform).filter((p): p is AdPlatform => Boolean(p)))];

  const caps = await loadBudgetCaps(ctx);
  const spentThisMonth = totalSpend(allRows);
  if (caps.globalMonthly != null) {
    const projected = projectMonthEnd(spentThisMonth, activeDailyTotal(allRows), now);
    if (wouldExceed(caps.globalMonthly, projected) && activeDailyTotal(allRows) > 0) {
      reasons.push(`Attention required: projected spend $${(projected / 100).toFixed(0)} exceeds the monthly cap of $${(caps.globalMonthly / 100).toFixed(0)}.`);
      await ctx.audit.log({
        actorType: 'agent', actorId: 'budget_guardian', action: 'guardian.signal.velocity',
        entityType: 'organization', entityId: ctx.orgId,
        payload: { projectedCents: projected, capCents: caps.globalMonthly, platforms },
        metadata: { mode: 'read_only' },
      });
    }
  }

  const targetCplCents = 5000;
  for (const platform of platforms) {
    const burners = allRows.filter((row) => {
      if (row.platform !== platform || row.status !== 'active') return false;
      const metrics = metricsOf(row);
      return metrics.spendCents >= 3 * targetCplCents && metrics.conversions === 0;
    });
    for (const campaign of burners) {
      const spendCents = metricsOf(campaign).spendCents;
      reasons.push(`Attention required: campaign ${campaign.id} has spent $${(spendCents / 100).toFixed(0)} with no conversions.`);
      await ctx.audit.log({
        actorType: 'agent', actorId: 'budget_guardian', action: 'guardian.signal.zero_conversion',
        entityType: 'campaign', entityId: campaign.id,
        payload: { platform, spendCents, targetCplCents }, metadata: { mode: 'read_only' },
      });
    }
  }

  return { ok: reasons.length === 0, autoPaused: [], reason: reasons.join(' ') || undefined };
}
