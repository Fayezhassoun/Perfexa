// OAuth connect flow (Phase 2, CONTRACTS §5): startOAuthFlow builds the
// provider redirect with a signed state; completeOAuthFlow exchanges the
// code, discovers the platform account, stores tokens AES-256-GCM encrypted,
// and audit-logs the connection. Mode stays sandbox afterwards — going live
// still requires the explicit LIVE-confirm switch (settings.setMode).

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { connectedAccounts, type ConnectedAccount } from '@voxmarketer/db';
import {
  AdapterError,
  buildAuthorizationUrl,
  encrypt,
  exchangeCodeForTokens,
  fetchExternalAccountId,
  platformLabel,
  signOAuthState,
  verifyOAuthState,
  type ConnectablePlatform,
  type FetchLike,
} from '@voxmarketer/integrations';
import type { AgentContext } from '../types.js';
import { oauthClientConfigFor } from '../live.js';

const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret(): string {
  return process.env.AUTH_SECRET ?? 'dev-secret-change-me-32-bytes-minimum!!';
}

export function redirectUriFor(platform: ConnectablePlatform): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/api/integrations/${platform}/callback`;
}

function notConfiguredError(platform: ConnectablePlatform): Error {
  const which =
    platform === 'meta'
      ? 'META_APP_ID / META_APP_SECRET'
      : platform === 'tiktok'
        ? 'TIKTOK_APP_ID / TIKTOK_APP_SECRET'
        : 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET';
  const extra = platform === 'google_ads' ? ' and GOOGLE_ADS_DEVELOPER_TOKEN' : '';
  return new Error(
    `${platformLabel(platform)} OAuth isn't configured yet — set ${which}${extra} in the environment, ` +
      `or use the sandbox simulator while developing.`,
  );
}

export function startOAuthFlow(ctx: AgentContext, platform: ConnectablePlatform): { url: string } {
  const config = oauthClientConfigFor(platform);
  if (!config) throw notConfiguredError(platform);
  const state = signOAuthState(
    { orgId: ctx.orgId, platform, nonce: randomUUID(), exp: Date.now() + STATE_TTL_MS },
    stateSecret(),
  );
  return {
    url: buildAuthorizationUrl({
      platform,
      clientId: config.clientId,
      redirectUri: redirectUriFor(platform),
      state,
    }),
  };
}

export async function completeOAuthFlow(
  ctx: AgentContext,
  platform: ConnectablePlatform,
  params: { code: string; state: string },
  opts?: { fetchImpl?: FetchLike },
): Promise<ConnectedAccount> {
  const config = oauthClientConfigFor(platform);
  if (!config) throw notConfiguredError(platform);

  const payload = verifyOAuthState(params.state, stateSecret());
  if (payload.platform !== platform || payload.orgId !== ctx.orgId) {
    throw new AdapterError('OAuth state does not match this account — please try connecting again.', platform);
  }

  const tokens = await exchangeCodeForTokens({
    platform,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    code: params.code,
    redirectUri: redirectUriFor(platform),
    fetchImpl: opts?.fetchImpl,
  });
  const externalAccountId = await fetchExternalAccountId({
    platform,
    accessToken: tokens.accessToken,
    developerToken: config.developerToken,
    fetchImpl: opts?.fetchImpl,
  });

  const now = ctx.now ?? new Date();
  const expiresAt = tokens.expiresInSec ? new Date(now.getTime() + tokens.expiresInSec * 1000) : null;
  const tokenFields = {
    externalAccountId,
    accessTokenEnc: encrypt(tokens.accessToken),
    refreshTokenEnc: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    expiresAt,
    scopes: tokens.scopes,
    status: 'connected',
    updatedAt: now,
  };

  const [existing] = await ctx.db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.orgId, ctx.orgId), eq(connectedAccounts.platform, platform)))
    .limit(1);

  let account: ConnectedAccount;
  if (existing) {
    // Reconnect: replace tokens, keep the user's sandbox/live mode as-is.
    const [updated] = await ctx.db
      .update(connectedAccounts)
      .set(tokenFields)
      .where(eq(connectedAccounts.id, existing.id))
      .returning();
    account = updated!;
  } else {
    const [created] = await ctx.db
      .insert(connectedAccounts)
      .values({ orgId: ctx.orgId, platform, mode: 'sandbox', ...tokenFields })
      .returning();
    account = created!;
  }

  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'integration.connected',
    entityType: 'connected_account',
    entityId: account.id,
    payload: { platform, simulated: false, scopes: tokens.scopes },
  });
  return account;
}
