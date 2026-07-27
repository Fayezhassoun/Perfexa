// Live adapter resolution (Phase 2): getOrgAdapter in live mode builds real
// API adapters from connected_accounts (decrypt → refresh-on-expiry → persist
// encrypted), and degrades to the safe stub / mock when anything is missing.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { connectedAccounts } from '@sayso/db';
import { LiveAdapterNotConnected, decrypt, encrypt, getGscQueries, type FetchLike } from '@sayso/integrations';
import { getOrgAdapter, getOrgGscQueries } from '../src/index.js';
import { db, freshOrg, truncateAll } from './helpers.js';

const ENV_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
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

interface RecordedCall {
  url: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

function fakeFetch(routes: Record<string, unknown>): { fetchImpl: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    for (const [match, body] of Object.entries(routes)) {
      if (url.includes(match)) {
        const status = (body as { __status?: number })?.__status ?? 200;
        return jsonResponse(body, status);
      }
    }
    return jsonResponse({ error: 'no route' }, 404);
  };
  return { fetchImpl, calls };
}

async function insertLiveAccount(
  orgId: string,
  platform: string,
  tokens: { accessToken: string; refreshToken?: string; expiresAt?: Date | null },
): Promise<void> {
  await db.insert(connectedAccounts).values({
    orgId,
    platform,
    mode: 'live',
    status: 'connected',
    externalAccountId: platform === 'gsc' ? 'https://example.com/' : '1234567890',
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt === undefined ? new Date(Date.now() + 3600_000) : tokens.expiresAt,
  });
}

beforeEach(async () => {
  await truncateAll(db);
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.GOOGLE_CLIENT_ID = 'google-cid';
  process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'dev-token';
  process.env.TIKTOK_APP_ID = 'tiktok-app-id';
  process.env.TIKTOK_APP_SECRET = 'tiktok-app-secret';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('getOrgAdapter in live mode', () => {
  it('calls the real API with the stored (decrypted) token', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'google_ads', { accessToken: 'at-live' });
    const { fetchImpl, calls } = fakeFetch({
      'googleAds:searchStream': [
        {
          results: [
            {
              campaign: { id: 9, name: 'Live Campaign', status: 'ENABLED' },
              campaignBudget: { amountMicros: '10000000' },
              metrics: { impressions: '5', clicks: '1', costMicros: '1000000', conversions: '0' },
            },
          ],
        },
      ],
    });

    const adapter = await getOrgAdapter(db, orgId, 'google_ads', { fetchImpl });
    expect(adapter.mode).toBe('live');
    const campaigns = await adapter.listCampaigns();
    expect(campaigns[0]).toMatchObject({ externalId: '9', name: 'Live Campaign', status: 'active' });
    expect(calls[0]!.init?.headers?.authorization).toBe('Bearer at-live');
    expect(calls[0]!.init?.headers?.['developer-token']).toBe('dev-token');
  });


  it('refreshes an expired token, persists it encrypted, and uses it', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'google_ads', {
      accessToken: 'at-old',
      refreshToken: 'rt-1',
      expiresAt: new Date(Date.now() - 60_000), // already expired
    });
    const { fetchImpl, calls } = fakeFetch({
      'oauth2.googleapis.com/token': { access_token: 'at-new', expires_in: 3600 },
      'googleAds:searchStream': [{ results: [] }],
    });

    const adapter = await getOrgAdapter(db, orgId, 'google_ads', { fetchImpl });
    await adapter.listCampaigns();

    const tokenCall = calls.find((c) => c.url.includes('oauth2.googleapis.com/token'));
    expect(tokenCall).toBeTruthy();
    expect(tokenCall!.init?.body).toContain('grant_type=refresh_token');
    expect(tokenCall!.init?.body).toContain('refresh_token=rt-1');

    const apiCall = calls.find((c) => c.url.includes('googleAds:searchStream'));
    expect(apiCall!.init?.headers?.authorization).toBe('Bearer at-new');

    const [row] = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.orgId, orgId), eq(connectedAccounts.platform, 'google_ads')));
    expect(decrypt(row!.accessTokenEnc!)).toBe('at-new');
    expect(row!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it('degrades to the safe stub when OAuth env is missing', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'google_ads', { accessToken: 'at-live' });
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

    const adapter = await getOrgAdapter(db, orgId, 'google_ads', { fetchImpl: fakeFetch({}).fetchImpl });
    expect(() => adapter.listCampaigns()).toThrow(LiveAdapterNotConnected);
  });

  it('degrades to the safe stub when the account has no tokens (sandbox-simulated)', async () => {
    const { orgId } = await freshOrg();
    await db.insert(connectedAccounts).values({
      orgId,
      platform: 'google_ads',
      mode: 'live',
      status: 'connected',
      externalAccountId: 'sandbox-google_ads-acct', // connectSandboxAccount leaves no tokens
    });
    const adapter = await getOrgAdapter(db, orgId, 'google_ads', { fetchImpl: fakeFetch({}).fetchImpl });
    expect(() => adapter.listCampaigns()).toThrow(LiveAdapterNotConnected);
  });

  it('tiktok live uses the Access-Token header (not Bearer)', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'tiktok', { accessToken: 'tt-at' });
    const { fetchImpl, calls } = fakeFetch({ 'campaign/get': { code: 0, data: { list: [] } } });

    const adapter = await getOrgAdapter(db, orgId, 'tiktok', { fetchImpl });
    expect(adapter.mode).toBe('live');
    await expect(adapter.listCampaigns()).resolves.toEqual([]);
    expect(calls[0]!.init?.headers?.['Access-Token']).toBe('tt-at');
    expect(calls[0]!.init?.headers?.authorization).toBeUndefined();
  });

  it('sandbox mode keeps using the deterministic mock adapter', async () => {
    const { orgId } = await freshOrg();
    const { fetchImpl, calls } = fakeFetch({});
    const adapter = await getOrgAdapter(db, orgId, 'google_ads', { fetchImpl });
    expect(adapter.mode).toBe('sandbox');
    expect(await adapter.listCampaigns()).toEqual([]);
    expect(calls).toHaveLength(0); // no network in sandbox
  });
});

describe('getOrgGscQueries', () => {
  it('returns the deterministic mock when GSC is not connected', async () => {
    const { orgId } = await freshOrg();
    const rows = await getOrgGscQueries(db, orgId, 'https://example.com');
    expect(rows).toEqual(await getGscQueries('https://example.com'));
  });

  it('returns live Search Console rows when connected live', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'gsc', { accessToken: 'at-gsc' });
    const { fetchImpl } = fakeFetch({
      'searchAnalytics/query': { rows: [{ keys: ['live query'], clicks: 9, impressions: 300, position: 7.4 }] },
    });
    const rows = await getOrgGscQueries(db, orgId, 'https://example.com', 30, { fetchImpl });
    expect(rows).toEqual([{ query: 'live query', clicks: 9, impressions: 300, position: 7 }]);
  });

  it('falls back to the mock when the live API fails', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'gsc', { accessToken: 'at-gsc' });
    const { fetchImpl } = fakeFetch({ 'searchAnalytics/query': { __status: 500, error: 'boom' } });
    const rows = await getOrgGscQueries(db, orgId, 'https://example.com', 30, { fetchImpl });
    expect(rows).toEqual(await getGscQueries('https://example.com'));
  });
});
