// Token refresh (CONTRACTS §7): loadLiveDeps hands back a getAccessToken()
// that serves the cached token while fresh, renews within the 60s leeway
// (or after expiry), and persists the new tokens back AES-encrypted.

import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { connectedAccounts } from '@growthcrew/db';
import { decrypt, encrypt, type FetchLike } from '@growthcrew/integrations';
import { loadLiveDeps } from '../src/index.js';
import { db, freshOrg, truncateAll } from './helpers.js';

const GOOGLE_ENV = {
  GOOGLE_CLIENT_ID: 'google-cid',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token',
} as NodeJS.ProcessEnv;

const META_ENV = {
  META_APP_ID: 'meta-app-id',
  META_APP_SECRET: 'meta-app-secret',
} as NodeJS.ProcessEnv;

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
    externalAccountId: '1234567890',
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt === undefined ? new Date(Date.now() + 3600_000) : tokens.expiresAt,
  });
}

async function accountRow(orgId: string, platform: string) {
  const [row] = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.orgId, orgId), eq(connectedAccounts.platform, platform)));
  return row!;
}

beforeEach(async () => {
  await truncateAll(db);
});

describe('loadLiveDeps getAccessToken', () => {
  it('returns the cached token while fresh, without any network call', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'google_ads', {
      accessToken: 'at-live',
      refreshToken: 'rt-1',
      expiresAt: new Date(Date.now() + 3600_000),
    });
    const { fetchImpl, calls } = fakeFetch({});

    const deps = await loadLiveDeps(db, orgId, 'google_ads', { fetchImpl, env: GOOGLE_ENV });
    expect(deps).not.toBeNull();
    await expect(deps!.getAccessToken()).resolves.toBe('at-live');
    expect(calls).toHaveLength(0);
  });

  it('refreshes within the 60s leeway and persists the new token encrypted', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'google_ads', {
      accessToken: 'at-old',
      refreshToken: 'rt-1',
      expiresAt: new Date(Date.now() + 30_000), // inside the 60s leeway
    });
    const { fetchImpl, calls } = fakeFetch({
      'oauth2.googleapis.com/token': { access_token: 'at-new', expires_in: 3600 },
    });

    const deps = await loadLiveDeps(db, orgId, 'google_ads', { fetchImpl, env: GOOGLE_ENV });
    await expect(deps!.getAccessToken()).resolves.toBe('at-new');

    const tokenCall = calls.find((c) => c.url.includes('oauth2.googleapis.com/token'));
    expect(tokenCall).toBeTruthy();
    expect(tokenCall!.init?.body).toContain('grant_type=refresh_token');
    expect(tokenCall!.init?.body).toContain('refresh_token=rt-1');
    expect(tokenCall!.init?.body).toContain('client_id=google-cid');

    const row = await accountRow(orgId, 'google_ads');
    expect(decrypt(row.accessTokenEnc!)).toBe('at-new');
    // New expiry ≈ now + 3600s, comfortably past the leeway window.
    expect(row.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 3000_000);
    expect(row.status).toBe('connected');
  });

  it('caches the refreshed token — a second call does not hit the token endpoint again', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'google_ads', {
      accessToken: 'at-old',
      refreshToken: 'rt-1',
      expiresAt: new Date(Date.now() + 10_000),
    });
    const { fetchImpl, calls } = fakeFetch({
      'oauth2.googleapis.com/token': { access_token: 'at-new', expires_in: 3600 },
    });

    const deps = await loadLiveDeps(db, orgId, 'google_ads', { fetchImpl, env: GOOGLE_ENV });
    await expect(deps!.getAccessToken()).resolves.toBe('at-new');
    await expect(deps!.getAccessToken()).resolves.toBe('at-new');
    expect(calls.filter((c) => c.url.includes('oauth2.googleapis.com/token'))).toHaveLength(1);
  });

  it('keeps the current token when Google has no refresh token (a 401 will prompt reconnect)', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'google_ads', {
      accessToken: 'at-old',
      expiresAt: new Date(Date.now() - 60_000), // expired, but nothing to renew with
    });
    const { fetchImpl, calls } = fakeFetch({});

    const deps = await loadLiveDeps(db, orgId, 'google_ads', { fetchImpl, env: GOOGLE_ENV });
    await expect(deps!.getAccessToken()).resolves.toBe('at-old');
    expect(calls).toHaveLength(0);
  });

  it('meta renews with the current token when no refresh token is stored', async () => {
    const { orgId } = await freshOrg();
    await db.insert(connectedAccounts).values({
      orgId,
      platform: 'meta',
      mode: 'live',
      status: 'connected',
      externalAccountId: 'act_777',
      accessTokenEnc: encrypt('mat-old'),
      expiresAt: new Date(Date.now() + 20_000), // inside the leeway
    });
    const { fetchImpl, calls } = fakeFetch({
      'oauth/access_token': { access_token: 'mat-new', expires_in: 5_183_944 },
    });

    const deps = await loadLiveDeps(db, orgId, 'meta', { fetchImpl, env: META_ENV });
    await expect(deps!.getAccessToken()).resolves.toBe('mat-new');

    const tokenCall = calls.find((c) => c.url.includes('oauth/access_token'));
    expect(tokenCall!.init?.body).toContain('grant_type=fb_exchange_token');
    expect(tokenCall!.init?.body).toContain('fb_exchange_token=mat-old');

    const row = await accountRow(orgId, 'meta');
    expect(decrypt(row.accessTokenEnc!)).toBe('mat-new');
  });

  it('persists a rotated refresh token when the provider returns one', async () => {
    const { orgId } = await freshOrg();
    await insertLiveAccount(orgId, 'google_ads', {
      accessToken: 'at-old',
      refreshToken: 'rt-1',
      expiresAt: new Date(Date.now() - 1000),
    });
    const { fetchImpl } = fakeFetch({
      'oauth2.googleapis.com/token': { access_token: 'at-new', refresh_token: 'rt-rotated', expires_in: 3600 },
    });

    const deps = await loadLiveDeps(db, orgId, 'google_ads', { fetchImpl, env: GOOGLE_ENV });
    await deps!.getAccessToken();

    const row = await accountRow(orgId, 'google_ads');
    expect(decrypt(row.accessTokenEnc!)).toBe('at-new');
    expect(decrypt(row.refreshTokenEnc!)).toBe('rt-rotated');
  });
});
