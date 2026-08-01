// Anomaly detection service: scans campaign metrics and generates alerts.

import { and, desc, eq, gte } from 'drizzle-orm';
import { alerts, campaignsMirror, budgets, type AlertSeverity, type AlertType } from '@growthcrew/db';
import type { AgentContext } from '../types.js';
import type { MirrorMetrics } from '../store.js';

export interface AnomalyAlert {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  campaignId?: string;
  platform?: string;
  metrics?: Record<string, unknown>;
  suggestedAction?: string;
}

interface CampaignRow {
  id: string;
  name: string | null;
  platform: string | null;
  status: string | null;
  budgetDailyCents: number | null;
  metrics: unknown;
}

function metricsOf(row: CampaignRow): MirrorMetrics {
  const m = row.metrics as Partial<MirrorMetrics> | null;
  return {
    impressions: m?.impressions ?? 0,
    clicks: m?.clicks ?? 0,
    spendCents: m?.spendCents ?? 0,
    conversions: m?.conversions ?? 0,
    history: m?.history ?? [],
  };
}

/**
 * Detect anomalies across all active campaigns for an org.
 * Returns a list of alerts to be persisted.
 */
export async function detectAnomalies(ctx: AgentContext): Promise<AnomalyAlert[]> {
  const campaigns = await ctx.db
    .select({
      id: campaignsMirror.id,
      name: campaignsMirror.name,
      platform: campaignsMirror.platform,
      status: campaignsMirror.status,
      budgetDailyCents: campaignsMirror.budgetDailyCents,
      metrics: campaignsMirror.metrics,
    })
    .from(campaignsMirror)
    .where(and(eq(campaignsMirror.orgId, ctx.orgId), eq(campaignsMirror.status, 'active')));

  const detected: AnomalyAlert[] = [];

  for (const campaign of campaigns) {
    const m = metricsOf(campaign);
    const platform = campaign.platform ?? 'unknown';
    const name = campaign.name ?? 'Unnamed campaign';

    // 1. Zero conversions with significant spend
    if (m.spendCents >= 15000 && m.conversions === 0) {
      detected.push({
        type: 'zero_conversions',
        severity: 'critical',
        title: `${name}: $${(m.spendCents / 100).toFixed(0)} spent, 0 conversions`,
        message: `Campaign "${name}" on ${platform} has spent $${(m.spendCents / 100).toFixed(0)} with zero conversions. This indicates targeting, creative, or landing page issues.`,
        campaignId: campaign.id,
        platform,
        metrics: { spendCents: m.spendCents, conversions: m.conversions, impressions: m.impressions, clicks: m.clicks },
        suggestedAction: 'Pause campaign and audit targeting + landing page. Consider A/B testing new creative.',
      });
    }

    // 2. CTR drop (below 0.5% with meaningful impressions)
    if (m.impressions >= 1000) {
      const ctr = m.clicks / m.impressions;
      if (ctr < 0.005) {
        detected.push({
          type: 'ctr_drop',
          severity: 'warning',
          title: `${name}: Low CTR (${(ctr * 100).toFixed(2)}%)`,
          message: `Campaign "${name}" has a click-through rate of ${(ctr * 100).toFixed(2)}% (${m.clicks} clicks from ${m.impressions.toLocaleString()} impressions). Industry average is 1-3%.`,
          campaignId: campaign.id,
          platform,
          metrics: { ctr, impressions: m.impressions, clicks: m.clicks },
          suggestedAction: 'Refresh ad creative or tighten audience targeting. Test new headlines and CTAs.',
        });
      }
    }

    // 3. CPC spike (above $10 for non-enterprise campaigns)
    if (m.clicks > 0) {
      const cpcCents = m.spendCents / m.clicks;
      if (cpcCents > 1000) {
        detected.push({
          type: 'cpc_spike',
          severity: 'warning',
          title: `${name}: High CPC ($${(cpcCents / 100).toFixed(2)})`,
          message: `Campaign "${name}" is paying $${(cpcCents / 100).toFixed(2)} per click. This is above the $10 threshold and may indicate high competition or poor quality score.`,
          campaignId: campaign.id,
          platform,
          metrics: { cpcCents, clicks: m.clicks, spendCents: m.spendCents },
          suggestedAction: 'Improve ad relevance and landing page experience to boost quality score. Consider long-tail keywords.',
        });
      }
    }

    // 4. Spend velocity (daily budget will exhaust early)
    const now = ctx.now ?? new Date();
    const hoursElapsed = now.getHours() + now.getMinutes() / 60;
    const dailyBudget = campaign.budgetDailyCents ?? 0;
    if (dailyBudget > 0 && hoursElapsed > 0) {
      const projectedDailySpend = (m.spendCents / hoursElapsed) * 24;
      if (projectedDailySpend > dailyBudget * 1.5) {
        detected.push({
          type: 'spend_velocity',
          severity: 'warning',
          title: `${name}: Spending ${(projectedDailySpend / dailyBudget).toFixed(1)}x faster than budget`,
          message: `Campaign "${name}" is projected to spend $${(projectedDailySpend / 100).toFixed(0)} today vs a $${(dailyBudget / 100).toFixed(0)} daily budget. At this rate, budget will exhaust by ${Math.round((dailyBudget / projectedDailySpend) * 24)}:00.`,
          campaignId: campaign.id,
          platform,
          metrics: { projectedDailySpend, dailyBudget, currentSpend: m.spendCents },
          suggestedAction: 'Lower bids or add ad scheduling to spread spend across the day.',
        });
      }
    }
  }

  // 5. Budget cap approaching (org-level)
  const orgBudgets = await ctx.db.select().from(budgets).where(eq(budgets.orgId, ctx.orgId));
  const monthlyCap = orgBudgets.find((b) => b.scope === 'global' && b.period === 'monthly')?.capCents;
  if (monthlyCap) {
    const totalSpend = campaigns.reduce((sum, c) => sum + metricsOf(c).spendCents, 0);
    const utilization = totalSpend / monthlyCap;
    if (utilization > 0.85) {
      detected.push({
        type: 'budget_cap_near',
        severity: utilization > 0.95 ? 'critical' : 'warning',
        title: `Monthly budget ${(utilization * 100).toFixed(0)}% utilized`,
        message: `Your organization has spent $${(totalSpend / 100).toFixed(0)} of the $${(monthlyCap / 100).toFixed(0)} monthly cap (${(utilization * 100).toFixed(0)}%). ${utilization > 0.95 ? 'Campaigns will auto-pause when the cap is reached.' : 'Consider raising the cap or pausing low-performing campaigns.'}`,
        metrics: { totalSpend, monthlyCap, utilization },
        suggestedAction: utilization > 0.95 ? 'Raise monthly budget cap or accept auto-pause.' : 'Review campaign performance and reallocate budget to top performers.',
      });
    }
  }

  return detected;
}

