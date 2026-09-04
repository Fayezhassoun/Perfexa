// OAuth helpers for connecting ad/analytics platforms (Phase 2, CONTRACTS §5).
// Pure functions with injectable fetch — no db/agents imports (CONTRACTS §2).

import { createHmac, timingSafeEqual } from 'node:crypto';
import { AdapterError } from './errors.js';
import { liveFetchJson } from './live-http.js';
import type { FetchLike } from './types.js';

export type OAuthProvider = 'google' | 'meta' | 'tiktok';

export const CONNECTABLE_PLATFORMS = ['google_ads', 'meta', 'tiktok', 'ga4', 'gsc'] as const;
export type ConnectablePlatform = (typeof CONNECTABLE_PLATFORMS)[number];

export function isConnectablePlatform(platform: string): platform is ConnectablePlatform {
  return (CONNECTABLE_PLATFORMS as readonly string[]).includes(platform);
}

export function oauthProviderFor(platform: ConnectablePlatform): OAuthProvider {
  if (platform === 'meta') return 'meta';
  if (platform === 'tiktok') return 'tiktok';
  return 'google';
}

// Google Ads exposes one API scope for reads and writes. Pilot safety therefore
// also requires the connected Google identity to have a read-only Ads account role.
const GOOGLE_SCOPES: Record<'google_ads' | 'ga4' | 'gsc', string> = {
  google_ads: 'https://www.googleapis.com/auth/adwords',
  ga4: 'https://www.googleapis.com/auth/analytics.readonly',
  gsc: 'https://www.googleapis.com/auth/webmasters.readonly',
};

/** Minimum permission needed to read ad-account data during the pilot. */
export const META_SCOPES = ['ads_read'];

/** TikTok app permissions are configured on the app itself — no scope param. */
export function scopesFor(platform: ConnectablePlatform): string[] {
  if (platform === 'meta') return [...META_SCOPES];
  if (platform === 'tiktok') return [];
  return [GOOGLE_SCOPES[platform]];
}

const META_API_BASE = 'https://graph.facebook.com/v20.0';
const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

/** TikTok wraps every response in {code, message, data} — code 0 means ok. */
function unwrapTikTok<T>(raw: unknown, what: string): T {
  const envelope = raw as { code?: number | string; message?: string; data?: T };
  const code = Number(envelope?.code ?? -1);
  if (code !== 0 || envelope.data === undefined) {
    throw new AdapterError(`TikTok ${what} failed${envelope?.message ? `: ${envelope.message}` : '.'}`, 'tiktok');
  }
  return envelope.data;
}

export function buildAuthorizationUrl(opts: {
  platform: ConnectablePlatform;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const provider = oauthProviderFor(opts.platform);
  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: opts.clientId,
      redirect_uri: opts.redirectUri,
      response_type: 'code',
      scope: scopesFor(opts.platform).join(' '),
      access_type: 'offline', // refresh token
      prompt: 'consent', // google only re-issues refresh tokens on explicit consent
      state: opts.state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }
  if (provider === 'meta') {
    const params = new URLSearchParams({
      client_id: opts.clientId,
      redirect_uri: opts.redirectUri,
      response_type: 'code',
      scope: scopesFor(opts.platform).join(','),
      state: opts.state,
    });
    return `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
  }
  // TikTok Marketing API: app_id instead of client_id, no scope/response_type.
  const params = new URLSearchParams({
    app_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
  });
  return `https://ads.tiktok.com/marketing_api/auth?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// State: HMAC-signed, self-contained (works without a server-side session).
// ---------------------------------------------------------------------------

export interface OAuthStatePayload {
  orgId: string;
  platform: ConnectablePlatform;
  nonce: string;
  /** Expiry, epoch ms. */
  exp: number;
}

export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyOAuthState(token: string, secret: string, nowMs: number = Date.now()): OAuthStatePayload {
  const [body, sig] = token.split('.');
  if (!body || !sig) throw new AdapterError('Invalid OAuth state — please try connecting again.');
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig, 'base64url');
  const b = Buffer.from(expected, 'base64url');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AdapterError('OAuth state mismatch — please try connecting again.');
  }
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
  } catch {
    throw new AdapterError('Invalid OAuth state — please try connecting again.');
  }
  if (!payload.exp || payload.exp < nowMs) {
    throw new AdapterError('The connection link expired — please try connecting again.');
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Token exchange + refresh.
// ---------------------------------------------------------------------------

export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresInSec: number | null;
  scopes: string[];
}

