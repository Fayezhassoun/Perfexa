// Google Ads live adapter (Phase 2). Talks to the Google Ads REST API
// (v17) through an injectable fetch; auth comes from LiveAdapterDeps.
// Money: Google uses micros (1/1_000_000 of the account currency) —
// 10_000 micros = 1 cent.

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

const API_BASE = 'https://googleads.googleapis.com/v17';
const MICROS_PER_CENT = 10_000;

const STATUS_TO_PUBLIC: Record<string, AdCampaign['status']> = {
  ENABLED: 'active',
  PAUSED: 'paused',
  REMOVED: 'removed',
};

function microsToCents(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : 0;
  return Math.round((Number.isFinite(n) ? n : 0) / MICROS_PER_CENT);
}

function num(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : 0;
  return Number.isFinite(n) ? n : 0;
}

interface StreamRow {
  campaign?: { id?: number | string; name?: string; status?: string; resourceName?: string };
  campaignBudget?: { resourceName?: string; amountMicros?: string | number };
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    costMicros?: string | number;
    conversions?: string | number;
  };
}

/** Starter negatives every new campaign gets (see the negative-keywords knowledge doc). */
export const NEGATIVE_KEYWORD_STARTER = ['free', 'jobs', 'career', 'diy', 'course', 'pdf', 'images'];

function requireNumericId(externalId: string): string {
  if (!/^\d+$/.test(externalId)) {
    throw new AdapterError(`Invalid Google Ads campaign id "${externalId}".`, 'google_ads');
  }
  return externalId;
}

