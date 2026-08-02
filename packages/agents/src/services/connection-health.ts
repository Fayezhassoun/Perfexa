import { eq } from 'drizzle-orm';
import { connectedAccounts } from '@growthcrew/db';
import type { AgentContext } from '../types.js';
import type { IntegrationPlatform } from './settings.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

const PLATFORM_LABELS: Record<IntegrationPlatform, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
  ga4: 'Google Analytics',
  gsc: 'Search Console',
};

const PLATFORMS = new Set<IntegrationPlatform>(Object.keys(PLATFORM_LABELS) as IntegrationPlatform[]);

export interface ConnectionHealth {
  platform: IntegrationPlatform;
  mode: 'sandbox' | 'live';
  status: string;
  tokenExpiresAt: Date | null;
  tokenHealthy: boolean;
  lastSyncAt: Date | null;
  needsReconnect: boolean;
  warning?: string;
}

function warningFor(
  platform: IntegrationPlatform,
  mode: 'sandbox' | 'live',
  status: string,
  tokenExpiresAt: Date | null,
  tokenHealthy: boolean,
  now: Date,
): string | undefined {
  const label = PLATFORM_LABELS[platform];

  if (status !== 'connected') {
    return `Your ${label} connection was lost. Reconnect to resume live data.`;
  }
  if (mode !== 'live' || tokenHealthy) return undefined;
  if (!tokenExpiresAt || tokenExpiresAt.getTime() <= now.getTime()) {
    return `Your ${label} access expired. Reconnect to resume live data.`;
  }
  return `Your ${label} access expires soon. Reconnect to avoid interrupted live data.`;
}

/**
 * Read-only connection health for the active organization.
 *
 * `connected_accounts.updatedAt` is the existing connection activity marker;
 * there is no separate sync timestamp in the current schema, so it is exposed
 * as the best available last-sync value without introducing a migration.
 */
export async function getConnectionHealth(ctx: AgentContext): Promise<ConnectionHealth[]> {
  const now = ctx.now ?? new Date();
  const rows = await ctx.db.select().from(connectedAccounts).where(eq(connectedAccounts.orgId, ctx.orgId));

  return rows.flatMap((row) => {
    if (!row.externalAccountId || !row.platform || !PLATFORMS.has(row.platform as IntegrationPlatform)) return [];

    const platform = row.platform as IntegrationPlatform;
    const mode = row.mode === 'live' ? 'live' : 'sandbox';
    const status = row.status ?? 'unknown';
    const tokenExpiresAt = row.expiresAt ?? null;
    const tokenHealthy = Boolean(tokenExpiresAt && tokenExpiresAt.getTime() > now.getTime() + ONE_HOUR_MS);
    const needsReconnect = status !== 'connected' || (mode === 'live' && !tokenHealthy);
    const warning = warningFor(platform, mode, status, tokenExpiresAt, tokenHealthy, now);

    return [
      {
        platform,
        mode,
        status,
        tokenExpiresAt,
        tokenHealthy,
        lastSyncAt: row.updatedAt ?? null,
        needsReconnect,
        ...(warning ? { warning } : {}),
      },
    ];
  });
}
