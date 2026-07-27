// Live-mode wiring (Phase 2): turns a connected_accounts row into
// LiveAdapterDeps — tokens decrypted via the AES-256-GCM module, refreshed
// 60s before expiry, and the refreshed tokens persisted back encrypted.
// Also home to the GA4/GSC data resolvers (live when connected, mock
// fallback otherwise) and the OAuth env-config check.

import { and, eq } from 'drizzle-orm';
import { connectedAccounts, type Db } from '@sayso/db';
import {
  createGa4LiveAdapter,
  createGscLiveAdapter,
  decrypt,
  encrypt,
  getGa4Traffic,
  getGscQueries,
  refreshAccessToken,
  type ConnectablePlatform,
  type FetchLike,
  type Ga4TrafficPoint,
  type GscQueryRow,
  type LiveAdapterDeps,
} from '@sayso/integrations';

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  /** Google Ads API developer token (google_ads only). */
  developerToken?: string;
}

/**
 * App credentials for a platform's OAuth provider from env. Returns null when
 * the platform can't do OAuth yet — the UI then offers the sandbox simulator.
 * google_ads additionally needs GOOGLE_ADS_DEVELOPER_TOKEN (Google Ads API
 * rejects calls without one); ga4/gsc share the Google OAuth client.
 */
export function oauthClientConfigFor(
  platform: string,
  env: NodeJS.ProcessEnv = process.env,
): OAuthClientConfig | null {
  if (platform === 'meta') {
    const clientId = env.META_APP_ID ?? '';
    const clientSecret = env.META_APP_SECRET ?? '';
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }
  if (platform === 'tiktok') {
    const clientId = env.TIKTOK_APP_ID ?? '';
    const clientSecret = env.TIKTOK_APP_SECRET ?? '';
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }
  const clientId = env.GOOGLE_CLIENT_ID ?? '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret) return null;
  const config: OAuthClientConfig = { clientId, clientSecret };
  if (platform === 'google_ads') {
    const developerToken = env.GOOGLE_ADS_DEVELOPER_TOKEN ?? '';
    if (!developerToken) return null;
    config.developerToken = developerToken;
  }
  return config;
}

export function isOAuthConfigured(platform: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return oauthClientConfigFor(platform, env) !== null;
}

/** Refresh leeway: tokens expiring within a minute are renewed proactively. */
const REFRESH_LEEWAY_MS = 60_000;

/**
 * LiveAdapterDeps for an org+platform, or null when live mode can't really
 * connect (no row, no external account, no tokens, or OAuth env missing) —
 * the caller then falls back to the safe throwing stub.
 */
export async function loadLiveDeps(
  db: Db,
  orgId: string,
  platform: ConnectablePlatform,
  opts?: { fetchImpl?: FetchLike; env?: NodeJS.ProcessEnv },
): Promise<LiveAdapterDeps | null> {
  const config = oauthClientConfigFor(platform, opts?.env);
  if (!config) return null;
  const cfg = config; // non-null capture for the token closure below

  const [account] = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.orgId, orgId), eq(connectedAccounts.platform, platform)))
    .limit(1);
  if (!account?.externalAccountId || !account.accessTokenEnc) return null;

  let currentToken = decrypt(account.accessTokenEnc);
  const storedRefreshToken = account.refreshTokenEnc ? decrypt(account.refreshTokenEnc) : null;
  let expiresAtMs = account.expiresAt?.getTime() ?? null;

  async function getAccessToken(): Promise<string> {
    const now = Date.now();
    if (expiresAtMs === null || expiresAtMs - now > REFRESH_LEEWAY_MS) return currentToken;
    // Google needs a refresh token to renew; without one, surface the current
    // token and let a 401 tell the user to reconnect.
    const refreshable = storedRefreshToken ?? (platform === 'meta' ? currentToken : null);
    if (!refreshable) return currentToken;
    const refreshed = await refreshAccessToken({
      platform,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      refreshToken: refreshable,
      fetchImpl: opts?.fetchImpl,
    });
    currentToken = refreshed.accessToken;
    expiresAtMs = refreshed.expiresInSec ? now + refreshed.expiresInSec * 1000 : expiresAtMs;
    await db
      .update(connectedAccounts)
      .set({
        accessTokenEnc: encrypt(currentToken),
        ...(refreshed.refreshToken ? { refreshTokenEnc: encrypt(refreshed.refreshToken) } : {}),
        expiresAt: expiresAtMs ? new Date(expiresAtMs) : null,
        status: 'connected',
        updatedAt: new Date(),
      })
      .where(eq(connectedAccounts.id, account!.id));
    return currentToken;
  }

  return {
    getAccessToken,
    externalAccountId: account.externalAccountId,
    developerToken: cfg.developerToken,
    tokenHeader: platform === 'tiktok' ? 'access-token' : 'authorization',
    fetchImpl: opts?.fetchImpl,
  };
}

/** GSC query rows: live Search Console when connected, deterministic mock otherwise. */
export async function getOrgGscQueries(
  db: Db,
  orgId: string,
  siteUrl: string,
  days = 30,
  opts?: { fetchImpl?: FetchLike },
): Promise<GscQueryRow[]> {
  const live = await loadLiveDeps(db, orgId, 'gsc', opts);
  if (live) {
    try {
      return await createGscLiveAdapter(live).getQueries(days);
    } catch {
      // graceful degradation (CONTRACTS §3 rule): fall through to mock
    }
  }
  return getGscQueries(siteUrl, days);
}

/** GA4 traffic series: live Analytics when connected, deterministic mock otherwise. */
export async function getOrgGa4Traffic(
  db: Db,
  orgId: string,
  propertyUrl: string,
  days = 30,
  opts?: { fetchImpl?: FetchLike },
): Promise<Ga4TrafficPoint[]> {
  const live = await loadLiveDeps(db, orgId, 'ga4', opts);
  if (live) {
    try {
      return await createGa4LiveAdapter(live).getTraffic(days);
    } catch {
      // graceful degradation: fall through to mock
    }
  }
  return getGa4Traffic(propertyUrl, days);
}
