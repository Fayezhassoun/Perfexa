import { getConnectionHealth } from '../src/services/connection-health.js';
import { overview } from '../src/services/dashboard.js';
import { generateWeeklyReport } from '../src/services/reports.js';
import { vi } from 'vitest';
// Live data sync engine: syncOrgPlatform pulls live campaigns into
// campaigns_mirror (mode 'live') via the same write path the adapter store
// uses; syncOrg / syncAllOrgs isolate per-platform failures so one bad account
// can't abort a run (CONTRACTS §7/§8).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, campaignsMirror, connectedAccounts } from '@growthcrew/db';
import { encrypt, type FetchLike } from '@growthcrew/integrations';
import { syncAllOrgs, syncOrg, syncOrgPlatform } from '../src/services/sync.js';
import { db, freshOrg, truncateAll } from './helpers.js';

const ENV_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'META_APP_ID',
  'META_APP_SECRET',
  'TIKTOK_APP_ID',
  'TIKTOK_APP_SECRET',
] as const;
const savedEnv: Record<string, string | undefined> = {};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function fakeFetch(routes: Record<string, unknown>): FetchLike {
  return async (url) => {
    for (const [match, body] of Object.entries(routes)) {
      if (url.includes(match)) {
        const status = (body as { __status?: number })?.__status ?? 200;
        return jsonResponse(body, status);
      }
    }
    return jsonResponse({ error: 'no route' }, 404);
  };
}

async function insertLiveAccount(orgId: string, platform: string, accessToken: string): Promise<void> {
  await db.insert(connectedAccounts).values({
    orgId,
    platform,
    mode: 'live',
    status: 'connected',
    externalAccountId: '1234567890',
    accessTokenEnc: encrypt(accessToken),
    expiresAt: new Date(Date.now() + 3600_000),
  });
}

const GOOGLE_CAMPAIGNS = [
  {
    results: [
      {
        campaign: { id: 9, name: 'Live Campaign', status: 'ENABLED' },
        campaignBudget: { amountMicros: '10000000' },
        metrics: { impressions: '5', clicks: '1', costMicros: '1000000', conversions: '2' },
      },
    ],
  },
];

const META_METRICS = { data: [{ spend: '12.34', impressions: '100', clicks: '5', actions: [] }] };
const META_CAMPAIGNS = {
  data: [{ id: '77', name: 'Meta Camp', status: 'ACTIVE', daily_budget: '250' }],
};

beforeEach(async () => {
  await truncateAll(db);
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.GOOGLE_CLIENT_ID = 'google-cid';
  process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'dev-token';
  process.env.META_APP_ID = 'meta-app-id';
  process.env.META_APP_SECRET = 'meta-secret';
  process.env.TIKTOK_APP_ID = 'tiktok-app-id';
  process.env.TIKTOK_APP_SECRET = 'tiktok-secret';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('syncOrgPlatform', () => {
  it('skips when the platform is not connected', async () => {
    const { ctx, orgId } = await freshOrg();
    const result = await syncOrgPlatform(ctx, 'google_ads', { fetchImpl: fakeFetch({}) });
    expect(result).toEqual({ platform: 'google_ads', synced: 0, skipped: 'not-connected' });

    const rows = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, orgId));
    expect(rows).toHaveLength(0);
  });

  it('upserts live campaigns into campaigns_mirror with mode live and audit-logs', async () => {
    const { ctx, orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'google_ads', 'at-live');
    const fetchImpl = fakeFetch({ 'googleAds:searchStream': GOOGLE_CAMPAIGNS });

    const result = await syncOrgPlatform(ctx, 'google_ads', { fetchImpl });
    expect(result).toMatchObject({ platform: 'google_ads', synced: 1, externalAccountId: '1234567890', syncedAt: expect.any(String) });

    const [row] = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, orgId));
    expect(row).toMatchObject({
      externalId: '9',
      platform: 'google_ads',
      name: 'Live Campaign',
      status: 'active',
      budgetDailyCents: 1000,
      mode: 'live',
    });
    const metrics = row!.metrics as { impressions: number; clicks: number; spendCents: number; conversions: number };
    expect(metrics.impressions).toBe(5);
    expect(metrics.spendCents).toBe(100);

    const [account] = await db
      .select({ updatedAt: connectedAccounts.updatedAt })
      .from(connectedAccounts)
      .where(eq(connectedAccounts.orgId, orgId));
    expect(account?.updatedAt).toBeInstanceOf(Date);

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
    expect(audits.some((a) => a.action === 'sync.platform')).toBe(true);
  });

  it('re-syncing updates the existing mirror row in place (no duplicates)', async () => {
    const { ctx, orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'google_ads', 'at-live');

    await syncOrgPlatform(ctx, 'google_ads', { fetchImpl: fakeFetch({ 'googleAds:searchStream': GOOGLE_CAMPAIGNS }) });
    const updated = [
      {
        results: [
          {
            campaign: { id: 9, name: 'Live Campaign', status: 'PAUSED' },
            campaignBudget: { amountMicros: '10000000' },
            metrics: { impressions: '9', clicks: '3', costMicros: '1000000', conversions: '2' },
          },
        ],
      },
    ];
    await syncOrgPlatform(ctx, 'google_ads', { fetchImpl: fakeFetch({ 'googleAds:searchStream': updated }) });

    const rows = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, orgId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('paused');
    expect((rows[0]!.metrics as { impressions: number }).impressions).toBe(9);
  });

  it('promotes a matching sandbox mirror row to live during sync', async () => {
    const { ctx, orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'google_ads', 'at-live');
    await db.insert(campaignsMirror).values({
      orgId,
      platform: 'google_ads',
      externalId: '9',
      name: 'Sandbox copy',
      mode: 'sandbox',
      metrics: { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 },
    });

    await syncOrgPlatform(ctx, 'google_ads', { fetchImpl: fakeFetch({ 'googleAds:searchStream': GOOGLE_CAMPAIGNS }) });

    const rows = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, orgId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ externalId: '9', mode: 'live', name: 'Live Campaign' });
  });
});

