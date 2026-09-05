import { getCampaignSnapshot } from './sync-evidence.js';
// Weekly reports (Phase 3, CONTRACTS §4/§11): aggregates the last 7 days of
// campaigns_mirror metric history into a stored `reports` row, and — when
// RESEND_API_KEY is configured — emails it to org owners via the Resend
// adapter. Without a key it logs-only, per the zero-config rule (§3).

import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import {
  alerts,
  campaignsMirror,
  creativePerformance,
  organizations,
  orgMembers,
  reports,
  users,
  weeklyReports,
  type Db,
  type Report,
  type WeeklyReportPayload,
} from '@growthcrew/db';
import {
  renderWeeklyReportEmail,
  sendEmail,
  type FetchLike,
  type WeeklyReportContent,
} from '@growthcrew/integrations';
import { createAuditLogger } from '../audit.js';
import { createAgentContext } from '../context.js';
import { isWithinBudget, recordUsage } from './llm-usage.js';
import { track } from './analytics.js';
import {
  DEMO_CAMPAIGNS,
  DEMO_DATA_LABEL,
  demoBurningCampaigns,
  demoCampaignRows,
  demoPrevWeeklyTotals,
  demoTotalsByPlatform,
  demoWeeklyTotals,
  isDemoDataEnabled,
} from './demo-data.js';
import type { AgentContext } from '../types.js';

interface HistoryPoint {
  date: string;
  impressions: number;
  clicks: number;
  spendCents: number;
  conversions: number;
}

