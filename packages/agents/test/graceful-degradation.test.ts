// Graceful degradation (CONTRACTS §3 rule): with no live connection
// (loadLiveDeps → null) the GA4/GSC resolvers return the deterministic
// mock series without throwing and without touching the network — and a
// connected-but-failing live API degrades the same way.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectedAccounts } from '@growthcrew/db';
import { encrypt, getGa4Traffic, getGscQueries, type FetchLike } from '@growthcrew/integrations';
import { getOrgGa4Traffic, getOrgGscQueries } from '../src/index.js';
import { db, freshOrg, truncateAll } from './helpers.js';

const ENV_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const;
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
    for (const [match, value] of Object.entries(routes)) {
      if (url.includes(match)) {
        if (value instanceof Error) throw value;
        const status = (value as { __status?: number })?.__status ?? 200;
        return jsonResponse(value, status);
      }
    }
    return jsonResponse({ error: 'no route' }, 404);
  };
  return { fetchImpl, calls };
}

async function insertLiveAccount(orgId: string, platform: 'ga4' | 'gsc', accessToken: string): Promise<void> {
  await db.insert(connectedAccounts).values({
    orgId,
    platform,
    mode: 'live',
    status: 'connected',
    externalAccountId: platform === 'gsc' ? 'https://example.com/' : '123456789',
    accessTokenEnc: encrypt(accessToken),
    expiresAt: new Date(Date.now() + 3600_000),
  });
}

beforeEach(async () => {
  await truncateAll(db);
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.GOOGLE_CLIENT_ID = 'google-cid';
  process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('no connection → deterministic mock, no throw, no network', () => {
  it('GSC resolver falls back to the mock series', async () => {
    const { orgId } = await freshOrg();
    const { fetchImpl, calls } = fakeFetch({});
    const rows = await getOrgGscQueries(db, orgId, 'https://example.com', 30, { fetchImpl });
    expect(rows).toEqual(await getGscQueries('https://example.com'));
    expect(rows.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
  });

  it('GA4 resolver falls back to the mock series', async () => {
    const { orgId } = await freshOrg();
    const { fetchImpl, calls } = fakeFetch({});
    const rows = await getOrgGa4Traffic(db, orgId, 'https://example.com', 30, { fetchImpl });
    expect(rows).toEqual(await getGa4Traffic('https://example.com'));
    expect(rows.length).toBe(30);
    expect(calls).toHaveLength(0);
  });

  it('both resolvers are deterministic across calls for the same property', async () => {
    const { orgId } = await freshOrg();
    const { fetchImpl } = fakeFetch({});
    expect(await getOrgGa4Traffic(db, orgId, 'https://example.com', 30, { fetchImpl })).toEqual(
      await getOrgGa4Traffic(db, orgId, 'https://example.com', 30, { fetchImpl }),
    );
    expect(await getOrgGscQueries(db, orgId, 'https://example.com', 30, { fetchImpl })).toEqual(
      await getOrgGscQueries(db, orgId, 'https://example.com', 30, { fetchImpl }),
    );
  });

  it('falls back when OAuth env is not configured at all', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const { orgId } = await freshOrg();
    const { fetchImpl, calls } = fakeFetch({});
    await expect(getOrgGa4Traffic(db, orgId, 'https://example.com', 30, { fetchImpl })).resolves.toEqual(
      await getGa4Traffic('https://example.com'),
    );
    await expect(getOrgGscQueries(db, orgId, 'https://example.com', 30, { fetchImpl })).resolves.toEqual(
      await getGscQueries('https://example.com'),
    );
    expect(calls).toHaveLength(0);
  });

  it('falls back when the account row has no tokens (sandbox-simulated connect)', async () => {
    const { orgId } = await freshOrg();
    await db.insert(connectedAccounts).values({
      orgId,
      platform: 'ga4',
      mode: 'live',
      status: 'connected',
      externalAccountId: 'sandbox-ga4-property', // no accessTokenEnc
    });
    const { fetchImpl, calls } = fakeFetch({});
    await expect(getOrgGa4Traffic(db, orgId, 'https://example.com', 30, { fetchImpl })).resolves.toEqual(
      await getGa4Traffic('https://example.com'),
    );
    expect(calls).toHaveLength(0);
  });
});

describe('connected but failing live API → same mock fallback', () => {
  it('GA4 HTTP 500 degrades to the mock series', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'ga4', 'at-ga4');
    const { fetchImpl, calls } = fakeFetch({
      'analyticsdata.googleapis.com': { __status: 500, error: { code: 500, message: 'Internal error.' } },
    });
    await expect(getOrgGa4Traffic(db, orgId, 'https://example.com', 30, { fetchImpl })).resolves.toEqual(
      await getGa4Traffic('https://example.com'),
    );
    expect(calls.length).toBeGreaterThan(0); // live was attempted, then degraded
  });

  it('GSC HTTP 500 degrades to the mock series', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'gsc', 'at-gsc');
    const { fetchImpl } = fakeFetch({ 'searchAnalytics/query': { __status: 500, error: 'boom' } });
    await expect(getOrgGscQueries(db, orgId, 'https://example.com', 30, { fetchImpl })).resolves.toEqual(
      await getGscQueries('https://example.com'),
    );
  });

  it('a network failure degrades to the mock series instead of throwing', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'ga4', 'at-ga4');
    const { fetchImpl } = fakeFetch({ 'analyticsdata.googleapis.com': new Error('socket hang up') });
    await expect(getOrgGa4Traffic(db, orgId, 'https://example.com', 30, { fetchImpl })).resolves.toEqual(
      await getGa4Traffic('https://example.com'),
    );
  });
});
