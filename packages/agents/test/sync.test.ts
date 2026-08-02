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
    expect(result).toEqual({ platform: 'google_ads', synced: 1 });

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
      fetchImpl: fakeFetch({ 'googleAds:searchStream': GOOGLE_CAMPAIGNS, 'graph.facebook.com': META_CAMPAIGNS }),
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
    expect(bRows[0]).toMatchObject({ externalId: '77', platform: 'meta', mode: 'live' });
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
