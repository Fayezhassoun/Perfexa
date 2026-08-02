// campaigns_mirror write path (CONTRACTS §4/§8). The sync service
// (packages/agents/src/services/sync.ts) is still being built this wave;
// until it lands, these tests pin the store.ts write path it will call:
// every adapter state save upserts the public campaign view into
// campaigns_mirror with a dated metrics history (latest on top level,
// same-day snapshots replaced, older days appended, capped at 90).

import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { campaignsMirror, organizations } from '@growthcrew/db';
import { createAdapterStore, getOrgAdapter, type MirrorMetrics } from '../src/index.js';
import { db, freshOrg, truncateAll } from './helpers.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function view(externalId: string, overrides?: Record<string, unknown>) {
  return {
    externalId,
    platform: 'google_ads',
    name: 'Search — Chicago',
    status: 'active',
    budgetDailyCents: 1000,
    metrics: { impressions: 100, clicks: 10, spendCents: 500, conversions: 2 },
    ...overrides,
  };
}

async function mirrorRows(orgId: string) {
  return db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, orgId));
}

beforeEach(async () => {
  await truncateAll(db);
});

describe('createAdapterStore.save → campaigns_mirror', () => {
  it('mirrors saved campaigns with a first history snapshot and persists adapter state', async () => {
    const { orgId } = await freshOrg();
    const store = createAdapterStore(db, orgId);

    await store.save(orgId, 'google_ads', {
      campaigns: [view('11'), view('22', { name: 'Brand', status: 'paused', budgetDailyCents: 500 })],
    });

    const rows = await mirrorRows(orgId);
    expect(rows).toHaveLength(2);
    const first = rows.find((r) => r.externalId === '11')!;
    expect(first).toMatchObject({
      orgId,
      platform: 'google_ads',
      name: 'Search — Chicago',
      status: 'active',
      budgetDailyCents: 1000,
      mode: 'sandbox',
    });
    const metrics = first.metrics as MirrorMetrics;
    expect(metrics.impressions).toBe(100);
    expect(metrics.history).toEqual([{ date: today(), impressions: 100, clicks: 10, spendCents: 500, conversions: 2 }]);

    // The raw adapter state is persisted alongside the mirror.
    const [org] = await db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId));
    const adState = (org!.settings as Record<string, unknown>).adState as Record<string, { campaigns: unknown[] }>;
    expect(adState.google_ads.campaigns).toHaveLength(2);
  });

  it('replaces the same-day snapshot on a second save (no duplicate history entry)', async () => {
    const { orgId } = await freshOrg();
    const store = createAdapterStore(db, orgId);
    await store.save(orgId, 'google_ads', { campaigns: [view('11')] });

    await store.save(orgId, 'google_ads', {
      campaigns: [
        view('11', {
          name: 'Search — Chicago (renamed)',
          status: 'paused',
          budgetDailyCents: 1500,
          metrics: { impressions: 250, clicks: 25, spendCents: 1200, conversions: 5 },
        }),
      ],
    });

    const rows = await mirrorRows(orgId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Search — Chicago (renamed)', status: 'paused', budgetDailyCents: 1500 });
    const metrics = rows[0]!.metrics as MirrorMetrics;
    expect(metrics.impressions).toBe(250);
    expect(metrics.spendCents).toBe(1200);
    expect(metrics.history).toHaveLength(1); // same day → replaced, not appended
    expect(metrics.history[0]).toMatchObject({ date: today(), impressions: 250, conversions: 5 });
  });

  it('appends a new history entry when the last snapshot is from an earlier day', async () => {
    const { orgId } = await freshOrg();
    const store = createAdapterStore(db, orgId);
    await store.save(orgId, 'google_ads', { campaigns: [view('11')] });

    // Age the stored history so the next save looks like "the next day".
    const [row] = await mirrorRows(orgId);
    const aged: MirrorMetrics = {
      ...(row!.metrics as MirrorMetrics),
      history: [{ date: '2026-01-01', impressions: 100, clicks: 10, spendCents: 500, conversions: 2 }],
    };
    await db.update(campaignsMirror).set({ metrics: aged }).where(eq(campaignsMirror.id, row!.id));

    await store.save(orgId, 'google_ads', {
      campaigns: [view('11', { metrics: { impressions: 180, clicks: 18, spendCents: 900, conversions: 4 } })],
    });

    const [after] = await mirrorRows(orgId);
    const metrics = after!.metrics as MirrorMetrics;
    expect(metrics.history).toHaveLength(2);
    expect(metrics.history[0]!.date).toBe('2026-01-01');
    expect(metrics.history[1]).toMatchObject({ date: today(), impressions: 180 });
  });

  it('caps history at 90 snapshots', async () => {
    const { orgId } = await freshOrg();
    const store = createAdapterStore(db, orgId);
    await store.save(orgId, 'google_ads', { campaigns: [view('11')] });

    const [row] = await mirrorRows(orgId);
    const stale = Array.from({ length: 95 }, (_, i) => ({
      date: `2025-10-${String((i % 28) + 1).padStart(2, '0')}`,
      impressions: i,
      clicks: i,
      spendCents: i,
      conversions: 0,
    }));
    await db
      .update(campaignsMirror)
      .set({ metrics: { ...(row!.metrics as MirrorMetrics), history: stale } })
      .where(eq(campaignsMirror.id, row!.id));

    await store.save(orgId, 'google_ads', { campaigns: [view('11')] });

    const [after] = await mirrorRows(orgId);
    const metrics = after!.metrics as MirrorMetrics;
    expect(metrics.history).toHaveLength(90);
    expect(metrics.history[metrics.history.length - 1]!.date).toBe(today());
  });

  it('keeps mirror rows per platform even for a shared external id', async () => {
    const { orgId } = await freshOrg();
    const store = createAdapterStore(db, orgId);
    await store.save(orgId, 'google_ads', { campaigns: [view('shared-1')] });
    await store.save(orgId, 'meta', { campaigns: [view('shared-1', { platform: 'meta' })] });

    const rows = await mirrorRows(orgId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.platform).sort()).toEqual(['google_ads', 'meta']);
  });
});

