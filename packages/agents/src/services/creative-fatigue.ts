import { eq, and, desc, sql } from 'drizzle-orm';
import { db, creativePerformance, alerts, campaignsMirror } from '@growthcrew/db';
import type { AgentContext } from '../types.js';

export interface FatigueSignal {
  creativeId: string;
  campaignId: string | null;
  platform: string;
  headline: string | null;
  severity: 'warning' | 'critical';
  signal: string;
  frequency: number;
  ctr: number;
  ctrChangePct: number;
  impressions: number;
  suggestedAction: string;
}

export interface FatigueReport {
  orgId: string;
  scannedCreatives: number;
  fatiguedCreatives: number;
  signals: FatigueSignal[];
  alertsCreated: number;
}

const FREQUENCY_WARNING = 3.0;
const FREQUENCY_CRITICAL = 5.0;
const CTR_DECLINE_WARNING = -20; // %
const CTR_DECLINE_CRITICAL = -40; // %

/**
 * Detect creative fatigue by comparing latest snapshot against the
 * creative's own historical average. Signals:
 *  - High frequency (audience seeing the same ad too often)
 *  - CTR decline vs. historical average
 *  - Zero conversions despite high spend
 */
export async function detectCreativeFatigue(ctx: AgentContext): Promise<FatigueReport> {
  const orgId = ctx.orgId;

  // Get the latest snapshot per creative
  const latestSnapshots = await db
    .selectDistinctOn([creativePerformance.creativeId], {
      creativeId: creativePerformance.creativeId,
      campaignId: creativePerformance.campaignId,
      platform: creativePerformance.platform,
      headline: creativePerformance.headline,
      impressions: creativePerformance.impressions,
      clicks: creativePerformance.clicks,
      spendCents: creativePerformance.spendCents,
      conversions: creativePerformance.conversions,
      frequency: creativePerformance.frequency,
      ctr: creativePerformance.ctr,
      snapshotAt: creativePerformance.snapshotAt,
    })
    .from(creativePerformance)
    .where(eq(creativePerformance.orgId, orgId))
    .orderBy(creativePerformance.creativeId, desc(creativePerformance.snapshotAt));

  const signals: FatigueSignal[] = [];

  for (const snap of latestSnapshots) {
    const freq = snap.frequency ?? 0;
    const ctr = snap.ctr ?? 0;
    const impressions = snap.impressions ?? 0;
    const spendCents = snap.spendCents ?? 0;
    const conversions = snap.conversions ?? 0;

    // Skip low-data creatives
    if (impressions < 1000) continue;

    // Get historical average CTR (excluding latest)
    const [histAvg] = await db
      .select({ avgCtr: sql<number>`avg(${creativePerformance.ctr})` })
      .from(creativePerformance)
      .where(
        and(
          eq(creativePerformance.orgId, orgId),
          eq(creativePerformance.creativeId, snap.creativeId),
          sql`${creativePerformance.snapshotAt} < ${snap.snapshotAt.toISOString()}::timestamp`,
        ),
      );

    const avgCtr = histAvg?.avgCtr ?? ctr;
    const ctrChangePct = avgCtr > 0 ? Math.round(((ctr - avgCtr) / avgCtr) * 100) : 0;

    let severity: 'warning' | 'critical' | null = null;
    let signal = '';
    let suggestedAction = '';

    // Frequency-based fatigue
    if (freq >= FREQUENCY_CRITICAL) {
      severity = 'critical';
      signal = `Frequency ${freq.toFixed(1)}x — audience saturation`;
      suggestedAction = 'Pause creative and rotate in fresh assets immediately';
    } else if (freq >= FREQUENCY_WARNING) {
      severity = 'warning';
      signal = `Frequency ${freq.toFixed(1)}x — approaching saturation`;
      suggestedAction = 'Prepare replacement creative; schedule rotation within 3 days';
    }

    // CTR decline fatigue
    if (!severity && ctrChangePct <= CTR_DECLINE_CRITICAL) {
      severity = 'critical';
      signal = `CTR dropped ${ctrChangePct}% vs. historical avg`;
      suggestedAction = 'Creative is burned — replace with new angles/formats';
    } else if (!severity && ctrChangePct <= CTR_DECLINE_WARNING) {
      severity = 'warning';
      signal = `CTR declined ${ctrChangePct}% vs. historical avg`;
      suggestedAction = 'Test new headlines/visuals; consider audience expansion';
    }

    // Zero-conversion fatigue
    if (!severity && spendCents >= 5000 && conversions === 0) {
      severity = 'critical';
      signal = `$${(spendCents / 100).toFixed(0)} spent with 0 conversions`;
      suggestedAction = 'Pause immediately — creative or targeting is fundamentally broken';
    }

    if (severity) {
      signals.push({
        creativeId: snap.creativeId,
        campaignId: snap.campaignId,
        platform: snap.platform ?? 'unknown',
        headline: snap.headline,
        severity,
        signal,
        frequency: freq,
        ctr,
        ctrChangePct,
        impressions,
        suggestedAction,
      });
    }
  }

  // Create alerts for fatigued creatives
  let alertsCreated = 0;
  for (const s of signals) {
    const [existing] = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(
          eq(alerts.orgId, orgId),
          eq(alerts.type, 'creative_fatigue'),
          sql`${alerts.metrics}->>'creativeId' = ${s.creativeId}`,
          sql`${alerts.createdAt} > now() - interval '24 hours'`,
        ),
      )
      .limit(1);

    if (existing) continue;

    await db.insert(alerts).values({
      orgId,
      type: 'creative_fatigue',
      severity: s.severity,
      title: `Creative fatigue: ${s.headline ?? s.creativeId}`,
      message: s.signal,
      campaignId: s.campaignId,
      platform: s.platform,
      metrics: {
        creativeId: s.creativeId,
        frequency: s.frequency,
        ctr: s.ctr,
        ctrChangePct: s.ctrChangePct,
        impressions: s.impressions,
      },
      suggestedAction: s.suggestedAction,
    });
    alertsCreated++;
  }

  return {
    orgId,
    scannedCreatives: latestSnapshots.length,
    fatiguedCreatives: signals.length,
    signals,
    alertsCreated,
  };
}

/** List creative fatigue signals (latest per creative). */
export async function listFatigueSignals(ctx: AgentContext) {
  const report = await detectCreativeFatigue(ctx);
  return report.signals;
}

/** Record a creative performance snapshot. */
export async function recordCreativeSnapshot(
  ctx: AgentContext,
  data: {
    creativeId: string;
    campaignId?: string;
    platform?: string;
    headline?: string;
    imageUrl?: string;
    impressions?: number;
    clicks?: number;
    spendCents?: number;
    conversions?: number;
    frequency?: number;
    ctr?: number;
  },
) {
  const [row] = await db
    .insert(creativePerformance)
    .values({
      orgId: ctx.orgId,
      creativeId: data.creativeId,
      campaignId: data.campaignId ?? null,
      platform: data.platform ?? null,
      headline: data.headline ?? null,
      imageUrl: data.imageUrl ?? null,
      impressions: data.impressions ?? 0,
      clicks: data.clicks ?? 0,
      spendCents: data.spendCents ?? 0,
      conversions: data.conversions ?? 0,
      frequency: data.frequency ?? 0,
      ctr: data.ctr ?? 0,
    })
    .returning();
  return row;
}
