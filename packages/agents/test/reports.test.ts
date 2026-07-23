// Weekly reports (Phase 3): 7-day aggregation from campaigns_mirror history,
// persisted reports rows, and the Resend email path (offline, injected fetch;
// log-only without RESEND_API_KEY).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, campaignsMirror, reports, users } from '@voxmarketer/db';
import type { FetchLike } from '@voxmarketer/integrations';
import type { LLMProvider } from '@voxmarketer/llm';
import { createAgentContext } from '../src/context.js';
import { buildWeeklyReport, runWeeklyReportsForAllOrgs } from '../src/services/reports.js';
import { db, freshOrg, truncateAll } from './helpers.js';

const NOW = new Date('2026-07-21T12:00:00Z');

function day(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);
}

function historyEntry(n: number, spendCents: number, conversions: number, clicks = 10, impressions = 100) {
  return { date: day(n), impressions, clicks, spendCents, conversions };
}

async function seedMirror(orgId: string, history: { date: string; impressions: number; clicks: number; spendCents: number; conversions: number }[], platform = 'google_ads') {
  const latest = history[0] ?? { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 };
  await db.insert(campaignsMirror).values({
    orgId,
    platform,
    externalId: 'c-1',
    name: 'Test Campaign',
    status: 'active',
    budgetDailyCents: 1000,
    metrics: { ...latest, history },
    mode: 'sandbox',
  });
}

const savedKey = process.env.RESEND_API_KEY;

beforeEach(async () => {
  await truncateAll(db);
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = savedKey;
});

describe('buildWeeklyReport', () => {
  it('aggregates the last 7 days and persists a reports row + audit', async () => {
    const { ctx, orgId } = await freshOrg();
    await seedMirror(orgId, [
      historyEntry(1, 1000, 2), // this week
      historyEntry(3, 500, 1), // this week
      historyEntry(9, 700, 1), // prior week
      historyEntry(12, 300, 1), // prior week
    ]);

    const { report, content } = await buildWeeklyReport(ctx, NOW);

    expect(content.totals).toEqual({ spendCents: 1500, impressions: 200, clicks: 20, conversions: 3 });
    expect(content.byPlatform.google_ads).toEqual({ spendCents: 1500, impressions: 200, clicks: 20, conversions: 3 });
    expect(content.summary).toContain('$15.00');
    expect(content.summary).toContain('3 conversions');
    expect(content.highlights.some((h) => h.includes('google_ads'))).toBe(true);
    expect(content.periodLabel).toBe('2026-07-14 → 2026-07-21');

    expect(report.type).toBe('weekly');
    const stored = await db.select().from(reports).where(eq(reports.orgId, orgId));
    expect(stored).toHaveLength(1);

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
    expect(audits.some((a) => a.action === 'report.generated')).toBe(true);
  });

  it('handles an org with no campaigns', async () => {
    const { ctx } = await freshOrg();
    const { content } = await buildWeeklyReport(ctx, NOW);
    expect(content.summary).toBe('No ad spend this week.');
    expect(content.highlights).toEqual(['A quiet week — nothing needed your attention.']);
  });

  it('narrates the summary when a live LLM provider is configured', async () => {
    const { orgId } = await freshOrg();
    await seedMirror(orgId, [historyEntry(1, 1500, 3)]);
    const llm: LLMProvider = {
      name: 'openai',
      chat: async () => ({ content: 'You spent fifteen dollars and earned three leads — Google was your best channel.' }),
    };
    const ctx = createAgentContext({ db, orgId, llm });
    const { content } = await buildWeeklyReport(ctx, NOW);

    expect(content.summary).toBe('You spent fifteen dollars and earned three leads — Google was your best channel.');
    // deterministic parts are untouched by the narrative
    expect(content.totals).toEqual({ spendCents: 1500, impressions: 100, clicks: 10, conversions: 3 });
    expect(content.highlights.some((h) => h.includes('google_ads'))).toBe(true);
  });

  it('keeps the deterministic summary when the LLM fails', async () => {
    const { orgId } = await freshOrg();
    await seedMirror(orgId, [historyEntry(1, 1500, 3)]);
    const llm: LLMProvider = {
      name: 'anthropic',
      chat: async () => {
        throw new Error('provider down');
      },
    };
    const ctx = createAgentContext({ db, orgId, llm });
    const { content } = await buildWeeklyReport(ctx, NOW);
    expect(content.summary).toBe('This week you spent $15.00 for 3 conversions.');
  });
});


describe('runWeeklyReportsForAllOrgs', () => {
  function resendFetch(calls: { url: string; init?: { headers?: Record<string, string>; body?: string } }[]): FetchLike {
    return async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'email-1' }),
        text: async () => '{"id":"email-1"}',
      };
    };
  }

  it('builds reports but skips email without RESEND_API_KEY', async () => {
    const { orgId } = await freshOrg();
    await seedMirror(orgId, [historyEntry(1, 1000, 2)]);

    const run = await runWeeklyReportsForAllOrgs(db, { now: NOW });
    expect(run.orgs).toBe(1);
    expect(run.reports).toBe(1);
    expect(run.emailed).toBe(0);
    expect(run.emailSkipped).toBe(true);
    expect(run.errors).toEqual([]);
  });

  it('emails org owners via Resend when the key is configured', async () => {
    const { orgId, userId } = await freshOrg();
    await seedMirror(orgId, [historyEntry(1, 1000, 2)]);
    process.env.RESEND_API_KEY = 're_test_key';

    const calls: { url: string; init?: { headers?: Record<string, string>; body?: string } }[] = [];
    const run = await runWeeklyReportsForAllOrgs(db, { now: NOW, fetchImpl: resendFetch(calls) });

    expect(run.emailed).toBe(1);
    expect(run.errors).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect(calls[0]!.init?.headers?.authorization).toBe('Bearer re_test_key');

    const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
    const body = JSON.parse(calls[0]!.init?.body ?? '{}') as { to: string[]; subject: string; html: string };
    expect(body.to).toEqual([owner!.email]);
    expect(body.subject).toContain('Test Business');
    expect(body.html).toContain('$10.00');
    expect(body.html).toContain('2 conversions');
    expect(body.html).toContain('Test Business');

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
    expect(audits.some((a) => a.action === 'report.emailed')).toBe(true);
  });
});
