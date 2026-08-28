// Dashboard services (CONTRACTS §5): unified overview, activity feed, SEO tracker.

import { desc, eq, like, and } from 'drizzle-orm';
import { agentRuns, agents, auditLogs, campaignsMirror, organizations, websites } from '@growthcrew/db';
import { type AdPlatform } from '@growthcrew/integrations';
import { getOrgGscQueries } from '../live.js';
import type { AgentContext } from '../types.js';
import type { MirrorMetrics } from '../store.js';
import { tick as guardianTick } from '../guardian.js';
import { getOrgAdapter } from '../store.js';
import { DEMO_CAMPAIGNS, demoHistory, isDemoDataEnabled } from './demo-data.js';

interface Totals {
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface OverviewTotals extends Totals {
  ctr: number; // 0..1
  cpcCents: number;
  cplCents: number;
  roas: number;
}

function derive(t: Totals, avgConversionValueCents: number): OverviewTotals {
  return {
    ...t,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
    cpcCents: t.clicks > 0 ? Math.round(t.spendCents / t.clicks) : 0,
    cplCents: t.conversions > 0 ? Math.round(t.spendCents / t.conversions) : 0,
    roas: t.spendCents > 0 ? Math.round(((t.conversions * avgConversionValueCents) / t.spendCents) * 100) / 100 : 0,
  };
}

function metricsOf(row: { metrics: unknown }): Totals {
  const m = row.metrics as Partial<MirrorMetrics> | null;
  return {
    impressions: m?.impressions ?? 0,
    clicks: m?.clicks ?? 0,
    spendCents: m?.spendCents ?? 0,
    conversions: m?.conversions ?? 0,
  };
}

export interface OverviewResult {
  totals: OverviewTotals;
  byPlatform: Record<string, OverviewTotals>;
  series: { date: string; spendCents: number; clicks: number; conversions: number }[];
  campaigns: number;
  /** True when the numbers are simulated (demo-data mode) and must be labeled as such. */
  demoData: boolean;
  /** Provenance of rows in campaigns_mirror; never infer live data from non-empty numbers alone. */
  dataSource: 'none' | 'live' | 'sandbox' | 'mixed' | 'demo';
}

function dataSourceForRows(rows: Array<{ mode: string | null }>): OverviewResult['dataSource'] {
  const modes = new Set(rows.map((row) => (row.mode === 'live' ? 'live' : 'sandbox')));
  if (modes.size === 0) return 'none';
  if (modes.size > 1) return 'mixed';
  return modes.has('live') ? 'live' : 'sandbox';
}

/** Deterministic simulated KPIs for demo-data orgs (see ./demo-data.ts). */
function demoOverview(now: Date, range: { from?: string; to?: string } | undefined, avgValue: number): OverviewResult {
  const byPlatform: Record<string, Totals> = {};
  for (const c of DEMO_CAMPAIGNS) {
    byPlatform[c.platform] ??= { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 };
    byPlatform[c.platform]!.impressions += c.impressions;
    byPlatform[c.platform]!.clicks += c.clicks;
    byPlatform[c.platform]!.spendCents += c.spendCents;
    byPlatform[c.platform]!.conversions += c.conversions;
  }
  const totals = Object.values(byPlatform).reduce<Totals>(
    (acc, p) => ({
      impressions: acc.impressions + p.impressions,
      clicks: acc.clicks + p.clicks,
      spendCents: acc.spendCents + p.spendCents,
      conversions: acc.conversions + p.conversions,
    }),
    { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 },
  );
  const series = demoHistory(now)
    .filter((p) => (!range?.from || p.date >= range.from) && (!range?.to || p.date <= range.to))
    .map((p) => ({ date: p.date, spendCents: p.spendCents, clicks: p.clicks, conversions: p.conversions }));
  const byPlatformDerived: Record<string, OverviewTotals> = {};
  for (const [p, t] of Object.entries(byPlatform)) byPlatformDerived[p] = derive(t, avgValue);
  return {
    totals: derive(totals, avgValue),
    byPlatform: byPlatformDerived,
    series,
    campaigns: DEMO_CAMPAIGNS.length,
    demoData: true,
    dataSource: 'demo',
  };
}

export async function overview(ctx: AgentContext, range?: { from?: string; to?: string }): Promise<OverviewResult> {
  const [org] = await ctx.db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);
  const avgValue =
    ((org?.settings as Record<string, unknown> | undefined)?.avgConversionValueCents as number | undefined) ?? 10000;

