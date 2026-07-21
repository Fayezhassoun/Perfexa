// OAuth helpers (Phase 2): authorize URLs, signed state, token exchange /
// refresh / account discovery — all offline via injected fetch.

import { describe, expect, it } from 'vitest';
import {
  AdapterError,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  fetchExternalAccountId,
  oauthProviderFor,
  refreshAccessToken,
  scopesFor,
  signOAuthState,
  verifyOAuthState,
  type FetchLike,
  type OAuthStatePayload,
} from '../src/index.js';

const SECRET = 'test-secret-32-bytes-minimum-aaaaaa';

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

/** Fetch stub: routes by URL substring, records every call. */
export function fakeFetch(routes: Record<string, unknown>): { fetchImpl: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    for (const [match, value] of Object.entries(routes)) {
      if (url.includes(match)) {
        if (value instanceof Error) throw value;
        const body = typeof value === 'function' ? (value as (u: string, i: unknown) => unknown)(url, init) : value;
        const status = (body as { __status?: number })?.__status ?? 200;
        return jsonResponse(body, status);
      }
    }
    return jsonResponse({ error: 'no route' }, 404);
  };
  return { fetchImpl, calls };
}

export function parsedBody(call: RecordedCall | undefined): Record<string, unknown> {
  if (!call?.init?.body) return {};
  try {
    return JSON.parse(call.init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

describe('buildAuthorizationUrl', () => {
  it('builds the Google consent URL with offline access + per-platform scope', () => {
    const url = new URL(
      buildAuthorizationUrl({ platform: 'google_ads', clientId: 'cid', redirectUri: 'https://app.test/cb', state: 'st' }),
    );
    expect(url.host).toBe('accounts.google.com');
    expect(url.pathname).toBe('/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.test/cb');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/adwords');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('st');
  });

  it('uses the right Google scope per platform and Meta dialog for meta', () => {
    expect(scopesFor('ga4')).toEqual(['https://www.googleapis.com/auth/analytics.readonly']);
    expect(scopesFor('gsc')).toEqual(['https://www.googleapis.com/auth/webmasters.readonly']);
    expect(oauthProviderFor('meta')).toBe('meta');

    const url = new URL(
      buildAuthorizationUrl({ platform: 'meta', clientId: 'mid', redirectUri: 'https://app.test/cb', state: 'st' }),
    );
    expect(url.host).toBe('www.facebook.com');
    expect(url.pathname).toBe('/v20.0/dialog/oauth');
    expect(url.searchParams.get('scope')).toContain('ads_management');
  });
});

describe('OAuth state sign/verify', () => {
  const payload: OAuthStatePayload = { orgId: 'org-1', platform: 'meta', nonce: 'n', exp: Date.now() + 60_000 };

  it('round-trips', () => {
    expect(verifyOAuthState(signOAuthState(payload, SECRET), SECRET)).toEqual(payload);
  });

  it('rejects tampered signatures and wrong secrets', () => {
    const token = signOAuthState(payload, SECRET);
    const [body] = token.split('.');
    expect(() => verifyOAuthState(`${body}.AAAA`, SECRET)).toThrow(/mismatch|invalid/i);
    expect(() => verifyOAuthState(token, 'other-secret-32-bytes-minimum-bbbb')).toThrow(/mismatch/i);
    expect(() => verifyOAuthState('garbage', SECRET)).toThrow(/invalid/i);
  });

  it('rejects expired state', () => {
    const expired = { ...payload, exp: Date.now() - 1000 };
    expect(() => verifyOAuthState(signOAuthState(expired, SECRET), SECRET)).toThrow(/expired/i);

describe('exchangeCodeForTokens / refreshAccessToken', () => {
  it('exchanges a Google code and maps the token response', async () => {
    const { fetchImpl, calls } = fakeFetch({
      'oauth2.googleapis.com/token': { access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'a b' },
    });
    const tokens = await exchangeCodeForTokens({
      platform: 'ga4',
      clientId: 'cid',
      clientSecret: 'sec',
      code: 'code-1',
      redirectUri: 'https://app.test/cb',
      fetchImpl,
    });
    expect(tokens).toEqual({ accessToken: 'at', refreshToken: 'rt', expiresInSec: 3600, scopes: ['a', 'b'] });
    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.init?.body).toContain('grant_type=authorization_code');
    expect(calls[0]!.init?.body).toContain('code=code-1');
  });

  it('maps Meta responses (string expires_in, no refresh token)', async () => {
    const { fetchImpl } = fakeFetch({ 'graph.facebook.com': { access_token: 'mat', expires_in: '5183999' } });
    const tokens = await exchangeCodeForTokens({
      platform: 'meta',
      clientId: 'cid',
      clientSecret: 'sec',
      code: 'c',
      redirectUri: 'https://app.test/cb',
      fetchImpl,
    });
    expect(tokens.accessToken).toBe('mat');
    expect(tokens.refreshToken).toBeNull();
    expect(tokens.expiresInSec).toBe(5183999);
  });

  it('throws AdapterError on HTTP errors', async () => {
    const { fetchImpl } = fakeFetch({ 'oauth2.googleapis.com': { __status: 400, error: 'invalid_grant' } });
    await expect(
      exchangeCodeForTokens({
        platform: 'google_ads',
        clientId: 'c',
        clientSecret: 's',
        code: 'bad',
        redirectUri: 'https://app.test/cb',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(AdapterError);
  });

  it('refreshes Google tokens with the refresh_token grant', async () => {
    const { fetchImpl, calls } = fakeFetch({
      'oauth2.googleapis.com/token': { access_token: 'at-new', expires_in: 3600 },
    });
    const tokens = await refreshAccessToken({
      platform: 'gsc',
      clientId: 'c',
      clientSecret: 's',
      refreshToken: 'rt-old',
      fetchImpl,
    });
    expect(tokens.accessToken).toBe('at-new');
    expect(calls[0]!.init?.body).toContain('grant_type=refresh_token');
    expect(calls[0]!.init?.body).toContain('refresh_token=rt-old');
  });

  it('refreshes Meta tokens via fb_exchange_token', async () => {
    const { fetchImpl, calls } = fakeFetch({ 'graph.facebook.com': { access_token: 'mat-new', expires_in: 5184000 } });
    const tokens = await refreshAccessToken({
      platform: 'meta',
      clientId: 'c',
      clientSecret: 's',
      refreshToken: 'mat-old',
      fetchImpl,
    });
    expect(tokens.accessToken).toBe('mat-new');
    expect(calls[0]!.init?.body).toContain('grant_type=fb_exchange_token');
    expect(calls[0]!.init?.body).toContain('fb_exchange_token=mat-old');
  });
});

describe('fetchExternalAccountId', () => {
  it('discovers the Google Ads customer id (with developer token header)', async () => {
    const { fetchImpl, calls } = fakeFetch({
      'customers:listAccessibleCustomers': { resourceNames: ['customers/9876543210'] },
    });
    const id = await fetchExternalAccountId({ platform: 'google_ads', accessToken: 'at', developerToken: 'dt', fetchImpl });
    expect(id).toBe('9876543210');
    expect(calls[0]!.init?.headers?.['developer-token']).toBe('dt');
    expect(calls[0]!.init?.headers?.authorization).toBe('Bearer at');
  });

  it('refuses google_ads discovery without a developer token (no network call)', async () => {
    const { fetchImpl, calls } = fakeFetch({});
    await expect(fetchExternalAccountId({ platform: 'google_ads', accessToken: 'at', fetchImpl })).rejects.toThrow(
      /developer token/i,
    );
    expect(calls).toHaveLength(0);
  });

  it('discovers Meta ad account, GA4 property, and GSC site', async () => {
    const meta = fakeFetch({ 'me/adaccounts': { data: [{ id: 'act_42' }] } });
    await expect(fetchExternalAccountId({ platform: 'meta', accessToken: 'at', fetchImpl: meta.fetchImpl })).resolves.toBe(
      'act_42',
    );

    const ga4 = fakeFetch({
      accountSummaries: { accountSummaries: [{ propertySummaries: [{ property: 'properties/12345' }] }] },
    });
    await expect(fetchExternalAccountId({ platform: 'ga4', accessToken: 'at', fetchImpl: ga4.fetchImpl })).resolves.toBe(
      '12345',
    );

    const gsc = fakeFetch({ 'webmasters/v3/sites': { siteEntry: [{ siteUrl: 'https://example.com/' }] } });
    await expect(fetchExternalAccountId({ platform: 'gsc', accessToken: 'at', fetchImpl: gsc.fetchImpl })).resolves.toBe(
      'https://example.com/',
    );
  });

  it('throws a user-safe error when no account is accessible', async () => {
    const { fetchImpl } = fakeFetch({ 'me/adaccounts': { data: [] } });
    await expect(fetchExternalAccountId({ platform: 'meta', accessToken: 'at', fetchImpl })).rejects.toThrow(
      /No Meta ad accounts/i,
    );
  });
});

  });
});

describe('TikTok OAuth (Phase 3)', () => {
  it('builds the TikTok authorize URL with app_id and no scope param', () => {
    const url = new URL(
      buildAuthorizationUrl({ platform: 'tiktok', clientId: 'tt-app', redirectUri: 'https://app.test/cb', state: 'st' }),
    );
    expect(url.host).toBe('ads.tiktok.com');
    expect(url.pathname).toBe('/marketing_api/auth');
    expect(url.searchParams.get('app_id')).toBe('tt-app');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('scope')).toBeNull();
    expect(scopesFor('tiktok')).toEqual([]);
  });

  it('exchanges auth_code via JSON body and unwraps the envelope', async () => {
    const { fetchImpl, calls } = fakeFetch({
      'oauth2/access_token': { code: 0, data: { access_token: 'tt-at', refresh_token: 'tt-rt', expires_in: 86400 } },
    });
    const tokens = await exchangeCodeForTokens({
      platform: 'tiktok',
      clientId: 'tt-app',
      clientSecret: 'tt-secret',
      code: 'auth-code-1',
      redirectUri: 'https://app.test/cb',
      fetchImpl,
    });
    expect(tokens).toEqual({ accessToken: 'tt-at', refreshToken: 'tt-rt', expiresInSec: 86400, scopes: [] });
    expect(calls[0]!.url).toContain('/open_api/v1.3/oauth2/access_token/');
    expect(parsedBody(calls[0])).toMatchObject({ app_id: 'tt-app', secret: 'tt-secret', auth_code: 'auth-code-1' });
  });

  it('fails the exchange on a non-zero envelope code', async () => {
    const { fetchImpl } = fakeFetch({ 'oauth2/access_token': { code: 40005, message: 'invalid auth code' } });
    await expect(
      exchangeCodeForTokens({
        platform: 'tiktok',
        clientId: 'a',
        clientSecret: 's',
        code: 'bad',
        redirectUri: 'https://app.test/cb',
        fetchImpl,
      }),
    ).rejects.toThrow(/invalid auth code/i);
  });

  it('refreshes via oauth2/refresh_token/', async () => {
    const { fetchImpl, calls } = fakeFetch({
      'oauth2/refresh_token': { code: 0, data: { access_token: 'tt-at-2', refresh_token: 'tt-rt-2', expires_in: 86400 } },
    });
    const tokens = await refreshAccessToken({
      platform: 'tiktok',
      clientId: 'a',
      clientSecret: 's',
      refreshToken: 'tt-rt',
      fetchImpl,
    });
    expect(tokens.accessToken).toBe('tt-at-2');
    expect(tokens.refreshToken).toBe('tt-rt-2');
    expect(parsedBody(calls[0])).toMatchObject({ refresh_token: 'tt-rt' });
  });

  it('discovers the advertiser id with the Access-Token header', async () => {
    const { fetchImpl, calls } = fakeFetch({
      'oauth2/advertiser/get': { code: 0, data: { list: [{ advertiser_id: 998877 }] } },
    });
    const id = await fetchExternalAccountId({ platform: 'tiktok', accessToken: 'tt-at', fetchImpl });
    expect(id).toBe('998877');
    expect(calls[0]!.init?.headers?.['Access-Token']).toBe('tt-at');
  });
});

