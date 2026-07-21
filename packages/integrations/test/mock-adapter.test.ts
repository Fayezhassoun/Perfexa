// Mock ad adapter (CONTRACTS §7): stateful via injected store, deterministic
// metrics that evolve with time, gated ops exposed only through the tool layer.

import { describe, expect, it } from 'vitest';
import { createMockAdapter } from '../src/ads/mock-adapter.js';
import type { AdapterDeps } from '../src/types.js';

function memoryDeps(): AdapterDeps & { dump(): unknown } {
  const state = new Map<string, unknown>();
  return {
    orgId: 'org-1',
    store: {
      async load(orgId, platform) {
        return state.get(`${orgId}:${platform}`) ?? null;
      },
      async save(orgId, platform, s) {
        state.set(`${orgId}:${platform}`, s);
      },
    },
    dump: () => Object.fromEntries(state),
  };
}

const INPUT = {
  name: 'Chicago Search',
  objective: 'leads',
  dailyBudgetCents: 1_000,
  targeting: { geography: 'Chicago', keywords: ['plumber'] },
};

describe('mock ad adapter', () => {
  it('creates an active campaign and persists it to the store', async () => {
    const deps = memoryDeps();
    const adapter = createMockAdapter('google_ads', deps);
    const campaign = await adapter.createCampaign(INPUT);
    expect(campaign.status).toBe('active');
    expect(campaign.budgetDailyCents).toBe(1_000);
    expect(campaign.externalId).toBeTruthy();

    const listed = await adapter.listCampaigns();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.externalId).toBe(campaign.externalId);
  });

  it('metrics are deterministic for the same externalId + time', async () => {
    const deps = memoryDeps();
    const adapter = createMockAdapter('google_ads', deps);
    const { externalId } = await adapter.createCampaign(INPUT);
    const a = await adapter.getMetrics(externalId);
    const b = await adapter.getMetrics(externalId);
    // Two immediate reads: identical or nearly so (same deterministic curve).
    expect(Math.abs(b.impressions - a.impressions)).toBeLessThanOrEqual(1);
    expect(a.spendCents).toBeGreaterThanOrEqual(0);
  });

  it('a fresh adapter over the same store sees the same campaigns (state persists)', async () => {
    const deps = memoryDeps();
    const first = createMockAdapter('google_ads', deps);
    const { externalId } = await first.createCampaign(INPUT);

    const second = createMockAdapter('google_ads', deps);
    const listed = await second.listCampaigns();
    expect(listed.map((c) => c.externalId)).toContain(externalId);
  });

  it('pause and resume flip status', async () => {
    const deps = memoryDeps();
    const adapter = createMockAdapter('google_ads', deps);
    const { externalId } = await adapter.createCampaign(INPUT);

    await adapter.pauseCampaign(externalId);
    expect((await adapter.listCampaigns())[0]!.status).toBe('paused');

    await adapter.resumeCampaign(externalId);
    expect((await adapter.listCampaigns())[0]!.status).toBe('active');
  });

  it('updateBudget changes the daily budget', async () => {
    const deps = memoryDeps();
    const adapter = createMockAdapter('google_ads', deps);
    const { externalId } = await adapter.createCampaign(INPUT);
    await adapter.updateBudget(externalId, 2_500);
    expect((await adapter.listCampaigns())[0]!.budgetDailyCents).toBe(2_500);
  });

  it('keyword ideas are deterministic per seed', async () => {
    const deps = memoryDeps();
    const adapter = createMockAdapter('google_ads', deps);
    const a = await adapter.getKeywordIdeas!('plumber', 'Chicago');
    const b = await adapter.getKeywordIdeas!('plumber', 'Chicago');
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('ad policy check flags risky copy', async () => {
    const deps = memoryDeps();
    const adapter = createMockAdapter('google_ads', deps);
    const ok = await adapter.checkAdPolicy!({ headline: 'Fast local plumbing', body: 'Same-day service.' });
    expect(ok.ok).toBe(true);
    const bad = await adapter.checkAdPolicy!({
      headline: 'GUARANTEED #1 miracle cure',
      body: 'Get rich quick, 100% guaranteed results!',
    });
    expect(bad.ok).toBe(false);
    expect(bad.violations.length).toBeGreaterThan(0);
  });
});
