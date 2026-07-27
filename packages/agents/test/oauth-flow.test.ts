// OAuth connect flow services (Phase 2): startOAuthFlow builds a signed
// provider URL; completeOAuthFlow stores tokens AES-256-GCM encrypted, keeps
// the account in sandbox (never auto-live), and audit-logs — all offline via
// injected fetch.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, connectedAccounts } from '@sayso/db';
import { decrypt, signOAuthState, type ConnectablePlatform, type FetchLike } from '@sayso/integrations';
import { completeOAuthFlow, redirectUriFor, startOAuthFlow } from '../src/services/oauth.js';
import { db, freshOrg, truncateAll } from './helpers.js';

const ENV_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'META_APP_ID',
  'META_APP_SECRET',
  'TIKTOK_APP_ID',
  'TIKTOK_APP_SECRET',
  'AUTH_SECRET',
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

function stateFor(orgId: string, platform: ConnectablePlatform): string {
  return signOAuthState(
    { orgId, platform, nonce: 'test-nonce', exp: Date.now() + 60_000 },
    process.env.AUTH_SECRET!,
  );
}

beforeEach(async () => {
  await truncateAll(db);
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.AUTH_SECRET = 'oauth-flow-test-secret-32-bytes!!';
  process.env.GOOGLE_CLIENT_ID = 'google-cid';
  process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'dev-token';
  process.env.META_APP_ID = 'meta-app-id';
  process.env.META_APP_SECRET = 'meta-app-secret';
  process.env.TIKTOK_APP_ID = 'tiktok-app-id';
  process.env.TIKTOK_APP_SECRET = 'tiktok-app-secret';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('startOAuthFlow', () => {
  it('builds the provider URL with a verifiable signed state', async () => {
    const { ctx } = await freshOrg();
    const { url } = startOAuthFlow(ctx, 'google_ads');
    const parsed = new URL(url);

    expect(parsed.host).toBe('accounts.google.com');
    expect(parsed.searchParams.get('client_id')).toBe('google-cid');
    expect(parsed.searchParams.get('redirect_uri')).toBe(redirectUriFor('google_ads'));
    expect(parsed.searchParams.get('redirect_uri')).toContain('/api/integrations/google_ads/callback');

    // state is bound to the org that started the flow
    const state = parsed.searchParams.get('state')!;
    const otherOrg = await freshOrg();
    await expect(
      completeOAuthFlow(otherOrg.ctx, 'google_ads', { code: 'c', state }, { fetchImpl: fakeFetch({}) }),
    ).rejects.toThrow(/does not match/i);
  });

  it('throws a user-safe error when the app credentials are missing', async () => {
    delete process.env.META_APP_ID;
    const { ctx } = await freshOrg();
    expect(() => startOAuthFlow(ctx, 'meta')).toThrow(/OAuth isn't configured/i);
  });
});


describe('completeOAuthFlow', () => {
  it('stores tokens encrypted, stays in sandbox, and audit-logs', async () => {
    const { ctx, orgId } = await freshOrg();
    const fetchImpl = fakeFetch({
      'oauth2.googleapis.com/token': {
        access_token: 'at-live-1',
        refresh_token: 'rt-live-1',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/adwords',
      },
      'customers:listAccessibleCustomers': { resourceNames: ['customers/9876543210'] },
    });

    const account = await completeOAuthFlow(
      ctx,
      'google_ads',
      { code: 'code-1', state: stateFor(orgId, 'google_ads') },
      { fetchImpl },
    );

    expect(account.externalAccountId).toBe('9876543210');
    expect(account.mode).toBe('sandbox'); // never auto-live — the LIVE confirm is separate
    expect(account.status).toBe('connected');
    expect(decrypt(account.accessTokenEnc!)).toBe('at-live-1');
    expect(decrypt(account.refreshTokenEnc!)).toBe('rt-live-1');
    expect(account.expiresAt).toBeTruthy();
    expect(account.accessTokenEnc).not.toContain('at-live-1'); // actually encrypted at rest

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
    const connected = audits.find((a) => a.action === 'integration.connected');
    expect(connected).toBeTruthy();
    expect(connected!.entityType).toBe('connected_account');
    expect(connected!.entityId).toBe(account.id);
  });

  it('reconnect replaces tokens but preserves an existing live mode', async () => {
    const { ctx, orgId } = await freshOrg();
    const firstFetch = fakeFetch({
      'oauth2.googleapis.com/token': { access_token: 'at-2', refresh_token: 'rt-2', expires_in: 3600 },
      'customers:listAccessibleCustomers': { resourceNames: ['customers/111'] },
    });
    const first = await completeOAuthFlow(
      ctx,
      'google_ads',
      { code: 'c', state: stateFor(orgId, 'google_ads') },
      { fetchImpl: firstFetch },
    );
    await db.update(connectedAccounts).set({ mode: 'live' }).where(eq(connectedAccounts.id, first.id));

    const secondFetch = fakeFetch({
      'oauth2.googleapis.com/token': { access_token: 'at-3', refresh_token: 'rt-3', expires_in: 3600 },
      'customers:listAccessibleCustomers': { resourceNames: ['customers/222'] },
    });
    const second = await completeOAuthFlow(
      ctx,
      'google_ads',
      { code: 'c', state: stateFor(orgId, 'google_ads') },
      { fetchImpl: secondFetch },
    );
    expect(second.id).toBe(first.id);
    expect(second.mode).toBe('live');
    expect(second.externalAccountId).toBe('222');
    expect(decrypt(second.accessTokenEnc!)).toBe('at-3');
  });

  it('connects Meta via me/adaccounts discovery', async () => {
    const { ctx, orgId } = await freshOrg();
    const fetchImpl = fakeFetch({
      'graph.facebook.com/v20.0/oauth/access_token': { access_token: 'mat-1', expires_in: 5184000 },
      'me/adaccounts': { data: [{ id: 'act_4242' }] },
    });
    const account = await completeOAuthFlow(ctx, 'meta', { code: 'c', state: stateFor(orgId, 'meta') }, { fetchImpl });
    expect(account.externalAccountId).toBe('act_4242');
    expect(account.refreshTokenEnc).toBeNull();
    expect(decrypt(account.accessTokenEnc!)).toBe('mat-1');
  });

  it('connects GA4 via accountSummaries discovery', async () => {
    const { ctx, orgId } = await freshOrg();
    const fetchImpl = fakeFetch({
      'oauth2.googleapis.com/token': { access_token: 'at-ga4', refresh_token: 'rt-ga4', expires_in: 3600 },
      accountSummaries: { accountSummaries: [{ propertySummaries: [{ property: 'properties/777' }] }] },
    });
    const account = await completeOAuthFlow(ctx, 'ga4', { code: 'c', state: stateFor(orgId, 'ga4') }, { fetchImpl });
    expect(account.externalAccountId).toBe('777');
  });

  it('connects TikTok via advertiser discovery (JSON envelope)', async () => {
    const { ctx, orgId } = await freshOrg();
    const fetchImpl = fakeFetch({
      'oauth2/access_token': { code: 0, data: { access_token: 'tt-at', refresh_token: 'tt-rt', expires_in: 86400 } },
      'oauth2/advertiser/get': { code: 0, data: { list: [{ advertiser_id: '556677' }] } },
    });
    const account = await completeOAuthFlow(ctx, 'tiktok', { code: 'c', state: stateFor(orgId, 'tiktok') }, { fetchImpl });
    expect(account.externalAccountId).toBe('556677');
    expect(account.mode).toBe('sandbox');
    expect(decrypt(account.accessTokenEnc!)).toBe('tt-at');
  });

  it('rejects a tampered or platform-mismatched state', async () => {
    const { ctx, orgId } = await freshOrg();
    await expect(
      completeOAuthFlow(ctx, 'google_ads', { code: 'c', state: 'garbage.sig' }, { fetchImpl: fakeFetch({}) }),
    ).rejects.toThrow(/state/i);

    const metaState = stateFor(orgId, 'meta');
    await expect(
      completeOAuthFlow(ctx, 'google_ads', { code: 'c', state: metaState }, { fetchImpl: fakeFetch({}) }),
    ).rejects.toThrow(/does not match/i);
  });
});