describe('syncOrg', () => {
  it('isolates per-platform failures and skips non-connected platforms', async () => {
    const { ctx, orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'google_ads', 'at-live');
    await insertLiveAccount(orgId, 'meta', 'at-meta');
    const fetchImpl = fakeFetch({
      'googleAds:searchStream': GOOGLE_CAMPAIGNS,
      'graph.facebook.com': { __status: 400, error: 'bad request' },
    });

    const results = await syncOrg(ctx, { fetchImpl });
    const byPlatform = Object.fromEntries(results.map((r) => [r.platform, r]));

    expect(byPlatform.google_ads).toMatchObject({ synced: 1 });
    expect(byPlatform.meta?.error).toBeTruthy();
    expect(byPlatform.tiktok).toMatchObject({ synced: 0, skipped: 'not-connected' });
  });
});

describe('syncAllOrgs', () => {
  it('syncs only orgs with live-connected ad accounts and aggregates the run', async () => {
    const a = await freshOrg();
    const b = await freshOrg();
    const c = await freshOrg();
    await insertLiveAccount(a.orgId, 'google_ads', 'at-a');
    await insertLiveAccount(b.orgId, 'meta', 'at-b');
    // Sandbox + non-ad-platform accounts must be ignored.
    await db.insert(connectedAccounts).values({
      orgId: b.orgId,
      platform: 'google_ads',
      mode: 'sandbox',
      status: 'connected',
      externalAccountId: 'sandbox-google_ads-acct',
    });
    await insertLiveAccount(a.orgId, 'ga4', 'at-ga4');
    void c; // org c has no live accounts → excluded

    const run = await syncAllOrgs(db, {
      fetchImpl: fakeFetch({ 'googleAds:searchStream': GOOGLE_CAMPAIGNS, '/77/insights': META_METRICS, 'graph.facebook.com': META_CAMPAIGNS }),
    });

    expect(run.orgs).toBe(2);
    expect(run.platforms).toBe(2);
    expect(run.synced).toBe(2);
    expect(run.skipped).toBe(0);
    expect(run.errors).toEqual([]);

    const aRows = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, a.orgId));
    const bRows = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, b.orgId));
    expect(aRows).toHaveLength(1);
    expect(bRows).toHaveLength(1);
    expect(bRows[0]).toMatchObject({ externalId: '77', platform: 'meta', mode: 'live', metrics: { spendCents: 1234 } });
  });

  it('collects per-org errors without aborting the rest of the run', async () => {
    const a = await freshOrg();
    const b = await freshOrg();
    await insertLiveAccount(a.orgId, 'google_ads', 'at-a');
    await insertLiveAccount(b.orgId, 'meta', 'at-b');

    const run = await syncAllOrgs(db, {
      fetchImpl: fakeFetch({
        'googleAds:searchStream': GOOGLE_CAMPAIGNS,
        'graph.facebook.com': { __status: 400, error: 'bad request' },
      }),
    });

    expect(run.synced).toBe(1); // org A still synced
    expect(run.errors).toHaveLength(1);
    expect(run.errors[0]).toContain('meta');
  });
});

