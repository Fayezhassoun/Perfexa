// TikTok Marketing API live adapter (Phase 3). Open API v1.3 via injectable
// fetch; auth is the `Access-Token` header (handled by live-http). Money on
// TikTok is a decimal in the account currency → cents here. Every response is
// wrapped in {code, message, data} — code !== 0 is an API error even on 200.

import { AdapterError } from '../errors.js';
import { liveFetchJson } from '../live-http.js';
import { withRetry } from '../retry.js';
import type {
  AdAdapter,
  AdCampaign,
  AdCampaignInput,
  CampaignMetrics,
  LiveAdapterDeps,
} from '../types.js';
import { checkAdCopyPolicy } from './policy.js';
import { dateDaysAgo } from '../util/hash.js';

const API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

const STATUS_TO_PUBLIC: Record<string, AdCampaign['status']> = {
  ENABLE: 'active',
  DISABLE: 'paused',
  DELETE: 'removed',
};

/** Map free-text objectives to TikTok objective_type enums. */
function mapObjective(objective: string): string {
  const o = objective.toLowerCase();
  if (/lead|sign ?up|contact/.test(o)) return 'LEAD_GENERATION';
  if (/sale|purchase|conversion|revenue/.test(o)) return 'CONVERSIONS';
  if (/aware|brand|visib|reach/.test(o)) return 'REACH';
  return 'TRAFFIC';
}

function centsToUnits(cents: number): number {
  return Math.round(cents) / 100;
}

function unitsToCents(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : 0;
  return Math.round((Number.isFinite(n) ? n : 0) * 100);
}

export function createTikTokLiveAdapter(deps: LiveAdapterDeps): AdAdapter {
  const advertiserId = deps.externalAccountId;

  async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const raw = await withRetry(
      () =>
        liveFetchJson<{ code?: number | string; message?: string; data?: T }>(
          'tiktok',
          deps,
          `${API_BASE}${path}`,
          { method: init?.method ?? 'GET', body: init?.body },
        ),
      { retries: 2 },
    );
    const code = Number(raw?.code ?? -1);
    if (code !== 0) {
      throw new AdapterError(`TikTok API error${raw?.message ? `: ${raw.message}` : ` (code ${raw?.code})`}`, 'tiktok');
    }
    return raw.data as T;
  }

  return {
    platform: 'tiktok',
    mode: 'live',

    async listCampaigns(): Promise<AdCampaign[]> {
      const data = await call<{
        list?: {
          campaign_id?: string;
          campaign_name?: string;
          operation_status?: string;
          budget_mode?: string;
          budget?: number;
        }[];
      }>(`/campaign/get/?advertiser_id=${encodeURIComponent(advertiserId)}&page=1&page_size=100`);
      return (data?.list ?? [])
        .filter((c) => typeof c.campaign_id === 'string')
        .map((c) => ({
          externalId: c.campaign_id!,
          platform: 'tiktok',
          name: c.campaign_name ?? 'Untitled campaign',
          status: STATUS_TO_PUBLIC[c.operation_status ?? ''] ?? 'draft',
          budgetDailyCents: c.budget_mode === 'BUDGET_MODE_DAY' ? unitsToCents(c.budget) : 0,
          metrics: { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 },
        }));
    },

    async createCampaign(input: AdCampaignInput): Promise<AdCampaign> {
      const data = await call<{ campaign_id?: string }>(`/campaign/create/`, {
        method: 'POST',
        body: {
          advertiser_id: advertiserId,
          campaign_name: input.name,
          objective_type: mapObjective(input.objective),
          budget_mode: 'BUDGET_MODE_DAY',
          budget: centsToUnits(input.dailyBudgetCents),
        },
      });
      if (!data?.campaign_id) throw new AdapterError('TikTok did not return a campaign id.', 'tiktok');
      // Ad groups/creatives need pixel + identity wiring per account; Phase 3
      // creates the campaign shell (the approval-gated spend action).
      return {
        externalId: data.campaign_id,
        platform: 'tiktok',
        name: input.name,
        status: 'active',
        budgetDailyCents: input.dailyBudgetCents,
        metrics: { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 },
      };
    },


    async pauseCampaign(externalId: string): Promise<void> {
      await call(`/campaign/status/update/`, {
        method: 'POST',
        body: { advertiser_id: advertiserId, campaign_ids: [externalId], operation_status: 'DISABLE' },
      });
    },

    async resumeCampaign(externalId: string): Promise<void> {
      await call(`/campaign/status/update/`, {
        method: 'POST',
        body: { advertiser_id: advertiserId, campaign_ids: [externalId], operation_status: 'ENABLE' },
      });
    },

    async updateBudget(externalId: string, dailyBudgetCents: number): Promise<void> {
      await call(`/campaign/update/`, {
        method: 'POST',
        body: {
          advertiser_id: advertiserId,
          campaign_id: externalId,
          budget_mode: 'BUDGET_MODE_DAY',
          budget: centsToUnits(dailyBudgetCents),
        },
      });
    },

    async getMetrics(externalId: string): Promise<CampaignMetrics> {
      const data = await call<{
        list?: {
          metrics?: { impressions?: number; clicks?: number; spend?: number; conversion?: number };
        }[];
      }>(`/report/integrated/get/`, {
        method: 'POST',
        body: {
          advertiser_id: advertiserId,
          report_type: 'BASIC',
          data_level: 'AUCTION_CAMPAIGN',
          dimensions: ['campaign_id'],
          metrics: ['impressions', 'clicks', 'spend', 'conversion'],
          filters: [{ field_name: 'campaign_ids', filter_type: 'IN', filter_value: JSON.stringify([externalId]) }],
          start_date: dateDaysAgo(30),
          end_date: dateDaysAgo(0),
        },
      });
      const row = data?.list?.[0]?.metrics;
      return {
        impressions: Math.round(Number(row?.impressions ?? 0) || 0),
        clicks: Math.round(Number(row?.clicks ?? 0) || 0),
        spendCents: unitsToCents(row?.spend),
        conversions: Math.round(Number(row?.conversion ?? 0) || 0),
      };
    },

    // TikTok has no keyword planner; the method stays optional (§7).

    async checkAdPolicy(adCopy: { headline: string; body: string }) {
      return checkAdCopyPolicy(adCopy);
    },
  };
}