  // Demo-data mode: simulated KPIs, always labeled in the UI (never silent).
  if (isDemoDataEnabled(org?.settings)) {
    return demoOverview(ctx.now ?? new Date(), range, avgValue);
  }

  const rows = await ctx.db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, ctx.orgId));

  const byPlatform: Record<string, Totals> = {};
  const seriesByDate = new Map<string, Totals>();
  for (const row of rows) {
    const p = row.platform ?? 'unknown';
    const t = metricsOf(row);
    byPlatform[p] ??= { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 };
    byPlatform[p]!.impressions += t.impressions;
    byPlatform[p]!.clicks += t.clicks;
    byPlatform[p]!.spendCents += t.spendCents;
    byPlatform[p]!.conversions += t.conversions;

    const history = (row.metrics as Partial<MirrorMetrics> | null)?.history ?? [];
    for (const point of history) {
      if (range?.from && point.date < range.from) continue;
      if (range?.to && point.date > range.to) continue;
      const acc = seriesByDate.get(point.date) ?? { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 };
      acc.impressions += point.impressions ?? 0;
      acc.clicks += point.clicks ?? 0;
      acc.spendCents += point.spendCents ?? 0;
      acc.conversions += point.conversions ?? 0;
      seriesByDate.set(point.date, acc);
    }
  }

  const totals = Object.values(byPlatform).reduce<Totals>(
    (acc, p) => ({
      impressions: acc.impressions + p.impressions,
      clicks: acc.clicks + p.clicks,
      spendCents: acc.spendCents + p.spendCents,
      conversions: acc.conversions + p.conversions,
    }),
    { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 },
  );

  const series = [...seriesByDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, t]) => ({ date, spendCents: t.spendCents, clicks: t.clicks, conversions: t.conversions }));

  const byPlatformDerived: Record<string, OverviewTotals> = {};
  for (const [p, t] of Object.entries(byPlatform)) byPlatformDerived[p] = derive(t, avgValue);

  return {
    totals: derive(totals, avgValue),
    byPlatform: byPlatformDerived,
    series,
    campaigns: rows.length,
    demoData: false,
    dataSource: dataSourceForRows(rows),
  };
}

export interface ActivityItem {
  id: string;
  at: Date;
  kind: 'agent_run' | 'guardian';
  actor: string;
  text: string;
  status: string | null;
}

const GUARDIAN_TEXT: Record<string, string> = {
  'guardian.auto_pause.velocity': 'Budget Guardian auto-paused campaigns — projected spend was heading over the monthly cap.',
  'guardian.auto_pause.zero_conversion': 'Budget Guardian auto-paused a campaign — spend with no conversions.',
};