describe('pilot sync evidence', () => {
  it('never reads a real provider while the OAuth account is still in sandbox', async () => {
    const { ctx, orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'google_ads', 'test-token');
    await db.update(connectedAccounts).set({ mode: 'sandbox' }).where(eq(connectedAccounts.orgId, orgId));
    const fetchImpl = vi.fn(fakeFetch({}));
    expect(await syncOrgPlatform(ctx, 'google_ads', { fetchImpl })).toMatchObject({ synced: 0, skipped: expect.stringContaining('sandbox-mode') });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await getConnectionHealth(ctx))[0]?.lastSyncAt).toBeNull();
  });
  it('records a successful empty read without inventing live campaign data', async () => {
    const { ctx, orgId } = await freshOrg({ now: new Date('2026-09-05T09:00:00Z') });
    await insertLiveAccount(orgId, 'google_ads', 'test-token');
    const result = await syncOrgPlatform(ctx, 'google_ads', { fetchImpl: fakeFetch({ 'googleAds:searchStream': [] }) });
    expect(result).toMatchObject({ synced: 0, syncedAt: '2026-09-05T09:00:00.000Z' });
    const dashboard = await overview(ctx);
    expect(dashboard.dataSource).toBe('none');
    expect(dashboard.syncs).toEqual([result]);
    expect((await getConnectionHealth(ctx))[0]?.lastSyncAt?.toISOString()).toBe(result.syncedAt);
  });
  it('retains source timestamps and reconciles snapshots once after repeated syncs', async () => {
    const { ctx, orgId } = await freshOrg({ now: new Date('2026-09-04T09:00:00Z') });
    await insertLiveAccount(orgId, 'google_ads', 'test-token');
    const fetchImpl = fakeFetch({ 'googleAds:searchStream': GOOGLE_CAMPAIGNS });
    await syncOrgPlatform(ctx, 'google_ads', { fetchImpl });
    const next = { ...ctx, now: new Date('2026-09-05T09:00:00Z') };
    await syncOrgPlatform(next, 'google_ads', { fetchImpl });
    const { report } = await generateWeeklyReport(next);
    expect(report.content.dataSource).toBe('live');
    expect(report.content.totals.spendCents).toBe(100);
    expect(report.content.byPlatform.google_ads?.spendCents).toBe(100);
    expect(report.content.sourceSyncs).toEqual([{ platform: 'google_ads', externalAccountId: '1234567890', syncedAt: '2026-09-05T09:00:00.000Z' }]);
    expect(report.content.markdown).toContain('Data source: live');
    expect(report.content.markdown).toContain('2026-09-05T09:00:00.000Z');
    expect(report.content.metricBasis).toContain('LAST_30_DAYS');
    expect((await overview(next)).dataSource).toBe('live');
  });
});

it('a later empty sync retires old live rows from dashboard and reports', async () => {
  const { ctx, orgId } = await freshOrg({ now: new Date('2026-09-04T09:00:00Z') });
  await insertLiveAccount(orgId, 'google_ads', 'test-token');
  await syncOrgPlatform(ctx, 'google_ads', { fetchImpl: fakeFetch({ 'googleAds:searchStream': GOOGLE_CAMPAIGNS }) });
  const next = { ...ctx, now: new Date('2026-09-05T09:00:00Z') };
  await syncOrgPlatform(next, 'google_ads', { fetchImpl: fakeFetch({ 'googleAds:searchStream': [] }) });
  expect(await overview(next)).toMatchObject({ campaigns: 0, dataSource: 'none', totals: { spendCents: 0 }, syncs: [{ synced: 0 }] });
  expect((await generateWeeklyReport(next)).report.content.totals.spendCents).toBe(0);
});

it('failed metrics fetch leaves the last successful snapshot and timestamp intact', async () => {
  const { ctx, orgId } = await freshOrg({ now: new Date('2026-09-04T09:00:00Z') });
  await insertLiveAccount(orgId, 'meta', 'test-token');
  await syncOrgPlatform(ctx, 'meta', { fetchImpl: fakeFetch({ '/77/insights': META_METRICS, 'graph.facebook.com': META_CAMPAIGNS }) });
  const next = { ...ctx, now: new Date('2026-09-05T09:00:00Z') };
  const result = await syncOrg(next, { fetchImpl: fakeFetch({ '/77/insights': { __status: 400, error: 'permission denied' }, 'graph.facebook.com': META_CAMPAIGNS }) });
  expect(result.find((r) => r.platform === 'meta')?.error).toBeTruthy();
  const dashboard = await overview(next);
  expect(dashboard.totals.spendCents).toBe(1234);
  expect(dashboard.syncs[0]?.syncedAt).toBe('2026-09-04T09:00:00.000Z');
});

it('does not promote simulated history into a live report', async () => {
  const { ctx, orgId } = await freshOrg({ now: new Date('2026-09-05T09:00:00Z') });
  await insertLiveAccount(orgId, 'google_ads', 'test-token');
  await db.insert(campaignsMirror).values({ orgId, platform: 'google_ads', externalId: '9', mode: 'sandbox', metrics: { spendCents: 99999, history: [{ date: '2026-09-04', spendCents: 99999 }] } });
  await syncOrgPlatform(ctx, 'google_ads', { fetchImpl: fakeFetch({ 'googleAds:searchStream': GOOGLE_CAMPAIGNS }) });
  const [row] = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, orgId));
  expect((row!.metrics as { history: unknown[] }).history).toHaveLength(1);
  expect((await generateWeeklyReport(ctx)).report.content.totals.spendCents).toBe(100);
});
