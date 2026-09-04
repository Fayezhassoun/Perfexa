// Optimization loop (Phase 3): metrics → PENDING approvals only. Verifies the
// deterministic rules, idempotency, and — critically — that nothing ever
// executes: campaign state is untouched until a human approves.

import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { approvals, auditLogs, campaignsMirror, type CampaignMirror } from '@growthcrew/db';
import { buildSuggestions, generateOptimizationApprovals } from '../src/services/optimize.js';
import { connectSandboxAccount, setIntegrationMode } from '../src/services/settings.js';
import { db, freshOrg, truncateAll } from './helpers.js';

function row(partial: Partial<CampaignMirror>): CampaignMirror {
  return {
    id: 'x',
    orgId: 'o',
    platform: 'google_ads',
    externalId: 'ext-1',
    name: 'Campaign',
    status: 'active',
    budgetDailyCents: 1000,
    metrics: { impressions: 0, clicks: 0, spendCents: 0, conversions: 0, history: [] },
    ...partial,
  } as CampaignMirror;
}

function metrics(spendCents: number, conversions: number) {
  return { impressions: 1000, clicks: 100, spendCents, conversions, history: [] };
}

describe('buildSuggestions (pure rules)', () => {
  it('suggests pausing a burner (0 conversions after 3× daily spend)', () => {
    const suggestions = buildSuggestions([row({ budgetDailyCents: 1000, metrics: metrics(3500, 0) })]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      toolName: 'ads.pause_campaign',
      rule: 'trim_burner',
      args: { platform: 'google_ads', externalId: 'ext-1' },
    });
  });

  it('suggests scaling a winner (+20%, rounded) but not an average performer', () => {
    const suggestions = buildSuggestions([
      row({ externalId: 'w', name: 'Winner', budgetDailyCents: 1000, metrics: metrics(3000, 10) }), // cpl 300
      row({ externalId: 'a', name: 'Average', budgetDailyCents: 1000, metrics: metrics(4000, 5) }), // cpl 800
    ]);
    const scale = suggestions.filter((s) => s.rule === 'scale_winner');
    expect(scale).toHaveLength(1);
    expect(scale[0]!.args).toEqual({ platform: 'google_ads', externalId: 'w', dailyBudgetCents: 1200 });
  });

  it('suggests shifting 20% from the expensive platform to the cheap one', () => {
    const suggestions = buildSuggestions([
      row({ externalId: 'g', platform: 'google_ads', budgetDailyCents: 1000, metrics: metrics(4000, 2) }), // cpl 2000
      row({ externalId: 'm', platform: 'meta', budgetDailyCents: 1000, metrics: metrics(200, 2) }), // cpl 100
    ]);
    const shift = suggestions.filter((s) => s.rule === 'shift_budget');
    expect(shift).toHaveLength(2);
    expect(shift[0]!.args).toEqual({ platform: 'google_ads', externalId: 'g', dailyBudgetCents: 800 });
    expect(shift[1]!.args).toEqual({ platform: 'meta', externalId: 'm', dailyBudgetCents: 1200 });
  });

  it('ignores paused, healthy, and live read-only campaigns', () => {
    const suggestions = buildSuggestions([
      row({ externalId: 'p', status: 'paused', metrics: metrics(9999, 0) }),
      row({ externalId: 'h', budgetDailyCents: 1000, metrics: metrics(500, 0) }), // under 3× daily
      row({ externalId: 'live', mode: 'live', metrics: metrics(9999, 0) }),
    ]);
    expect(suggestions).toHaveLength(0);
  });
});


