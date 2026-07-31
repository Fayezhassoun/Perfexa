// Weekly reports (Phase 3, CONTRACTS §4/§11): aggregates the last 7 days of
// campaigns_mirror metric history into a stored `reports` row, and — when
// RESEND_API_KEY is configured — emails it to org owners via the Resend
// adapter. Without a key it logs-only, per the zero-config rule (§3).

import { and, eq, inArray } from 'drizzle-orm';
import { campaignsMirror, organizations, orgMembers, reports, users, type Db, type Report } from '@growthcrew/db';
import {
  renderWeeklyReportEmail,
  sendEmail,
  type FetchLike,
  type WeeklyReportContent,
} from '@growthcrew/integrations';
import { createAuditLogger } from '../audit.js';
import { createAgentContext } from '../context.js';
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

  const campaigns = await ctx.db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, ctx.orgId));
  const totals: WeeklyTotals = { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 };
  const prevTotals: WeeklyTotals = { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 };
  const byPlatform: Record<string, WeeklyTotals> = {};

  for (const c of campaigns) {
    const metrics = c.metrics as { history?: HistoryPoint[] } | null;
    const history = metrics?.history ?? [];
    const week = sumWindow(history, periodStart, periodEnd);
    const prev = sumWindow(history, prevStart, periodStart);
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
      totals.spendCents > 0
        ? `This week you spent $${(totals.spendCents / 100).toFixed(2)} for ${totals.conversions} conversion${totals.conversions === 1 ? '' : 's'}.`
        : 'No ad spend this week.',
    highlights,
    totals,
    byPlatform,
    periodLabel: `${periodStart} → ${periodEnd}`,
  };

  // LLM narrative (publication-grade): live providers rewrite the summary in
  // plain language; any failure keeps the deterministic text (CONTRACTS §3).
  if (ctx.llm.name !== 'mock') {
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
    } catch (err) {
      run.errors.push(`${org.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return run;
}

