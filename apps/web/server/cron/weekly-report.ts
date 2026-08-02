// Weekly report email trigger (Phase 3). This module owns the per-org send
// path shared by BOTH entry points:
//   • the tRPC `reports.weekly.sendEmail` procedure (single org, user-triggered)
//   • the Monday 08:00 UTC cron (`POST` below → runWeeklyReportCron, all orgs)
//
// The `POST` export is a Next.js route handler for `/api/cron/weekly-report`,
// guarded by the CRON_SECRET bearer header. (Mount it by re-exporting from
// `app/api/cron/weekly-report/route.ts`: `export { POST } from '@/server/cron/weekly-report'`.)
//
// Idempotent per ISO week: a successful send writes a `weekly_report.emailed`
// audit entry keyed by weekStart, and we skip orgs already emailed that week
// (CONTRACTS §4 — the immutable audit log is the source of truth).

import { and, eq, inArray, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { auditLogs, db, organizations, orgMembers, users, type Db } from '@growthcrew/db';
import { createAgentContext, services, type AgentContext } from '@growthcrew/agents';
import { renderWeeklyReportEmail } from '@/emails/weekly-report';

const EMAILED_ACTION = 'weekly_report.emailed';

export interface SendWeeklyReportOptions {
  env?: NodeJS.ProcessEnv;
  /** Injectable clock for tests. */
  now?: Date;
  /** Bypass the per-week idempotency check (manual resend). */
  force?: boolean;
}

export type SendWeeklyReportResult =
  | { status: 'sent'; reportId: string; recipients: number; provider: string; emailId: string }
  | { status: 'skipped'; reportId: string; reason: 'already-sent' | 'no-recipient' };

export interface WeeklyReportCronRun {
  orgs: number;
  sent: number;
  skipped: number;
  errors: string[];
  /** Per-org outcome so operators can see WHY an org was skipped (pilot ops). */
  details: { orgId: string; status: 'sent' | 'skipped'; reason?: string; recipients?: number; provider?: string }[];
}

/**
 * Generate (or load) this week's report for one org, render the email, and
 * send it to the org's owners/admins. Idempotent per ISO week unless `force`.
 * Never throws on a missing email key — the provider falls back to console.
 */
export async function sendWeeklyReportForOrg(
  ctx: AgentContext,
  opts: SendWeeklyReportOptions = {},
): Promise<SendWeeklyReportResult> {
  const env = opts.env ?? process.env;
  const { report, content } = await services.reports.generateWeeklyReport(ctx, opts.now);
  const weekStart = report.weekStart.toISOString();

  if (!opts.force) {
    const [already] = await ctx.db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.orgId, ctx.orgId),
          eq(auditLogs.action, EMAILED_ACTION),
          sql`${auditLogs.metadata}->>'weekStart' = ${weekStart}`,
        ),
      )
      .limit(1);
    if (already) return { status: 'skipped', reportId: report.id, reason: 'already-sent' };
  }

  const owners = await ctx.db
    .select({ email: users.email })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(orgMembers.orgId, ctx.orgId), inArray(orgMembers.role, ['owner', 'admin'])));
  const to = owners.map((o) => o.email).filter((e): e is string => Boolean(e));
  if (to.length === 0) return { status: 'skipped', reportId: report.id, reason: 'no-recipient' };

  const [org] = await ctx.db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);
  const orgName = org?.name ?? 'your business';

  const appUrl = env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000';
  const { subject, html } = renderWeeklyReportEmail({ orgName, content, reportUrl: `${appUrl}/reports` });

  const provider = services.email.createEmailProvider(env);
  const result = await provider.send({ from: services.email.emailFrom(env), to, subject, html });

  await ctx.audit.log({
    actorType: ctx.userId ? 'user' : 'system',
    actorId: ctx.userId ?? 'weekly-report-cron',
    action: EMAILED_ACTION,
    entityType: 'weekly_report',
    entityId: report.id,
    metadata: { weekStart, recipients: to.length, provider: result.provider, emailId: result.id },
  });

  return {
    status: 'sent',
    reportId: report.id,
    recipients: to.length,
    provider: result.provider,
    emailId: result.id,
  };
}

/**
 * Monday cron body: build + email this week's report for every org. Per-org
 * failures are collected, not thrown, so one bad org can't sink the run.
 */
export async function runWeeklyReportCron(
  opts: SendWeeklyReportOptions & { db?: Db } = {},
): Promise<WeeklyReportCronRun> {
  const database = opts.db ?? db;
  const orgs = await database.select({ id: organizations.id }).from(organizations);
  const run: WeeklyReportCronRun = { orgs: orgs.length, sent: 0, skipped: 0, errors: [], details: [] };

  for (const org of orgs) {
    const ctx = createAgentContext({ db: database, orgId: org.id, now: opts.now });
    try {
      const result = await sendWeeklyReportForOrg(ctx, opts);
      if (result.status === 'sent') {
        run.sent += 1;
        run.details.push({ orgId: org.id, status: 'sent', recipients: result.recipients, provider: result.provider });
      } else {
        run.skipped += 1;
        run.details.push({ orgId: org.id, status: 'skipped', reason: result.reason });
      }
    } catch (err) {
      run.errors.push(`${org.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return run;
}

/**
 * Next.js route handler for `POST /api/cron/weekly-report`. Guarded by the
 * CRON_SECRET bearer header; without a matching secret the endpoint is inert.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const run = await runWeeklyReportCron();
  return NextResponse.json(run, { status: run.errors.length > 0 ? 207 : 200 });
}
