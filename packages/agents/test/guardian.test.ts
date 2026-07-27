// Budget Guardian (CONTRACTS §8): overspend block, velocity auto-pause,
// zero-conversion burn auto-pause — all audit-logged.

import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, campaignsMirror } from '@sayso/db';
import { BudgetCapExceeded } from '@sayso/integrations';
import { checkSpend, tick, projectMonthEnd, wouldExceed } from '../src/guardian.js';
import { executeTool } from '../src/tools.js';
import { db, freshOrg, truncateAll, type TestOrg } from './helpers.js';

/** Mid-month fixed clock so day math is stable. */
const NOW = new Date('2026-06-15T12:00:00Z');

async function launchCampaign(org: TestOrg, dailyBudgetCents: number) {
  const args = {
    platform: 'google_ads' as const,
    input: {
      name: `Campaign ${dailyBudgetCents}`,
      objective: 'leads',
      dailyBudgetCents,
      targeting: { geography: 'Chicago' },
    },
  };
  const { approvals } = await import('@sayso/db');
  const [approval] = await db
    .insert(approvals)
    .values({
      orgId: org.orgId,
      action: { type: 'tool', toolName: 'ads.create_campaign', args, summary: 'test' },
      status: 'approved',
      decidedBy: org.userId,
      decidedVia: 'click',
      decidedAt: NOW,
    })
    .returning();
  const { result } = await executeTool(org.ctx, 'ads.create_campaign', { ...args, __approvalId: approval!.id });
  return (result as { campaign: { externalId: string } }).campaign;
}

describe('projection math', () => {
  it('projects month-end spend from daily budgets', () => {
    // June 15 → 15 days remaining of 30.
    expect(projectMonthEnd(10_000, 1_000, NOW)).toBe(10_000 + 15 * 1_000);
  });
  it('wouldExceed is a strict comparison', () => {
    expect(wouldExceed(50_000, 50_000)).toBe(false);
    expect(wouldExceed(50_000, 50_001)).toBe(true);
  });
});

describe('checkSpend', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('allows spend well under the cap', async () => {
    const org = await freshOrg({ now: NOW }); // $500 monthly cap
    const verdict = await checkSpend(org.ctx, 'google_ads', 1_000); // $10/day → ~$150 rest of month
    expect(verdict.ok).toBe(true);
  });

  it('blocks spend whose projection exceeds the monthly cap', async () => {
    const org = await freshOrg({ now: NOW });
    const verdict = await checkSpend(org.ctx, 'google_ads', 10_000); // $100/day → $1500 ≫ $500
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/monthly cap/i);
    expect(verdict.capCents).toBe(50_000);
  });

  it('gated create_campaign surfaces the block as BudgetCapExceeded', async () => {
    const org = await freshOrg({ now: NOW });
    const args = {
      platform: 'google_ads' as const,
      input: {
        name: 'Too big',
        objective: 'leads',
        dailyBudgetCents: 10_000,
        targeting: {},
      },
    };
    const { approvals } = await import('@sayso/db');
    const [approval] = await db
      .insert(approvals)
      .values({
        orgId: org.orgId,
        action: { type: 'tool', toolName: 'ads.create_campaign', args, summary: 'test' },
        status: 'approved',
        decidedBy: org.userId,
        decidedVia: 'click',
        decidedAt: NOW,
      })
      .returning();
    await expect(
      executeTool(org.ctx, 'ads.create_campaign', { ...args, __approvalId: approval!.id }),
    ).rejects.toThrow(BudgetCapExceeded);
    // Nothing launched.
    const mirror = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, org.orgId));
    expect(mirror).toHaveLength(0);
  });
});

describe('tick enforcement', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('velocity anomaly: projected overspend auto-pauses campaigns + audit-logs', async () => {
    const org = await freshOrg({ now: NOW });
    const campaign = await launchCampaign(org, 1_000); // fits the cap at creation

    // Simulate runaway spend recorded in the mirror.
    await db
      .update(campaignsMirror)
      .set({ metrics: { impressions: 100_000, clicks: 5_000, spendCents: 49_000, conversions: 10, history: [] } })
      .where(eq(campaignsMirror.orgId, org.orgId));

    const verdict = await tick(org.ctx);
    expect(verdict.autoPaused!.length).toBeGreaterThan(0);
    expect(verdict.reason).toMatch(/auto-paused/i);

    const [mirror] = await db
      .select()
      .from(campaignsMirror)
      .where(eq(campaignsMirror.externalId, campaign.externalId));
    expect(mirror!.status).toBe('paused');

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.orgId, org.orgId));
    expect(audits.some((a) => a.action.startsWith('guardian.auto_pause'))).toBe(true);
  });

  it('zero-conversion burn: ≥3× target CPL with 0 conversions auto-pauses', async () => {
    const org = await freshOrg({ now: NOW, monthlyBudgetCeilingCents: 10_000_000 }); // cap far away
    const campaign = await launchCampaign(org, 1_000);

    await db
      .update(campaignsMirror)
      .set({ metrics: { impressions: 9_000, clicks: 400, spendCents: 20_000, conversions: 0, history: [] } })
      .where(eq(campaignsMirror.orgId, org.orgId));

    const verdict = await tick(org.ctx);
    expect(verdict.autoPaused).toContainEqual(expect.any(String));

    const [mirror] = await db
      .select()
      .from(campaignsMirror)
      .where(eq(campaignsMirror.externalId, campaign.externalId));
    expect(mirror!.status).toBe('paused');

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.orgId, org.orgId));
    expect(audits.some((a) => a.action === 'guardian.auto_pause.zero_conversion')).toBe(true);
  });

  it('healthy spend does not auto-pause', async () => {
    const org = await freshOrg({ now: NOW });
    await launchCampaign(org, 1_000);
    const verdict = await tick(org.ctx);
    expect(verdict.ok).toBe(true);
    expect(verdict.autoPaused).toEqual([]);
  });
});
