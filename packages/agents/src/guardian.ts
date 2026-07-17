// Budget Guardian (CONTRACTS §8): caps, velocity anomaly, zero-conversion burn.
// Every enforcement action is audit-logged. checkSpend runs inside every gated
// ads tool before the adapter write.

import { and, eq } from 'drizzle-orm';
import { budgets, campaignsMirror } from '@voxmarketer/db';
import type { AdPlatform } from '@voxmarketer/integrations';
import type { AgentContext } from './types.js';
import { getOrgAdapter } from './store.js';
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
 * Periodic enforcement (worker poll): velocity anomaly auto-pause +
 * zero-conversion burn auto-pause. All actions audit-logged.
 */
export async function tick(ctx: AgentContext): Promise<GuardianVerdict> {
  const now = ctx.now ?? new Date();
  const autoPaused: string[] = [];
  const reasons: string[] = [];

  const allRows = await loadCampaigns(ctx);
  const platforms = [...new Set(allRows.map((r) => r.platform).filter((p): p is AdPlatform => Boolean(p)))];

  // 1. Velocity anomaly: projected month-end > monthly cap → pause the platform.
  const caps = await loadBudgetCaps(ctx);
  const spentThisMonth = totalSpend(allRows);
  if (caps.globalMonthly != null) {
    const projected = projectMonthEnd(spentThisMonth, activeDailyTotal(allRows), now);
    if (wouldExceed(caps.globalMonthly, projected) && activeDailyTotal(allRows) > 0) {
      for (const platform of platforms) {
        const paused = await pausePlatform(ctx, platform, 'spend-velocity anomaly: projected month-end spend exceeds the monthly cap');
        autoPaused.push(...paused);
      }
      reasons.push(`Auto-paused ${platforms.join(', ')} — projected spend $${(projected / 100).toFixed(0)} > cap $${(caps.globalMonthly / 100).toFixed(0)}.`);
    }
  }

  // 2. Zero-conversion burn: spend ≥ 3× target CPL with 0 conversions → pause campaign.
  const targetCplCents = 5000; // default; per-org override lands in settings
  for (const platform of platforms) {
    const rows = allRows.filter((r) => r.platform === platform && r.status === 'active');
    const burners = rows.filter((r) => {
      const m = metricsOf(r);
      return m.spendCents >= 3 * targetCplCents && m.conversions === 0;
    });
    if (burners.length > 0) {
      const adapter = await getOrgAdapter(ctx.db, ctx.orgId, platform);
      for (const b of burners) {
        const [mirror] = await ctx.db
          .select({ externalId: campaignsMirror.externalId, name: campaignsMirror.name })
          .from(campaignsMirror)
          .where(eq(campaignsMirror.id, b.id))
          .limit(1);
        if (!mirror?.externalId) continue;
        await adapter.pauseCampaign(mirror.externalId);
        autoPaused.push(b.id);
        await ctx.audit.log({
          actorType: 'agent',
          actorId: 'budget_guardian',
          action: 'guardian.auto_pause.zero_conversion',
          entityType: 'campaign',
          entityId: b.id,
          payload: { platform, externalId: mirror.externalId, name: mirror.name, spendCents: metricsOf(b).spendCents },
        });
        reasons.push(`Auto-paused "${mirror.name}" — $${(metricsOf(b).spendCents / 100).toFixed(0)} spent with no conversions.`);
      }
    }
  }

  return { ok: autoPaused.length === 0, autoPaused, reason: reasons.join(' ') || undefined };
}

async function pausePlatform(ctx: AgentContext, platform: AdPlatform, reason: string): Promise<string[]> {
  const adapter = await getOrgAdapter(ctx.db, ctx.orgId, platform);
  const active = await ctx.db
    .select({ id: campaignsMirror.id, externalId: campaignsMirror.externalId, name: campaignsMirror.name })
    .from(campaignsMirror)
    .where(and(eq(campaignsMirror.orgId, ctx.orgId), eq(campaignsMirror.platform, platform), eq(campaignsMirror.status, 'active')));
  const paused: string[] = [];
  for (const row of active) {
    if (!row.externalId) continue;
    await adapter.pauseCampaign(row.externalId);
    paused.push(row.id);
    await ctx.audit.log({
      actorType: 'agent',
      actorId: 'budget_guardian',
      action: 'guardian.auto_pause.velocity',
      entityType: 'campaign',
      entityId: row.id,
      payload: { platform, externalId: row.externalId, name: row.name, reason },
    });
  }
  return paused;
}