export async function activityFeed(ctx: AgentContext, limit = 20): Promise<ActivityItem[]> {
  const runs = await ctx.db
    .select({
      id: agentRuns.id,
      createdAt: agentRuns.createdAt,
      input: agentRuns.input,
      output: agentRuns.output,
      status: agentRuns.status,
      agentName: agents.name,
    })
    .from(agentRuns)
    .leftJoin(agents, eq(agentRuns.agentId, agents.id))
    .where(eq(agentRuns.orgId, ctx.orgId))
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit);

  const guardianRows = await ctx.db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.orgId, ctx.orgId), like(auditLogs.action, 'guardian.%')))
    .orderBy(desc(auditLogs.createdAt))
    .limit(10);

  const items: ActivityItem[] = [
    ...runs.map(
      (r): ActivityItem => ({
        id: r.id,
        at: r.createdAt,
        kind: 'agent_run',
        actor: r.agentName ?? 'Agent',
        text: r.output ?? r.input ?? 'Working…',
        status: r.status,
      }),
    ),
    ...guardianRows.map(
      (g): ActivityItem => ({
        id: g.id,
        at: g.createdAt,
        kind: 'guardian',
        actor: 'Budget Guardian',
        text: GUARDIAN_TEXT[g.action ?? ''] ?? `Budget Guardian: ${g.action}`,
        status: null,
      }),
    ),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export interface SeoTrackerResult {
  url: string | null;
  score: number | null;
  history: { date: string; score: number }[];
  rankings: { keyword: string; position: number; clicks: number; impressions: number }[];
  cwv: { lcpMs: number | null; cls: number | null; inpMs: number | null; fcpMs: number | null } | null;
  missingMetaDescriptions: number | null;
  hasLeadForm: boolean | null;
  lastCrawledAt: Date | null;
}

export async function seoTracker(ctx: AgentContext): Promise<SeoTrackerResult> {
  const [site] = await ctx.db.select().from(websites).where(eq(websites.orgId, ctx.orgId)).limit(1);
  const [org] = await ctx.db
    .select({ settings: organizations.settings, websiteUrl: organizations.websiteUrl })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);

  const history =
    ((org?.settings as Record<string, unknown> | undefined)?.seoScoreHistory as { date: string; score: number }[] | undefined) ?? [];
  const audit = site?.crawl as
    | {
        score?: number;
        pagespeed?: { cwv?: SeoTrackerResult['cwv'] };
        crawl?: { missingMetaDescriptions?: number; hasLeadForm?: boolean };
      }
    | null
    | undefined;

  const url = site?.url ?? org?.websiteUrl ?? null;
  const rankings = url
    ? (await getOrgGscQueries(ctx.db, ctx.orgId, url)).map((q) => ({
        keyword: q.query,
        position: q.position,
        clicks: q.clicks,
        impressions: q.impressions,
      }))
    : [];

  return {
    url,
    score: history.length > 0 ? history[history.length - 1]!.score : (audit?.score ?? null),
    history,
    rankings,
    cwv: audit?.pagespeed?.cwv ?? null,
    missingMetaDescriptions: audit?.crawl?.missingMetaDescriptions ?? null,
    hasLeadForm: audit?.crawl?.hasLeadForm ?? null,
    lastCrawledAt: site?.lastCrawledAt ?? null,
  };
}

/**
 * Dev "simulate" fallback (CONTRACTS §11): poll mock metrics for every active
 * campaign (persists + mirrors via the adapter store), then run a Guardian tick.
 */
export async function simulateTick(ctx: AgentContext): Promise<{ polled: number; guardian: string[] }> {
  const rows = await ctx.db
    .select({ platform: campaignsMirror.platform, externalId: campaignsMirror.externalId })
    .from(campaignsMirror)
    .where(and(eq(campaignsMirror.orgId, ctx.orgId), eq(campaignsMirror.status, 'active')));
  let polled = 0;
  const adapters = new Map<string, Awaited<ReturnType<typeof getOrgAdapter>>>();
  for (const row of rows) {
    if (!row.platform || !row.externalId) continue;
    let adapter = adapters.get(row.platform);
    if (!adapter) {
      adapter = await getOrgAdapter(ctx.db, ctx.orgId, row.platform as AdPlatform);
      adapters.set(row.platform, adapter);
    }
    await adapter.getMetrics(row.externalId);
    polled++;
  }
  const verdict = await guardianTick(ctx);
  return { polled, guardian: verdict.autoPaused ?? [] };
}