describe('generateOptimizationApprovals (db)', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  async function seedCampaign(
    orgId: string,
    partial: { externalId: string; platform?: string; name?: string; budgetDailyCents: number; spendCents: number; conversions: number },
  ): Promise<void> {
    await db.insert(campaignsMirror).values({
      orgId,
      platform: partial.platform ?? 'google_ads',
      externalId: partial.externalId,
      name: partial.name ?? partial.externalId,
      status: 'active',
      budgetDailyCents: partial.budgetDailyCents,
      metrics: {
        impressions: 1000,
        clicks: 100,
        spendCents: partial.spendCents,
        conversions: partial.conversions,
        history: [],
      },
      mode: 'sandbox',
    });
  }

  it('creates pending approvals — and never touches campaign state', async () => {
    const { ctx, orgId } = await freshOrg();
    await seedCampaign(orgId, { externalId: 'burn-1', budgetDailyCents: 1000, spendCents: 3500, conversions: 0 });

    const result = await generateOptimizationApprovals(ctx);
    expect(result.created).toBe(1);
    expect(result.suggestions[0]!.rule).toBe('trim_burner');

    const [approval] = await db.select().from(approvals).where(eq(approvals.orgId, orgId));
    expect(approval!.status).toBe('pending');
    const action = approval!.action as { toolName: string; args: Record<string, unknown> };
    expect(action.toolName).toBe('ads.pause_campaign');
    expect(action.args).toEqual({ platform: 'google_ads', externalId: 'burn-1' });

    // the campaign itself is untouched — nothing executes without a human
    const [campaign] = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, orgId));
    expect(campaign!.status).toBe('active');

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
    expect(audits.some((a) => a.action === 'optimize.suggestions')).toBe(true);
  });

  it('does not create approvals for a live-connected platform even when mirror mode is stale', async () => {
    const { ctx, orgId } = await freshOrg();
    await seedCampaign(orgId, { externalId: 'stale-sandbox-row', budgetDailyCents: 1000, spendCents: 3500, conversions: 0 });
    await connectSandboxAccount(ctx, 'google_ads');
    await setIntegrationMode(ctx, 'google_ads', 'live', 'LIVE');

    const result = await generateOptimizationApprovals(ctx);
    expect(result.created).toBe(0);
    expect(result.suggestions).toEqual([]);
    const rows = await db.select().from(approvals).where(eq(approvals.orgId, orgId));
    expect(rows).toHaveLength(0);
  });

  it('is idempotent: a second run skips duplicates already pending', async () => {
    const { ctx, orgId } = await freshOrg();
    await seedCampaign(orgId, { externalId: 'burn-1', budgetDailyCents: 1000, spendCents: 3500, conversions: 0 });

    const first = await generateOptimizationApprovals(ctx);
    const second = await generateOptimizationApprovals(ctx);
    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.skippedDuplicates).toBe(1);

    const all = await db.select().from(approvals).where(eq(approvals.orgId, orgId));
    expect(all).toHaveLength(1);
  });

  it('creates shift_budget pairs for a 2× CPL gap across platforms', async () => {
    const { ctx, orgId } = await freshOrg();
    await seedCampaign(orgId, { externalId: 'g-1', platform: 'google_ads', budgetDailyCents: 1000, spendCents: 4000, conversions: 2 });
    await seedCampaign(orgId, { externalId: 'm-1', platform: 'meta', budgetDailyCents: 1000, spendCents: 200, conversions: 2 });

    const result = await generateOptimizationApprovals(ctx);
    expect(result.created).toBe(2);
    expect(result.suggestions.every((s) => s.rule === 'shift_budget')).toBe(true);

    const rows = await db.select().from(approvals).where(eq(approvals.orgId, orgId));
    const budgets = rows
      .map((r) => (r.action as { args: { externalId: string; dailyBudgetCents: number } }).args)
      .sort((a, b) => a.externalId.localeCompare(b.externalId));
    expect(budgets).toEqual([
      { platform: 'google_ads', externalId: 'g-1', dailyBudgetCents: 800 },
      { platform: 'meta', externalId: 'm-1', dailyBudgetCents: 1200 },
    ]);
  });

  it('handles an org with no campaigns (audit-only run)', async () => {
    const { ctx, orgId } = await freshOrg();
    const result = await generateOptimizationApprovals(ctx);
    expect(result).toMatchObject({ created: 0, skippedDuplicates: 0, suggestions: [] });
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
    expect(audits.some((a) => a.action === 'optimize.suggestions')).toBe(true);
  });
});