export interface WeeklyTotals {
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface WeeklyReportBuild {
  report: Report;
  content: WeeklyReportContent & { byPlatform: Record<string, WeeklyTotals> };
}

function dayMs(n: number): number {
  return n * 86_400_000;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function snapshotTotals(value: unknown): WeeklyTotals {
  const m = value as Partial<WeeklyTotals> | null;
  return { spendCents: m?.spendCents ?? 0, impressions: m?.impressions ?? 0, clicks: m?.clicks ?? 0, conversions: m?.conversions ?? 0 };
}

function sumWindow(history: HistoryPoint[], from: string, to: string): WeeklyTotals {
  const totals: WeeklyTotals = { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 };
  for (const h of history) {
    if (h.date < from || h.date > to) continue;
    totals.spendCents += h.spendCents ?? 0;
    totals.impressions += h.impressions ?? 0;
    totals.clicks += h.clicks ?? 0;
    totals.conversions += h.conversions ?? 0;
  }
  return totals;
}

/** Build + persist the weekly report for one org. `now` injectable for tests. */
export async function buildWeeklyReport(ctx: AgentContext, now: Date = ctx.now ?? new Date()): Promise<WeeklyReportBuild> {
  const periodEnd = isoDay(now);
  const periodStart = isoDay(new Date(now.getTime() - dayMs(7)));
  const prevStart = isoDay(new Date(now.getTime() - dayMs(14)));

  const [orgRow] = await ctx.db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);
  const demo = isDemoDataEnabled(orgRow?.settings);

  // Demo-data mode: aggregate the deterministic simulated dataset instead of
  // the org's (empty) campaigns_mirror rows. The label travels in
  // content.demoData and is rendered by the email template.
  const campaigns = demo
    ? demoCampaignRows(now)
    : await getCampaignSnapshot(ctx);
  const totals: WeeklyTotals = { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 };
  const prevTotals: WeeklyTotals = { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 };
  const byPlatform: Record<string, WeeklyTotals> = {};

  for (const c of campaigns) {
    const metrics = c.metrics as { history?: HistoryPoint[] } | null;
    const history = metrics?.history ?? [];
    const week = c.mode === 'live' ? snapshotTotals(c.metrics) : sumWindow(history, periodStart, periodEnd);
    const prev = c.mode === 'live' ? { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 } : sumWindow(history, prevStart, isoDay(new Date(new Date(periodStart).getTime() - dayMs(1))));
    for (const k of Object.keys(totals) as (keyof WeeklyTotals)[]) {
      totals[k] += week[k];
      prevTotals[k] += prev[k];
    }
    const platform = c.platform ?? 'unknown';
    byPlatform[platform] = byPlatform[platform] ?? { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 };
    for (const k of Object.keys(week) as (keyof WeeklyTotals)[]) byPlatform[platform]![k] += week[k];
  }

  const highlights: string[] = [];
  const platforms = Object.entries(byPlatform).filter(([, t]) => t.conversions > 0);
  if (platforms.length > 0) {
    const [bestPlatform, best] = platforms.reduce((a, b) =>
      a[1].spendCents / a[1].conversions <= b[1].spendCents / b[1].conversions ? a : b,
    );
    highlights.push(
      `${bestPlatform} brought leads at $${(best.spendCents / best.conversions / 100).toFixed(2)} each — your best this week.`,
    );
  }
  if (prevTotals.spendCents > 0 && totals.spendCents > 0) {
    const delta = Math.round(((totals.spendCents - prevTotals.spendCents) / prevTotals.spendCents) * 100);
    if (Math.abs(delta) >= 10) {
      highlights.push(`Spend ${delta > 0 ? 'rose' : 'fell'} ${Math.abs(delta)}% vs the week before.`);
    }
  }
  const burning = campaigns.filter((c) => {
    const m = c.metrics as { spendCents?: number; conversions?: number } | null;
    return (m?.conversions ?? 0) === 0 && (m?.spendCents ?? 0) > 0;
  });
  if (burning.length > 0) {
    highlights.push(`${burning.length} campaign${burning.length === 1 ? ' has' : 's have'} spend without conversions — worth a look.`);
  }
  if (highlights.length === 0) {
    highlights.push('A quiet week — nothing needed your attention.');
  }

  const content = {
    summary:
      !demo && campaigns.length === 0
        ? 'No campaign data is available yet. Connect a read-only ad account and run a live sync before treating this report as customer evidence.'
        : totals.spendCents > 0
        ? `This week you spent $${(totals.spendCents / 100).toFixed(2)} for ${totals.conversions} conversion${totals.conversions === 1 ? '' : 's'}.`
        : 'No ad spend this week.',
    highlights,
    totals,
    byPlatform,
    periodLabel: `${periodStart} → ${periodEnd}`,
    // Surfaces rendering this report MUST show DEMO_DATA_LABEL when set.
    demoData: demo ? true : undefined,
    dataSource: demo ? 'demo' : dataSourceForCampaigns(campaigns),
    sourceSyncs: demo ? [] : sourceSyncsFor(campaigns),
    metricBasis: campaigns.some((c) => c.mode === 'live') ? LIVE_METRIC_BASIS : 'Daily sandbox history for the report period.',
  };

  // LLM narrative (publication-grade): live providers rewrite the summary in
  // plain language; any failure keeps the deterministic text (CONTRACTS §3).
  // Demo mode stays fully deterministic.
  if (!demo && ctx.llm.name !== 'mock') {
    try {
      const res = await ctx.llm.chat(
        [
          {
            role: 'system',
            content:
              'You write one-paragraph weekly marketing summaries for small-business owners. ' +
              'Plain language, no jargon, no hype, 2–3 sentences. Use only the numbers given — never invent results.',
          },
          {
            role: 'user',
            content:
              `Week ${content.periodLabel}: spend USD ${(totals.spendCents / 100).toFixed(2)}, ` +
              `${totals.impressions} impressions, ${totals.clicks} clicks, ${totals.conversions} conversions. ` +
              `Highlights: ${highlights.join(' | ')}`,
          },
        ],
        { maxTokens: 220, temperature: 0.4 },
      );
      const narrative = res.content.trim().replace(/\s+/g, ' ');
      if (narrative.length > 20) content.summary = narrative;
    } catch {
      // deterministic summary stays
    }
  }

  const [report] = await ctx.db
    .insert(reports)
    .values({ orgId: ctx.orgId, type: 'weekly', content, periodStart: new Date(periodStart), periodEnd: now })
    .returning();
  await ctx.audit.log({
    actorType: 'system',
    actorId: 'weekly-report',
    action: 'report.generated',
    entityType: 'report',
    entityId: report!.id,
    payload: { type: 'weekly', periodStart, periodEnd, totals },
  });
  return { report: report!, content };
}

// ---------------------------------------------------------------------------
// Batch runner (cron route + worker email queue)
// ---------------------------------------------------------------------------

export interface WeeklyReportsRun {
  orgs: number;
  reports: number;
  emailed: number;
  emailSkipped: boolean;
  errors: string[];
}

/**
 * Build this week's report for every org; email owners when RESEND_API_KEY is
 * set (log-only otherwise — CONTRACTS §3 graceful degradation).
 */
export async function runWeeklyReportsForAllOrgs(
  db: Db,
  opts?: { env?: NodeJS.ProcessEnv; fetchImpl?: FetchLike; now?: Date },
): Promise<WeeklyReportsRun> {
  const env = opts?.env ?? process.env;
  const apiKey = env.RESEND_API_KEY ?? '';
  const from = env.EMAIL_FROM ?? 'GrowthCrew <reports@growthcrew.dev>';
  const now = opts?.now ?? new Date();

  const orgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
  const run: WeeklyReportsRun = { orgs: orgs.length, reports: 0, emailed: 0, emailSkipped: !apiKey, errors: [] };

  for (const org of orgs) {
    const ctx = createAgentContext({ db, orgId: org.id });
    try {
      const { content } = await buildWeeklyReport(ctx, now);
      run.reports += 1;
      if (!apiKey) continue;

      const owners = await db
        .select({ email: users.email })
        .from(orgMembers)
        .innerJoin(users, eq(users.id, orgMembers.userId))
        .where(and(eq(orgMembers.orgId, org.id), inArray(orgMembers.role, ['owner', 'admin'])));
      const to = owners.map((o) => o.email).filter((e): e is string => Boolean(e));
      if (to.length === 0) continue;

      const result = await sendEmail({
        apiKey,
        from,
        to,
        subject: `Your week at ${org.name} — GrowthCrew report`,
        html: renderWeeklyReportEmail(org.name, content),
        fetchImpl: opts?.fetchImpl,
      });
      run.emailed += 1;
      await createAuditLogger(db, org.id).log({
        actorType: 'system',
        actorId: 'weekly-report',
        action: 'report.emailed',
        entityType: 'org',
        entityId: org.id,
        payload: { to: to.length, emailId: result.id },
      });
      await track(ctx, 'report_emailed', { to: to.length });
    } catch (err) {
      run.errors.push(`${org.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return run;
}

// ---------------------------------------------------------------------------
// In-app weekly report engine (the /reports surface)
// ---------------------------------------------------------------------------
// Two-stage build: (1) deterministic aggregation of campaigns, alerts, and
// creative-fatigue snapshots — always runs, costs $0; (2) an optional LLM
// narrative that rewrites the brief in plain language, metered and gated by
// the org's monthly budget cap (same `isWithinBudget` guardrail the
// orchestrator uses). Any LLM failure — or a mock provider, or an exhausted
// budget — falls back to the deterministic markdown, so a report is always
// produced and stored.

/** Monday 00:00 (UTC) of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const diff = (date.getUTCDay() + 6) % 7; // days elapsed since Monday
  date.setUTCDate(date.getUTCDate() - diff);
  return date;
}

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

type SourceSync = { platform: string; externalAccountId: string; syncedAt: string };
const LIVE_METRIC_BASIS = 'Latest provider snapshots, not summed daily totals. Google Ads: LAST_30_DAYS (excludes sync day); Meta: last_30d; TikTok: sync day minus 30 days through sync day. Sandbox rows, if present, use the report period.';
function sourceSyncsFor(campaigns: Array<{ platform: string | null; mode: string | null; metrics: unknown }>): SourceSync[] {
  const entries = new Map<string, SourceSync>();
  for (const c of campaigns) {
    const m = c.metrics as { externalAccountId?: string; syncedAt?: string } | null;
    if (c.mode !== 'live' || !m?.externalAccountId || !m.syncedAt) continue;
    const entry = { platform: c.platform ?? 'unknown', externalAccountId: m.externalAccountId, syncedAt: m.syncedAt };
    entries.set(JSON.stringify(entry), entry);
  }
  return [...entries.values()];
}

export interface WeekAggregation {
  sourceSyncs?: SourceSync[];
  metricBasis?: string;
  periodLabel: string;
  totals: WeeklyTotals;
  prevTotals: WeeklyTotals;
  byPlatform: Record<string, WeeklyTotals>;
  campaignCount: number;
  activeCampaigns: number;
  burningCampaigns: number;
  bestPlatform: { platform: string; cpaCents: number } | null;
  alerts: { total: number; critical: number; warning: number; notable: string[] };
  fatiguedCreatives: number;
  fatigueExamples: string[];
  dataSource: 'none' | 'live' | 'sandbox' | 'mixed' | 'demo';
}

function dataSourceForCampaigns(campaigns: Array<{ mode?: string | null }>): WeekAggregation['dataSource'] {
  const modes = new Set(campaigns.map((campaign) => (campaign.mode === 'live' ? 'live' : 'sandbox')));
  if (modes.size === 0) return 'none';
  if (modes.size > 1) return 'mixed';
  return modes.has('live') ? 'live' : 'sandbox';
}

/**
 * Deterministic simulated week for demo-data orgs (see ./demo-data.ts):
 * three campaigns, believable totals and deltas, and one warning alert.
 */
function demoWeekAggregation(weekStart: Date, now: Date): WeekAggregation {
  const totals = demoWeeklyTotals();
  const byPlatform = demoTotalsByPlatform();
  let bestPlatform: WeekAggregation['bestPlatform'] = null;
  for (const [platform, t] of Object.entries(byPlatform)) {
    if (t.conversions <= 0) continue;
    const cpaCents = t.spendCents / t.conversions;
    if (!bestPlatform || cpaCents < bestPlatform.cpaCents) bestPlatform = { platform, cpaCents };
  }
  const burning = demoBurningCampaigns();
  return {
    periodLabel: `${isoDay(weekStart)} → ${isoDay(now)}`,
    totals,
    prevTotals: demoPrevWeeklyTotals(),
    byPlatform,
    campaignCount: DEMO_CAMPAIGNS.length,
    activeCampaigns: DEMO_CAMPAIGNS.filter((c) => c.status === 'active').length,
    burningCampaigns: burning.length,
    bestPlatform,
    alerts: {
      total: burning.length > 0 ? 1 : 0,
      critical: 0,
      warning: burning.length > 0 ? 1 : 0,
      notable: burning.map((c) => `Demo: "${c.name}" is spending without conversions`),
    },
    fatiguedCreatives: 0,
    fatigueExamples: [],
    dataSource: 'demo',
  };
}

/** Pull the org's last-7-days performance into a single deterministic shape. */
async function aggregateWeek(ctx: AgentContext, weekStart: Date, now: Date): Promise<WeekAggregation> {
  const periodStart = isoDay(weekStart);
  const periodEnd = isoDay(now);
  const prevStart = isoDay(new Date(weekStart.getTime() - dayMs(7)));

  const campaigns = await getCampaignSnapshot(ctx);

  const totals: WeeklyTotals = { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 };
  const prevTotals: WeeklyTotals = { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 };
  const byPlatform: Record<string, WeeklyTotals> = {};
  let activeCampaigns = 0;
  let burningCampaigns = 0;

  for (const c of campaigns) {
    const metrics = c.metrics as { history?: HistoryPoint[]; spendCents?: number; conversions?: number } | null;
    const history = metrics?.history ?? [];
    const week = c.mode === 'live' ? snapshotTotals(c.metrics) : sumWindow(history, periodStart, periodEnd);
    const prev = c.mode === 'live' ? { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 } : sumWindow(history, prevStart, isoDay(new Date(new Date(periodStart).getTime() - dayMs(1))));
    for (const k of Object.keys(totals) as (keyof WeeklyTotals)[]) {
      totals[k] += week[k];
      prevTotals[k] += prev[k];
    }
    if (c.status === 'active') activeCampaigns += 1;
    if (week.conversions === 0 && week.spendCents > 0) burningCampaigns += 1;
    const platform = c.platform ?? 'unknown';
    byPlatform[platform] = byPlatform[platform] ?? { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 };
    for (const k of Object.keys(week) as (keyof WeeklyTotals)[]) byPlatform[platform]![k] += week[k];
  }

  let bestPlatform: WeekAggregation['bestPlatform'] = null;
  for (const [platform, t] of Object.entries(byPlatform)) {
    if (t.conversions <= 0) continue;
    const cpaCents = t.spendCents / t.conversions;
    if (!bestPlatform || cpaCents < bestPlatform.cpaCents) bestPlatform = { platform, cpaCents };
  }

  // Alerts raised in the reporting window.
  const alertRows = await ctx.db
    .select({ severity: alerts.severity, title: alerts.title })
    .from(alerts)
    .where(and(eq(alerts.orgId, ctx.orgId), gte(alerts.createdAt, weekStart)))
    .orderBy(desc(alerts.createdAt));
  const alertSummary = { total: alertRows.length, critical: 0, warning: 0, notable: [] as string[] };
  for (const a of alertRows) {
    if (a.severity === 'critical') alertSummary.critical += 1;
    else if (a.severity === 'warning') alertSummary.warning += 1;
  }
  alertSummary.notable = alertRows.slice(0, 4).map((a) => a.title);

  // Creative-fatigue snapshots: latest per creative in the window, flagged on
  // high frequency or spend-without-conversions (same thresholds as the
  // fatigue detector, minus its alert-writing side effects).
  const snapshots = await ctx.db
    .selectDistinctOn([creativePerformance.creativeId], {
      creativeId: creativePerformance.creativeId,
      headline: creativePerformance.headline,
      frequency: creativePerformance.frequency,
      spendCents: creativePerformance.spendCents,
      conversions: creativePerformance.conversions,
      impressions: creativePerformance.impressions,
    })
    .from(creativePerformance)
    .where(and(eq(creativePerformance.orgId, ctx.orgId), gte(creativePerformance.snapshotAt, weekStart)))
    .orderBy(creativePerformance.creativeId, desc(creativePerformance.snapshotAt));

  const fatigueExamples: string[] = [];
  let fatiguedCreatives = 0;
  for (const s of snapshots) {
    const freq = s.frequency ?? 0;
    const fatigued = freq >= 3 || ((s.spendCents ?? 0) >= 5000 && (s.conversions ?? 0) === 0);
    if (!fatigued) continue;
    fatiguedCreatives += 1;
    if (fatigueExamples.length < 3) {
      fatigueExamples.push(
        freq >= 3
          ? `${s.headline ?? s.creativeId} (frequency ${freq.toFixed(1)}×)`
          : `${s.headline ?? s.creativeId} (${usd(s.spendCents ?? 0)} spent, 0 conversions)`,
      );
    }
  }

  return {
    periodLabel: `${periodStart} → ${periodEnd}`,
    totals,
    prevTotals,
    byPlatform,
    campaignCount: campaigns.length,
    activeCampaigns,
    burningCampaigns,
    bestPlatform,
    alerts: alertSummary,
    fatiguedCreatives,
    fatigueExamples,
    dataSource: dataSourceForCampaigns(campaigns),
    sourceSyncs: sourceSyncsFor(campaigns),
    metricBasis: campaigns.some((c) => c.mode === 'live') ? LIVE_METRIC_BASIS : 'Daily sandbox history for the report period.',
  };
}

const PLATFORM_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
};

function platformLabel(key: string): string {
  return PLATFORM_LABELS[key] ?? key;
}

interface DeterministicBrief {
  markdown: string;
  wins: string[];
  losses: string[];
  recommendations: string[];
  priorities: string[];
}

/** Build a substantive markdown brief purely from the aggregated numbers. */
function buildDeterministicBrief(agg: WeekAggregation): DeterministicBrief {
  if (agg.dataSource === 'live' || agg.dataSource === 'mixed') {
    return {
      wins: [], losses: [], recommendations: ['Verify the snapshot totals against the provider account.'], priorities: ['Run a fresh sync before the next review.'],
      markdown: `## Account snapshot review\n\n${agg.metricBasis}\n\n` +
        `Stored spend: ${(agg.totals.spendCents / 100).toFixed(2)} in provider account currency (${agg.totals.spendCents} spendCents). ` +
        `${agg.totals.impressions} impressions, ${agg.totals.clicks} clicks, ${agg.totals.conversions} conversions.\n\n` +
        'Daily live breakdowns and comparable prior-period totals are unavailable. No week-over-week change is inferred.',
    };
  }
  const { totals, prevTotals } = agg;
  const ctrPct = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const prevCtrPct = prevTotals.impressions > 0 ? (prevTotals.clicks / prevTotals.impressions) * 100 : 0;
  const cpaCents = totals.conversions > 0 ? totals.spendCents / totals.conversions : null;
  const spendDelta = pctDelta(totals.spendCents, prevTotals.spendCents);
  const convDelta = pctDelta(totals.conversions, prevTotals.conversions);

  const wins: string[] = [];
  const losses: string[] = [];
  const recommendations: string[] = [];
  const priorities: string[] = [];

  // --- Wins ---
  if (totals.conversions > 0) {
    wins.push(
      `You drove ${totals.conversions} conversion${totals.conversions === 1 ? '' : 's'} this week${
        cpaCents !== null ? ` at a blended cost of ${usd(cpaCents)} each` : ''
      } — every one of these is a real conversation with a potential customer.`,
    );
  }
  if (agg.bestPlatform) {
    wins.push(
      `${platformLabel(agg.bestPlatform.platform)} was your most efficient channel, delivering leads at ${usd(
        agg.bestPlatform.cpaCents,
      )} each. This is where your budget is working hardest right now.`,
    );
  }
  if (convDelta !== null && convDelta > 0) {
    wins.push(`Conversions are up ${convDelta}% versus the previous week — momentum is building in the account.`);
  }
  if (ctrPct > prevCtrPct && prevCtrPct > 0) {
    wins.push(
      `Click-through rate improved to ${ctrPct.toFixed(2)}% (from ${prevCtrPct.toFixed(
        2,
      )}%), a sign your creative and targeting are resonating more than they were.`,
    );
  }
  if (agg.alerts.critical === 0 && agg.fatiguedCreatives === 0) {
    wins.push('No critical alerts and no fatigued creatives — the account is healthy and nothing needs urgent triage.');
  }
  if (wins.length === 0) {
    wins.push(
      'This was a quiet week with little spend or activity, which keeps risk low and gives you a clean, stable base to build the next push from.',
    );
  }

  // --- Losses / risks ---
  if (agg.burningCampaigns > 0) {
    losses.push(
      `${agg.burningCampaigns} campaign${agg.burningCampaigns === 1 ? ' is' : 's are'} spending without a single conversion — budget is leaking here and should be reviewed before it compounds.`,
    );
  }
  if (agg.fatiguedCreatives > 0) {
    losses.push(
      `${agg.fatiguedCreatives} creative${agg.fatiguedCreatives === 1 ? ' is' : 's are'} showing fatigue (${agg.fatigueExamples.join(
        '; ',
      )}). Repeated exposure to the same audience is eroding performance.`,
    );
  }
  if (agg.alerts.critical > 0) {
    losses.push(
      `${agg.alerts.critical} critical alert${agg.alerts.critical === 1 ? '' : 's'} fired this week${
        agg.alerts.notable.length ? ` — including: ${agg.alerts.notable.slice(0, 2).join('; ')}` : ''
      }. These deserve your attention first.`,
    );
  }
  if (convDelta !== null && convDelta < 0) {
    losses.push(`Conversions fell ${Math.abs(convDelta)}% week-over-week, so the funnel is converting less efficiently than it was.`);
  }
  if (totals.spendCents > 0 && totals.conversions === 0) {
    losses.push(
      `You spent ${usd(totals.spendCents)} this week with zero conversions recorded — either tracking is broken or the offer/landing page is not converting, and both are fixable.`,
    );
  }
  if (losses.length === 0) {
    losses.push('No material losses this week — spend, creative health, and alerts all stayed within healthy ranges.');
  }

  // --- Recommendations ---
  if (agg.bestPlatform) {
    recommendations.push(
      `Shift more budget toward ${platformLabel(agg.bestPlatform.platform)} while its cost-per-lead stays low; scaling winners early is the cheapest growth available to you.`,
    );
  }
  if (agg.burningCampaigns > 0) {
    recommendations.push(
      'Pause or restructure the campaigns that are spending without converting, then relaunch them with tighter targeting or a clearer offer.',
    );
  }
  if (agg.fatiguedCreatives > 0) {
    recommendations.push(
      'Rotate in fresh creative for the fatigued ads — new headlines, imagery, or a different angle resets audience fatigue and typically lifts CTR quickly.',
    );
  }
  recommendations.push(
    'Confirm conversion tracking is firing on your landing page so every lead is counted; untracked conversions make even a healthy account look broken.',
  );
  if (ctrPct < 1 && totals.impressions > 0) {
    recommendations.push(
      `Your CTR of ${ctrPct.toFixed(2)}% is on the low side — test stronger hooks in your headlines and tighten the match between ad copy and search intent.`,
    );
  }
  recommendations.push(
    'Pace your budget evenly across the week rather than in bursts; steady, consistent delivery gives the ad algorithms more signal and avoids early-week overspend.',
  );
  recommendations.push(
    'Block fifteen minutes to scan the Alerts Center and Creative Health dashboard so small issues are caught while they are still cheap to fix.',
  );

  // --- Next-week priorities ---
  priorities.push(
    agg.alerts.critical > 0
      ? 'Resolve the critical alerts first — they flag the fastest-bleeding spend in the account.'
      : 'Protect the winning campaigns: keep their budgets funded and avoid editing them mid-flight.',
  );
  priorities.push(
    agg.fatiguedCreatives > 0 || agg.burningCampaigns > 0
      ? 'Fix the leaks: pause burning campaigns and refresh fatigued creative before scaling anything new.'
      : 'Look for one scaling opportunity — a winning ad set or audience you can responsibly increase.',
  );
  priorities.push(
    'Review the landing page experience end-to-end (load speed, form length, mobile layout) so the traffic you pay for converts at its best.',
  );

  // --- Assemble markdown ---
  const lines: string[] = [];
  lines.push(`# Weekly Performance Report`);
  lines.push('');
  lines.push(`**Period:** ${agg.periodLabel}`);
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  if (totals.spendCents > 0) {
    lines.push(
      `This week your account spent ${usd(totals.spendCents)} across ${agg.campaignCount} campaign${
        agg.campaignCount === 1 ? '' : 's'
      } (${agg.activeCampaigns} active), generating ${totals.impressions.toLocaleString()} impressions, ${totals.clicks.toLocaleString()} clicks, and ${totals.conversions} conversion${
        totals.conversions === 1 ? '' : 's'
      }.`,
    );
  } else {
    lines.push(
      `There was no paid spend recorded this week across your ${agg.campaignCount} campaign${
        agg.campaignCount === 1 ? '' : 's'
      }, so this report focuses on account health and where to focus next.`,
    );
  }
  lines.push(
    `Your click-through rate was ${ctrPct.toFixed(2)}%${
      cpaCents !== null ? ` and your blended cost per conversion was ${usd(cpaCents)}` : ''
    }.`,
  );
  if (spendDelta !== null) {
    lines.push(
      `Spend ${spendDelta >= 0 ? 'increased' : 'decreased'} ${Math.abs(spendDelta)}% compared with the previous week${
        convDelta !== null ? `, while conversions ${convDelta >= 0 ? 'rose' : 'fell'} ${Math.abs(convDelta)}%` : ''
      }.`,
    );
  }
  lines.push(
    `On the health side, the Guardian raised ${agg.alerts.total} alert${agg.alerts.total === 1 ? '' : 's'} (${agg.alerts.critical} critical, ${agg.alerts.warning} warning) and flagged ${agg.fatiguedCreatives} fatigued creative${agg.fatiguedCreatives === 1 ? '' : 's'}.`,
  );
  lines.push('');

  const section = (title: string, items: string[], ordered = false) => {
    lines.push(`## ${title}`);
    lines.push('');
    items.forEach((item, i) => lines.push(`${ordered ? `${i + 1}.` : '-'} ${item}`));
    lines.push('');
  };
  section('🏆 Wins', wins);
  section('⚠️ Losses & Risks', losses);
  section('💡 Recommendations', recommendations);
  section('🎯 Next-Week Priorities', priorities, true);

  const platformEntries = Object.entries(agg.byPlatform).filter(([, t]) => t.spendCents > 0 || t.impressions > 0);
  if (platformEntries.length > 0) {
    lines.push('## 📊 Platform Breakdown');
    lines.push('');
    for (const [platform, t] of platformEntries) {
      const pCtr = t.impressions > 0 ? ((t.clicks / t.impressions) * 100).toFixed(2) : '0.00';
      const pCpa = t.conversions > 0 ? usd(t.spendCents / t.conversions) : '—';
      lines.push(
        `- **${platformLabel(platform)}** — ${usd(t.spendCents)} spend, ${t.impressions.toLocaleString()} impressions, ${t.clicks.toLocaleString()} clicks (${pCtr}% CTR), ${t.conversions} conversions, ${pCpa} per conversion`,
      );
    }
    lines.push('');
  }

  lines.push('## The Bottom Line');
  lines.push('');
  if (totals.spendCents > 0 && totals.conversions > 0) {
    lines.push(
      `The account is spending and converting, which means your core funnel works. The priority now is efficient scale: feed more budget to ${
        agg.bestPlatform ? platformLabel(agg.bestPlatform.platform) : 'your best-performing channel'
      }, trim the campaigns that spend without returning leads, and keep your creative fresh so performance does not stall. Small, steady improvements compound quickly at this stage.`,
    );
  } else if (totals.spendCents > 0 && totals.conversions === 0) {
    lines.push(
      'Money is going out but no conversions are coming back, so the immediate job is diagnostic: verify your tracking is firing, then pressure-test the landing page and the offer itself. Until that loop is closed, hold spend flat rather than scaling — fixing the leak first makes every future dollar work harder.',
    );
  } else {
    lines.push(
      'With little or no spend this week, the account is low-risk but also idle. Use the breathing room to sharpen your creative, confirm tracking, and pick one channel to commit to next week — a focused, well-measured launch will teach you far more than spreading a thin budget everywhere.',
    );
  }
  lines.push('');

  return { markdown: lines.join('\n').trim(), wins, losses, recommendations, priorities };
}

export interface GeneratedWeeklyReport {
  report: typeof weeklyReports.$inferSelect;
  content: WeeklyReportPayload;
}

/**
 * Generate (or regenerate) this week's in-app report for the org. Aggregates
 * deterministic data, optionally rewrites the narrative with the LLM when the
 * org is within its monthly budget cap, and upserts a `weekly_reports` row
 * keyed to the Monday of the current week.
 */
export async function generateWeeklyReport(
  ctx: AgentContext,
  now: Date = ctx.now ?? new Date(),
): Promise<GeneratedWeeklyReport> {
  const weekStart = startOfWeek(now);
  const [orgRow] = await ctx.db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);
  const demo = isDemoDataEnabled(orgRow?.settings);

  const agg = demo ? demoWeekAggregation(weekStart, now) : await aggregateWeek(ctx, weekStart, now);
  const brief = buildDeterministicBrief(agg);

  // Demo reports are labeled in the markdown itself so the label survives on
  // every rendering surface (in-app, shared report, copy/paste).
  let markdown = demo ? `**${DEMO_DATA_LABEL}**\n\n${brief.markdown}` : brief.markdown;
  let source: WeeklyReportPayload['source'] = 'deterministic';

  // LLM narrative — only when a real provider is configured AND the org is
  // within budget. Any failure keeps the deterministic brief (CONTRACTS §3).
  // Demo mode stays fully deterministic so the label and numbers never drift.
  if (!demo && agg.dataSource !== 'live' && agg.dataSource !== 'mixed' && ctx.llm.name !== 'mock' && (await isWithinBudget(ctx))) {
    try {
      const res = await ctx.llm.chat(
        [
          {
            role: 'system',
            content:
              'You are a senior marketing analyst writing a weekly performance report for a small-business owner. ' +
              'Write in plain, encouraging language — no jargon, no hype, never invent numbers. ' +
              'Return Markdown with these sections: "## Executive Summary", "## 🏆 Wins", "## ⚠️ Losses & Risks", ' +
              '"## 💡 Recommendations", and "## 🎯 Next-Week Priorities". Use bullet lists. Aim for at least 300 words.',
          },
          {
            role: 'user',
            content:
              `Week ${agg.periodLabel}.\n` +
              `Totals: spend ${usd(agg.totals.spendCents)}, ${agg.totals.impressions} impressions, ` +
              `${agg.totals.clicks} clicks, ${agg.totals.conversions} conversions.\n` +
              `Previous week: spend ${usd(agg.prevTotals.spendCents)}, ${agg.prevTotals.conversions} conversions.\n` +
              `Campaigns: ${agg.campaignCount} total, ${agg.activeCampaigns} active, ${agg.burningCampaigns} spending without conversions.\n` +
              `Best platform: ${agg.bestPlatform ? `${platformLabel(agg.bestPlatform.platform)} at ${usd(agg.bestPlatform.cpaCents)} per conversion` : 'none with conversions'}.\n` +
              `By platform: ${JSON.stringify(agg.byPlatform)}.\n` +
              `Alerts: ${agg.alerts.total} total (${agg.alerts.critical} critical, ${agg.alerts.warning} warning). Notable: ${agg.alerts.notable.join('; ') || 'none'}.\n` +
              `Fatigued creatives: ${agg.fatiguedCreatives}. Examples: ${agg.fatigueExamples.join('; ') || 'none'}.\n\n` +
              `Write the report.`,
          },
        ],
        { maxTokens: 900, temperature: 0.5 },
      );
      if (res.usage) await recordUsage(ctx, res.usage).catch(() => {});
      const narrative = res.content.trim();
      if (narrative.length >= 200) {
        markdown = narrative;
        source = 'llm';
      }
    } catch {
      // deterministic brief stays
    }
  }

  const syncLabel = (agg.sourceSyncs ?? []).map((s) => `${platformLabel(s.platform)} account ${s.externalAccountId}: ${s.syncedAt}`).join('; ') || 'Live sync timestamp unavailable';
  if (!demo) markdown = `**Data source: ${agg.dataSource}**\n\nSource sync: ${syncLabel}\n\n${markdown}`;
  const content: WeeklyReportPayload = {
    markdown,
    periodLabel: agg.periodLabel,
    totals: agg.totals,
    byPlatform: agg.byPlatform,
    wins: brief.wins,
    losses: brief.losses,
    recommendations: brief.recommendations,
    priorities: brief.priorities,
    alertCount: agg.alerts.total,
    fatiguedCreatives: agg.fatiguedCreatives,
    source,
    generatedAt: now.toISOString(),
    // Surfaces rendering this report MUST show DEMO_DATA_LABEL when set.
    demoData: demo ? true : undefined,
    dataSource: agg.dataSource,
    sourceSyncs: agg.sourceSyncs ?? [],
    metricBasis: agg.metricBasis,
  };

  // Upsert keyed to (org, weekStart) so regenerating refreshes rather than
  // duplicates the current week's report.
  const [existing] = await ctx.db
    .select({ id: weeklyReports.id })
    .from(weeklyReports)
    .where(and(eq(weeklyReports.orgId, ctx.orgId), eq(weeklyReports.weekStart, weekStart)))
    .limit(1);

  let report: typeof weeklyReports.$inferSelect | undefined;
  if (existing) {
    [report] = await ctx.db
      .update(weeklyReports)
      .set({ content })
      .where(eq(weeklyReports.id, existing.id))
      .returning();
  } else {
    [report] = await ctx.db
      .insert(weeklyReports)
      .values({ orgId: ctx.orgId, weekStart, content })
      .returning();
  }

  await ctx.audit.log({
    actorType: ctx.userId ? 'user' : 'system',
    actorId: ctx.userId ?? 'weekly-report',
    action: 'weekly_report.generated',
    entityType: 'weekly_report',
    entityId: report!.id,
    payload: { weekStart: weekStart.toISOString(), source, alertCount: agg.alerts.total },
  });
  await track(ctx, 'report_generated', { weekStart: weekStart.toISOString(), source });

  return { report: report!, content };
}

/** List the org's weekly reports, newest week first. */
export async function listReports(ctx: AgentContext) {
  return ctx.db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.orgId, ctx.orgId))
    .orderBy(desc(weeklyReports.weekStart));
}

/** Fetch a single weekly report scoped to the org. */
export async function getReport(ctx: AgentContext, id: string) {
  const [report] = await ctx.db
    .select()
    .from(weeklyReports)
    .where(and(eq(weeklyReports.id, id), eq(weeklyReports.orgId, ctx.orgId)))
    .limit(1);
  if (!report) throw new Error('Report not found');
  return report;
}