describe('sandbox adapter → store → mirror (the loop sync.ts will own)', () => {
  it('campaigns created through the adapter land in campaigns_mirror', async () => {
    const { orgId } = await freshOrg();
    const adapter = await getOrgAdapter(db, orgId, 'google_ads');
    expect(adapter.mode).toBe('sandbox');

    const campaign = await adapter.createCampaign({
      name: 'Synced Campaign',
      objective: 'leads',
      dailyBudgetCents: 1000,
      targeting: { geography: 'Chicago' },
    });

    const rows = await mirrorRows(orgId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      platform: 'google_ads',
      externalId: campaign.externalId,
      name: 'Synced Campaign',
      status: 'active',
      budgetDailyCents: 1000,
    });
    expect((rows[0]!.metrics as MirrorMetrics).history).toHaveLength(1);
  });

  it('status changes through the adapter propagate to the mirror', async () => {
    const { orgId } = await freshOrg();
    const adapter = await getOrgAdapter(db, orgId, 'google_ads');
    const campaign = await adapter.createCampaign({
      name: 'To Pause',
      objective: 'traffic',
      dailyBudgetCents: 500,
      targeting: {},
    });

    await adapter.pauseCampaign(campaign.externalId);
    const [paused] = await db
      .select()
      .from(campaignsMirror)
      .where(and(eq(campaignsMirror.orgId, orgId), eq(campaignsMirror.externalId, campaign.externalId)));
    expect(paused!.status).toBe('paused');

    await adapter.updateBudget(campaign.externalId, 2500);
    const [updated] = await db
      .select()
      .from(campaignsMirror)
      .where(and(eq(campaignsMirror.orgId, orgId), eq(campaignsMirror.externalId, campaign.externalId)));
    expect(updated!.budgetDailyCents).toBe(2500);
  });
});