const noAuth = { getAccessToken: async () => '' };

function parseExpiresIn(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
export async function exchangeCodeForTokens(opts: {
  platform: ConnectablePlatform;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetchImpl?: FetchLike;
}): Promise<ExchangedTokens> {
  const provider = oauthProviderFor(opts.platform);
  if (provider === 'tiktok') {
    const raw = await liveFetchJson(opts.platform, { ...noAuth, fetchImpl: opts.fetchImpl }, `${TIKTOK_API_BASE}/oauth2/access_token/`, {
      method: 'POST',
      body: { app_id: opts.clientId, secret: opts.clientSecret, auth_code: opts.code },
    });
    const data = unwrapTikTok<{ access_token?: string; refresh_token?: string; expires_in?: number; scope?: string }>(raw, 'token exchange');
    if (!data.access_token) {
      throw new AdapterError('TikTok did not return an access token — please try connecting again.', 'tiktok');
    }
    return {
      accessToken: data.access_token,
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
      expiresInSec: parseExpiresIn(data.expires_in),
      scopes: scopesFor('tiktok'),
    };
  }
  const params = new URLSearchParams({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    code: opts.code,
    redirect_uri: opts.redirectUri,
  });
  let url: string;
  if (provider === 'google') {
    url = 'https://oauth2.googleapis.com/token';
    params.set('grant_type', 'authorization_code');
  } else {
    url = `${META_API_BASE}/oauth/access_token`;
  }
  const data = (await liveFetchJson(opts.platform, { ...noAuth, fetchImpl: opts.fetchImpl }, url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })) as Record<string, unknown>;
  const accessToken = typeof data.access_token === 'string' ? data.access_token : null;
  if (!accessToken) {
    throw new AdapterError(`${opts.platform} did not return an access token — please try connecting again.`, opts.platform);
  }
  return {
    accessToken,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
    expiresInSec: parseExpiresIn(data.expires_in),
    scopes: typeof data.scope === 'string' ? data.scope.split(/[ ,]+/).filter(Boolean) : scopesFor(opts.platform),
  };
}

export async function refreshAccessToken(opts: {
  platform: ConnectablePlatform;
  clientId: string;
  clientSecret: string;
  /** Google: the stored refresh token. Meta: the current (still valid) token to re-exchange. */
  refreshToken: string;
  fetchImpl?: FetchLike;
}): Promise<ExchangedTokens> {
  const provider = oauthProviderFor(opts.platform);
  if (provider === 'tiktok') {
    const raw = await liveFetchJson(opts.platform, { ...noAuth, fetchImpl: opts.fetchImpl }, `${TIKTOK_API_BASE}/oauth2/refresh_token/`, {
      method: 'POST',
      body: { app_id: opts.clientId, secret: opts.clientSecret, refresh_token: opts.refreshToken },
    });
    const data = unwrapTikTok<{ access_token?: string; refresh_token?: string; expires_in?: number }>(raw, 'token refresh');
    if (!data.access_token) {
      throw new AdapterError('TikTok token refresh failed — reconnect the account in Settings.', 'tiktok');
    }
    return {
      accessToken: data.access_token,
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
      expiresInSec: parseExpiresIn(data.expires_in),
      scopes: scopesFor('tiktok'),
    };
  }
  const params = new URLSearchParams({ client_id: opts.clientId, client_secret: opts.clientSecret });
  let url: string;
  if (provider === 'google') {
    url = 'https://oauth2.googleapis.com/token';
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', opts.refreshToken);
  } else {
    url = `${META_API_BASE}/oauth/access_token`;
    params.set('grant_type', 'fb_exchange_token');
    params.set('fb_exchange_token', opts.refreshToken);
  }
  const data = (await liveFetchJson(opts.platform, { ...noAuth, fetchImpl: opts.fetchImpl }, url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })) as Record<string, unknown>;
  const accessToken = typeof data.access_token === 'string' ? data.access_token : null;
  if (!accessToken) {
    throw new AdapterError(`${opts.platform} token refresh failed — reconnect the account in Settings.`, opts.platform);
  }
  return {
    accessToken,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
    expiresInSec: parseExpiresIn(data.expires_in),
    scopes: typeof data.scope === 'string' ? data.scope.split(/[ ,]+/).filter(Boolean) : scopesFor(opts.platform),
  };
}