/**
 * Run anomaly detection and persist new alerts (deduped by type+campaignId within 24h).
 */
export async function runAnomalyDetection(ctx: AgentContext): Promise<{ created: number; alerts: AnomalyAlert[] }> {
  const detected = await detectAnomalies(ctx);
  const now = ctx.now ?? new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Load recent alerts to dedupe
  const recent = await ctx.db
    .select({ type: alerts.type, campaignId: alerts.campaignId })
    .from(alerts)
    .where(and(eq(alerts.orgId, ctx.orgId), gte(alerts.createdAt, oneDayAgo)));

  const recentKeys = new Set(recent.map((r) => `${r.type}:${r.campaignId ?? 'org'}`));

  const toInsert = detected.filter((a) => !recentKeys.has(`${a.type}:${a.campaignId ?? 'org'}`));

  if (toInsert.length > 0) {
    await ctx.db.insert(alerts).values(
      toInsert.map((a) => ({
        orgId: ctx.orgId,
        type: a.type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        campaignId: a.campaignId ?? null,
        platform: a.platform ?? null,
        metrics: a.metrics ?? null,
        suggestedAction: a.suggestedAction ?? null,
      })),
    );

    await ctx.audit.log({
      actorType: 'agent',
      actorId: 'anomaly_detector',
      action: 'alerts.created',
      entityType: 'alert',
      entityId: 'batch',
      payload: { count: toInsert.length, types: toInsert.map((a) => a.type) },
    });
  }

  return { created: toInsert.length, alerts: toInsert };
}

/**
 * List alerts for an org, optionally filtered by acknowledged status.
 */
export async function listAlerts(
  ctx: AgentContext,
  opts?: { unacknowledgedOnly?: boolean; limit?: number },
) {
  const conditions = [eq(alerts.orgId, ctx.orgId)];
  if (opts?.unacknowledgedOnly) {
    conditions.push(eq(alerts.acknowledged, false));
  }

  return ctx.db
    .select()
    .from(alerts)
    .where(and(...conditions))
    .orderBy(desc(alerts.createdAt))
    .limit(opts?.limit ?? 50);
}

/**
 * Acknowledge an alert.
 */
export async function acknowledgeAlert(ctx: AgentContext, alertId: string) {
  const now = ctx.now ?? new Date();
  const [updated] = await ctx.db
    .update(alerts)
    .set({ acknowledged: true, acknowledgedAt: now })
    .where(and(eq(alerts.id, alertId), eq(alerts.orgId, ctx.orgId)))
    .returning();

  if (!updated) throw new Error('Alert not found');

  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'alert.acknowledged',
    entityType: 'alert',
    entityId: alertId,
    payload: { type: updated.type, title: updated.title },
  });

  return updated;
}