export function createGoogleAdsLiveAdapter(deps: LiveAdapterDeps): AdAdapter {
  const customerId = deps.externalAccountId;

  async function call<T>(path: string, body?: unknown): Promise<T> {
    return withRetry(
      () =>
        liveFetchJson<T>('google_ads', deps, `${API_BASE}${path}`, {
          method: 'POST',
          body: body ?? {},
        }),
      { retries: 2 },
    );
  }

  async function search(query: string): Promise<StreamRow[]> {
    const chunks = await call<{ results?: StreamRow[] }[]>(
      `/customers/${customerId}/googleAds:searchStream`,
      { query },
    );
    return (chunks ?? []).flatMap((c) => c?.results ?? []);
  }

  function aggregate(rows: StreamRow[]): CampaignMetrics {
    const metrics: CampaignMetrics = { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 };
    for (const row of rows) {
      metrics.impressions += num(row.metrics?.impressions);
      metrics.clicks += num(row.metrics?.clicks);
      metrics.spendCents += microsToCents(row.metrics?.costMicros);
      metrics.conversions += num(row.metrics?.conversions);
    }
    return metrics;
  }

  async function firstResourceName(path: string, body: unknown, what: string): Promise<string> {
    const res = await call<{ results?: { resourceName?: string }[] }>(path, body);
    const rn = res?.results?.[0]?.resourceName;
    if (!rn) throw new AdapterError(`Google Ads did not return a ${what}.`, 'google_ads');
    return rn;
  }

  return {
    platform: 'google_ads',
    mode: 'live',

    async listCampaigns(): Promise<AdCampaign[]> {
      const rows = await search(
        'SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros, ' +
          'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions ' +
          'FROM campaign WHERE segments.date DURING LAST_30_DAYS',
      );
      const byId = new Map<string, AdCampaign>();
      for (const row of rows) {
        const id = row.campaign?.id;
        if (id === undefined || id === null) continue;
        const externalId = String(id);
        const existing =
          byId.get(externalId) ??
          ({
            externalId,
            platform: 'google_ads',
            name: row.campaign?.name ?? 'Untitled campaign',
            status: STATUS_TO_PUBLIC[row.campaign?.status ?? ''] ?? 'draft',
            budgetDailyCents: microsToCents(row.campaignBudget?.amountMicros),
            metrics: { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 },
          } satisfies AdCampaign);
        const m = aggregate([row]);
        existing.metrics.impressions += m.impressions;
        existing.metrics.clicks += m.clicks;
        existing.metrics.spendCents += m.spendCents;
        existing.metrics.conversions += m.conversions;
        byId.set(externalId, existing);
      }
      return [...byId.values()];
    },


    async createCampaign(input: AdCampaignInput): Promise<AdCampaign> {
      const budgetRn = await firstResourceName(
        `/customers/${customerId}/campaignBudgets:mutate`,
        {
          operations: [
            {
              create: {
                name: `${input.name} — budget`,
                amountMicros: String(input.dailyBudgetCents * MICROS_PER_CENT),
                deliveryMethod: 'STANDARD',
                explicitlyShared: false,
              },
            },
          ],
        },
        'campaign budget',
      );

      const campaignRn = await firstResourceName(
        `/customers/${customerId}/campaigns:mutate`,
        {
          operations: [
            {
              create: {
                name: input.name,
                status: 'ENABLED',
                advertisingChannelType: 'SEARCH',
                campaignBudget: budgetRn,
                manualCpc: { enhancedCpcEnabled: false },
                networkSettings: {
                  targetGoogleSearch: true,
                  targetSearchNetwork: false,
                  targetContentNetwork: false,
                  targetPartnerSearchNetwork: false,
                },
              },
            },
          ],
        },
        'campaign',
      );
      const externalId = campaignRn.match(/campaigns\/(\d+)$/)?.[1] ?? campaignRn;

      // Geo targeting: resolve the free-text geography to a geo target constant
      // and attach it to the campaign. Unresolvable → stays untargeted (safe).
      if (input.targeting.geography) {
        const suggest = await call<{
          geoTargetConstantSuggestions?: { geoTargetConstant?: { resourceName?: string } }[];
        }>(`/customers/${customerId}/geoTargetConstants:suggest`, {
          locationNames: { names: [input.targeting.geography] },
          locale: 'en',
          countryCode: 'US',
        });
        const geoRn = suggest?.geoTargetConstantSuggestions?.[0]?.geoTargetConstant?.resourceName;
        if (geoRn) {
          await call(`/customers/${customerId}/campaignCriteria:mutate`, {
            operations: [{ create: { campaign: campaignRn, location: { geoTargetConstant: geoRn }, negative: false } }],
          });
        }
      }

      // An ad group is required for a SEARCH campaign to serve; attach the ad
      // itself only when we have both copy and a landing page.
      const keywords = input.targeting.keywords ?? [];
      if (input.adCopy ?? keywords.length > 0) {
        const adGroupRn = await firstResourceName(
          `/customers/${customerId}/adGroups:mutate`,
          {
            operations: [
              {
                create: {
                  name: `${input.name} — ad group`,
                  campaign: campaignRn,
                  status: 'ENABLED',
                  type: 'SEARCH_STANDARD',
                },
              },
            ],
          },
          'ad group',
        );
        if (keywords.length > 0) {
          await call(`/customers/${customerId}/adGroupCriteria:mutate`, {
            operations: keywords.map((text) => ({
              create: { adGroup: adGroupRn, status: 'ENABLED', keyword: { text, matchType: 'PHRASE' } },
            })),
          });
        }
        if (input.adCopy && input.landingUrl) {
          const headlines = [input.adCopy.headline, input.name, `${input.adCopy.headline} — learn more`].map(
            (text) => ({ text: text.slice(0, 30) }),
          );
          const descriptions = [input.adCopy.body, input.adCopy.body].map((text) => ({
            text: text.slice(0, 90),
          }));
          await call(`/customers/${customerId}/adGroupAds:mutate`, {
            operations: [
              {
                create: {
                  adGroup: adGroupRn,
                  status: 'ENABLED',
                  ad: { responsiveSearchAd: { headlines, descriptions }, finalUrls: [input.landingUrl] },
                },
              },
            ],
          });
        }
      }

      // Negative keyword starter set (from the negative-keywords knowledge
      // doc): blocks clearly irrelevant traffic from day one, campaign-level.
      await call(`/customers/${customerId}/campaignCriteria:mutate`, {
        operations: NEGATIVE_KEYWORD_STARTER.map((text) => ({
          create: { campaign: campaignRn, negative: true, keyword: { text, matchType: 'PHRASE' } },
        })),
      });

      return {
        externalId,
        platform: 'google_ads',
        name: input.name,
        status: 'active',
        budgetDailyCents: input.dailyBudgetCents,
        metrics: { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 },
      };
    },

    async pauseCampaign(externalId: string): Promise<void> {
      const id = requireNumericId(externalId);
      await call(`/customers/${customerId}/campaigns:mutate`, {
        operations: [
          {
            update: { resourceName: `customers/${customerId}/campaigns/${id}`, status: 'PAUSED' },
            updateMask: 'status',
          },
        ],
      });
    },

    async resumeCampaign(externalId: string): Promise<void> {
      const id = requireNumericId(externalId);
      await call(`/customers/${customerId}/campaigns:mutate`, {
        operations: [
          {
            update: { resourceName: `customers/${customerId}/campaigns/${id}`, status: 'ENABLED' },
            updateMask: 'status',
          },
        ],
      });
    },

    async updateBudget(externalId: string, dailyBudgetCents: number): Promise<void> {
      const id = requireNumericId(externalId);
      const rows = await search(
        `SELECT campaign_budget.resource_name FROM campaign WHERE campaign.id = ${id}`,
      );
      const budgetRn = rows[0]?.campaignBudget?.resourceName;
      if (!budgetRn) {
        throw new AdapterError(`Campaign ${id} was not found on the connected Google Ads account.`, 'google_ads');
      }
      await call(`/customers/${customerId}/campaignBudgets:mutate`, {
        operations: [
          {
            update: { resourceName: budgetRn, amountMicros: String(dailyBudgetCents * MICROS_PER_CENT) },
            updateMask: 'amount_micros',
          },
        ],
      });
    },

    async getMetrics(externalId: string): Promise<CampaignMetrics> {
      const id = requireNumericId(externalId);
      const rows = await search(
        'SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions ' +
          `FROM campaign WHERE campaign.id = ${id} AND segments.date DURING LAST_30_DAYS`,
      );
      return aggregate(rows);
    },

    async getKeywordIdeas(seed: string) {
      const data = await call<{
        results?: {
          text?: string;
          keywordIdeaMetrics?: {
            avgMonthlySearches?: string | number;
            lowTopOfPageBidMicros?: string | number;
            highTopOfPageBidMicros?: string | number;
          };
        }[];
      }>(`/customers/${customerId}/keywordPlanIdeas:generate`, {
        keywordSeed: { keywords: [seed] },
        language: 'languageConstants/1000', // English
        includeAdultKeywords: false,
      });
      return (data?.results ?? [])
        .filter((r) => typeof r.text === 'string')
        .map((r) => ({
          keyword: r.text!,
          avgMonthlySearches: num(r.keywordIdeaMetrics?.avgMonthlySearches),
          cpcCents: Math.round(
            (microsToCents(r.keywordIdeaMetrics?.lowTopOfPageBidMicros) +
              microsToCents(r.keywordIdeaMetrics?.highTopOfPageBidMicros)) / 2,
          ),
        }));
    },

    async checkAdPolicy(adCopy: { headline: string; body: string }) {
      return checkAdCopyPolicy(adCopy);
    },
  };
}