// ---------------------------------------------------------------------------
// Account discovery: which customer / ad account / property / site to use.
// ---------------------------------------------------------------------------

export async function fetchExternalAccountId(opts: {
  platform: ConnectablePlatform;
  accessToken: string;
  developerToken?: string;
  fetchImpl?: FetchLike;
}): Promise<string> {
  const auth = { getAccessToken: async () => opts.accessToken, fetchImpl: opts.fetchImpl };
  switch (opts.platform) {
    case 'tiktok': {
      const raw = await liveFetchJson(
        'tiktok',
        { ...auth, tokenHeader: 'access-token' },
        `${TIKTOK_API_BASE}/oauth2/advertiser/get/`,
      );
      const data = unwrapTikTok<{ list?: { advertiser_id?: string | number }[] }>(raw, 'account discovery');
      const id = data.list?.[0]?.advertiser_id;
      if (id === undefined || id === null || id === '') {
        throw new AdapterError('No TikTok ad accounts are accessible for this login.', 'tiktok');
      }
      return String(id);
    }
    case 'google_ads': {
      if (!opts.developerToken) {
        throw new AdapterError(
          'Google Ads needs a developer token (GOOGLE_ADS_DEVELOPER_TOKEN) before it can connect.',
          'google_ads',
        );
      }
      const data = (await liveFetchJson(
        'google_ads',
        { ...auth, developerToken: opts.developerToken },
        'https://googleads.googleapis.com/v17/customers:listAccessibleCustomers',
        { method: 'POST', body: {} },
      )) as { resourceNames?: string[] };
      const id = data.resourceNames?.[0]?.match(/customers\/(\d+)/)?.[1];
      if (!id) {
        throw new AdapterError('No Google Ads customer accounts are accessible for this Google login.', 'google_ads');
      }
      return id;
    }
    case 'meta': {
      const data = (await liveFetchJson(
        'meta',
        auth,
        `${META_API_BASE}/me/adaccounts?fields=id&limit=1`,
      )) as { data?: { id?: string }[] };
      const id = data.data?.[0]?.id;
      if (!id) {
        throw new AdapterError('No Meta ad accounts are accessible for this Facebook login.', 'meta');
      }
      return id; // "act_123…"
    }
    case 'ga4': {
      const data = (await liveFetchJson(
        'ga4',
        auth,
        'https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=10',
      )) as { accountSummaries?: { propertySummaries?: { property?: string }[] }[] };
      const property = data.accountSummaries?.flatMap((a) => a.propertySummaries ?? [])[0]?.property;
      const id = property?.match(/properties\/(.+)/)?.[1];
      if (!id) {
        throw new AdapterError('No Google Analytics 4 properties found for this Google account.', 'ga4');
      }
      return id;
    }
    case 'gsc': {
      const data = (await liveFetchJson(
        'gsc',
        auth,
        'https://www.googleapis.com/webmasters/v3/sites',
      )) as { siteEntry?: { siteUrl?: string }[] };
      const siteUrl = data.siteEntry?.[0]?.siteUrl;
      if (!siteUrl) {
        throw new AdapterError('No Search Console sites found for this Google account.', 'gsc');
      }
      return siteUrl;
    }
  }
}

