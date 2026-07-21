// Meta (Facebook/Instagram) live adapter (Phase 2). Talks to the Marketing
// API (Graph v20) through an injectable fetch. Budgets on Meta are already in
// account-currency minor units — cents for USD — so no micros conversion.

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

const API_BASE = 'https://graph.facebook.com/v20.0';

const STATUS_TO_PUBLIC: Record<string, AdCampaign['status']> = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  DELETED: 'removed',
  ARCHIVED: 'removed',
};

/** Map free-text objectives to Meta's ODAX outcomes. */
function mapObjective(objective: string): string {
  const o = objective.toLowerCase();
  if (/lead|sign ?up|contact/.test(o)) return 'OUTCOME_LEADS';
  if (/sale|purchase|conversion|revenue/.test(o)) return 'OUTCOME_SALES';
  if (/aware|brand|visib|reach/.test(o)) return 'OUTCOME_AWARENESS';
  if (/engag/.test(o)) return 'OUTCOME_ENGAGEMENT';
  return 'OUTCOME_TRAFFIC';
}

const CONVERSION_ACTION = /conversion|lead|purchase|registration|signup|sign_up/i;

export function createMetaLiveAdapter(deps: LiveAdapterDeps): AdAdapter {
  const accountId = deps.externalAccountId.startsWith('act_')
    ? deps.externalAccountId
    : `act_${deps.externalAccountId}`;

  async function call<T>(path: string, init?: { method?: string; form?: Record<string, string> }): Promise<T> {
    return withRetry(
      () =>
        liveFetchJson<T>('meta', deps, `${API_BASE}${path}`, {
          method: init?.method ?? 'GET',
          headers: init?.form ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
          body: init?.form ? new URLSearchParams(init.form).toString() : undefined,
        }),
      { retries: 2 },
    );
  }

  return {
    platform: 'meta',
    mode: 'live',

    async listCampaigns(): Promise<AdCampaign[]> {
      const data = await call<{
        data?: { id?: string; name?: string; status?: string; daily_budget?: string }[];
      }>(`/${accountId}/campaigns?fields=id,name,status,daily_budget&limit=100`);
      return (data?.data ?? [])
        .filter((c) => typeof c.id === 'string')
        .map((c) => ({
          externalId: c.id!,
          platform: 'meta',
          name: c.name ?? 'Untitled campaign',
          status: STATUS_TO_PUBLIC[c.status ?? ''] ?? 'draft',
          budgetDailyCents: Math.round(Number(c.daily_budget ?? 0) || 0),
          metrics: { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 },
        }));
    },

    async createCampaign(input: AdCampaignInput): Promise<AdCampaign> {
      const data = await call<{ id?: string }>(`/${accountId}/campaigns`, {
        method: 'POST',
        form: {
          name: input.name,
          objective: mapObjective(input.objective),
          status: 'ACTIVE',
          daily_budget: String(input.dailyBudgetCents),
          special_ad_categories: '[]',
        },
      });
      if (!data?.id) throw new AdapterError('Meta did not return a campaign id.', 'meta');
      // Ad sets/creatives need page + pixel wiring that varies per account;
      // Phase 2 creates the campaign shell (the approval-gated spend action).
      return {
        externalId: data.id,
        platform: 'meta',
        name: input.name,
        status: 'active',
        budgetDailyCents: input.dailyBudgetCents,
        metrics: { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 },
      };
    },

    async pauseCampaign(externalId: string): Promise<void> {
      await call(`/${externalId}`, { method: 'POST', form: { status: 'PAUSED' } });
    },

    async resumeCampaign(externalId: string): Promise<void> {
      await call(`/${externalId}`, { method: 'POST', form: { status: 'ACTIVE' } });
    },

    async updateBudget(externalId: string, dailyBudgetCents: number): Promise<void> {
      await call(`/${externalId}`, { method: 'POST', form: { daily_budget: String(dailyBudgetCents) } });
    },


    async getMetrics(externalId: string): Promise<CampaignMetrics> {
      const data = await call<{
        data?: {
          impressions?: string;
          clicks?: string;
          spend?: string;
          actions?: { action_type?: string; value?: string }[];
        }[];
      }>(`/${externalId}/insights?fields=impressions,clicks,spend,actions&date_preset=last_30d`);
      const row = data?.data?.[0];
      const conversions = (row?.actions ?? [])
        .filter((a) => CONVERSION_ACTION.test(a.action_type ?? ''))
        .reduce((sum, a) => sum + (Number(a.value) || 0), 0);
      return {
        impressions: Math.round(Number(row?.impressions ?? 0) || 0),
        clicks: Math.round(Number(row?.clicks ?? 0) || 0),
        spendCents: Math.round((Number(row?.spend ?? 0) || 0) * 100),
        conversions: Math.round(conversions),
      };
    },

    // Meta has no keyword-planner equivalent; the method stays optional (§7).

    async checkAdPolicy(adCopy: { headline: string; body: string }) {
      return checkAdCopyPolicy(adCopy);
    },
  };
}
