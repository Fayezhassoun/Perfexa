// Live data sync engine (CONTRACTS §7/§8): pulls live campaigns from each
// org's OAuth-connected ad platforms into campaigns_mirror — the table that
// reports, alerts, anomaly detection, and creative fatigue all read from.
// Sandbox orgs seed the mirror once via the adapter store; live accounts never
// refreshed on their own. This closes that loop on a schedule and on demand.

import { and, eq, isNotNull } from 'drizzle-orm';
import { connectedAccounts, type Db } from '@growthcrew/db';
import { createLiveAdapter, type AdPlatform, type FetchLike } from '@growthcrew/integrations';
import type { AgentContext } from '../types.js';
import { createAgentContext } from '../context.js';
import { loadLiveDeps } from '../live.js';
import { mirrorCampaigns } from '../store.js';
import { track } from './analytics.js';

/** Ad platforms that expose listCampaigns() (ga4/gsc are data-only sources). */
const AD_PLATFORMS: AdPlatform[] = ['google_ads', 'meta', 'tiktok'];

function isAdPlatform(platform: string | null): platform is AdPlatform {
  return platform !== null && (AD_PLATFORMS as readonly string[]).includes(platform);
}

export interface SyncOptions {
  /** Injectable fetch for tests (defaults to global fetch). */
  fetchImpl?: FetchLike;
}

export interface SyncResult {
  platform: AdPlatform;
  /** Number of campaigns upserted into campaigns_mirror. */
  synced: number;
  /** Set when the platform was not synced (e.g. not connected / no live deps). */
  skipped?: string;
  /** Set when the platform's API call failed (per-platform isolation). */
  error?: string;
}

export interface SyncRun {
  orgs: number;
  platforms: number;
  synced: number;
  skipped: number;
  errors: string[];
}

/**
 * Sync one org+platform: resolve live deps (null → not connected, skip), fetch
 * campaigns from the real API, and upsert them into campaigns_mirror through
 * the SAME write path the adapter store uses. Throws on API errors — callers
 * that fan out across platforms catch per-platform so one failure never aborts
 * the rest.
 */
export async function syncOrgPlatform(
  ctx: AgentContext,
  platform: AdPlatform,
  opts?: SyncOptions,
): Promise<SyncResult> {
  const live = await loadLiveDeps(ctx.db, ctx.orgId, platform, { fetchImpl: opts?.fetchImpl });
  if (!live) return { platform, synced: 0, skipped: 'not-connected' };

  const campaigns = await createLiveAdapter(platform, live).listCampaigns();
  await mirrorCampaigns(ctx.db, ctx.orgId, platform, { campaigns }, 'live');

  await ctx.audit.log({
    actorType: ctx.userId ? 'user' : 'system',
    actorId: ctx.userId ?? 'sync',
    action: 'sync.platform',
    entityType: 'connected_account',
    entityId: platform,
    metadata: { platform, synced: campaigns.length },
  });
  await track(ctx, 'sync_run', { platform, synced: campaigns.length });

  return { platform, synced: campaigns.length };
}

/**
 * Sync every ad platform for one org, isolating per-platform failures. Backs
 * the manual "sync now" trigger; non-connected platforms come back `skipped`.
 */
export async function syncOrg(ctx: AgentContext, opts?: SyncOptions): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const platform of AD_PLATFORMS) {
    try {
      results.push(await syncOrgPlatform(ctx, platform, opts));
    } catch (err) {
      results.push({ platform, synced: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

/**
 * Cron body: sync every org that has at least one live-connected ad account.
 * Per-org/per-platform failures are collected, not thrown, so one bad account
 * can't sink the run.
 */
export async function syncAllOrgs(database: Db, opts?: SyncOptions): Promise<SyncRun> {
  const accounts = await database
    .select({ orgId: connectedAccounts.orgId, platform: connectedAccounts.platform })
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.mode, 'live'), isNotNull(connectedAccounts.externalAccountId)));

  const byOrg = new Map<string, AdPlatform[]>();
  for (const account of accounts) {
    if (!isAdPlatform(account.platform)) continue;
    const platforms = byOrg.get(account.orgId) ?? [];
    platforms.push(account.platform);
    byOrg.set(account.orgId, platforms);
  }

  const run: SyncRun = { orgs: byOrg.size, platforms: 0, synced: 0, skipped: 0, errors: [] };
  for (const [orgId, platforms] of byOrg) {
    const ctx = createAgentContext({ db: database, orgId });
    for (const platform of platforms) {
      run.platforms += 1;
      try {
        const result = await syncOrgPlatform(ctx, platform, opts);
        if (result.skipped) run.skipped += 1;
        else run.synced += result.synced;
      } catch (err) {
        run.errors.push(`${orgId}:${platform}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return run;
}
