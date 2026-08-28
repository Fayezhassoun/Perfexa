// Adapter state persistence + campaigns_mirror sync (CONTRACTS §8 tool layer).
//
// Mock adapter state (simulation params included) lives in
// organizations.settings.adState[platform]. On every save we also upsert the
// public view of each campaign into campaigns_mirror so the UI reads a plain
// relational table — a true mirror of what the "platform API" holds.

import { and, eq } from 'drizzle-orm';
import { campaignsMirror, connectedAccounts, organizations, type Db } from '@growthcrew/db';
import {
  getAdAdapter,
  type AdAdapter,
  type AdapterDeps,
  type AdapterStore,
  type AdPlatform,
  type CampaignMetrics,
  type ConnectablePlatform,
  type FetchLike,
} from '@growthcrew/integrations';
import { loadLiveDeps } from './live.js';

export interface StoredCampaignView {
  externalId: string;
  platform: string;
  name: string;
  status: string;
  budgetDailyCents: number;
  metrics: CampaignMetrics;
}

export interface AdapterStateView {
  campaigns?: StoredCampaignView[];
}

export interface MirrorMetrics extends CampaignMetrics {
  history: ({ date: string } & CampaignMetrics)[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function mirrorCampaigns(
  db: Db,
  orgId: string,
  platform: AdPlatform,
  state: AdapterStateView,
  mode: 'sandbox' | 'live' = 'sandbox',
): Promise<void> {
  for (const c of state.campaigns ?? []) {
    const [existing] = await db
      .select()
      .from(campaignsMirror)
      .where(
        and(
          eq(campaignsMirror.orgId, orgId),
          eq(campaignsMirror.platform, platform),
          eq(campaignsMirror.externalId, c.externalId),
        ),
      )
      .limit(1);

    if (!existing) {
      const metrics: MirrorMetrics = {
        ...c.metrics,
        history: [{ date: today(), ...c.metrics }],
      };
      await db.insert(campaignsMirror).values({
        orgId,
        platform,
        externalId: c.externalId,
        name: c.name,
        status: c.status,
        budgetDailyCents: c.budgetDailyCents,
        metrics,
        mode,
      });
    } else {
      const prev = (existing.metrics as MirrorMetrics | null) ?? { ...c.metrics, history: [] };
      const history = [...(prev.history ?? [])];
      if (history.length === 0 || history[history.length - 1]?.date !== today()) {
        history.push({ date: today(), ...c.metrics });
      } else {
        history[history.length - 1] = { date: today(), ...c.metrics };
      }
      const metrics: MirrorMetrics = { ...c.metrics, history: history.slice(-90) };
      await db
        .update(campaignsMirror)
        .set({ name: c.name, status: c.status, budgetDailyCents: c.budgetDailyCents, metrics, mode })
        .where(eq(campaignsMirror.id, existing.id));
    }
  }
}

export function createAdapterStore(db: Db, orgId: string): AdapterStore {
  return {
    async load(loadOrgId: string, platform: AdPlatform) {
      const [org] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, loadOrgId))
        .limit(1);
      const adState = (org?.settings as Record<string, unknown> | undefined)?.adState as
        | Record<string, unknown>
        | undefined;
      return adState?.[platform] ?? null;
    },

    async save(saveOrgId: string, platform: AdPlatform, state: unknown) {
      const [org] = await db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, saveOrgId))
        .limit(1);
      const settings = (org?.settings as Record<string, unknown> | undefined) ?? {};
      const adState = { ...((settings.adState as Record<string, unknown> | undefined) ?? {}), [platform]: state };
      await db.update(organizations).set({ settings: { ...settings, adState } }).where(eq(organizations.id, saveOrgId));
      await mirrorCampaigns(db, saveOrgId, platform, state as AdapterStateView);
    },
  };
}

/**
 * Adapter for this org: mode comes from connected_accounts (default sandbox).
 * Live mode gets real API adapters when the org has OAuth-connected tokens
 * (loadLiveDeps); otherwise the safe stub that throws LiveAdapterNotConnected.
 */
export async function getOrgAdapter(
  db: Db,
  orgId: string,
  platform: AdPlatform,
  opts?: { fetchImpl?: FetchLike },
): Promise<AdAdapter> {
  const [account] = await db
    .select({ mode: connectedAccounts.mode })
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.orgId, orgId), eq(connectedAccounts.platform, platform)))
    .limit(1);
  const mode = account?.mode === 'live' ? 'live' : 'sandbox';
  const deps: AdapterDeps = { store: createAdapterStore(db, orgId), orgId };
  if (mode === 'live') {
    const live = await loadLiveDeps(db, orgId, platform as ConnectablePlatform, opts);
    if (live) deps.live = live;
  }
  return getAdAdapter(platform, mode, deps);
}
