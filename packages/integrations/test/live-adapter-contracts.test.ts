// Live adapter contract (CONTRACTS §7): realistic Google Ads / Meta API JSON
// in, the internal AdCampaign shape out — money mapping, status mapping,
// per-date-row aggregation, and the documented error type for a 401.

import { describe, expect, it } from 'vitest';
import {
  AdapterError,
  createGoogleAdsLiveAdapter,
  createMetaLiveAdapter,
  type AdCampaign,
  type CampaignMetrics,
  type LiveAdapterDeps,
} from '../src/index.js';
import { fakeFetch } from './oauth.test.js';

function googleDeps(fetchImpl: LiveAdapterDeps['fetchImpl']): LiveAdapterDeps {
  return {
    getAccessToken: async () => 'tok-google',
    externalAccountId: '1234567890',
    developerToken: 'dev-tok',
    fetchImpl,
  };
}

function metaDeps(fetchImpl: LiveAdapterDeps['fetchImpl']): LiveAdapterDeps {
  return { getAccessToken: async () => 'tok-meta', externalAccountId: 'act_777', fetchImpl };
}

/** Derived rates the dashboard computes from the internal metrics shape. */
function rates(m: CampaignMetrics): { ctr: number; cpcCents: number } {
  return { ctr: m.clicks / m.impressions, cpcCents: m.spendCents / m.clicks };
}

describe('Google Ads adapter contract: searchStream → internal shape', () => {
  // Realistic googleAds:searchStream payload: one chunk per response batch,
  // one row per campaign per date segment (LAST_30_DAYS) — the adapter must
  // aggregate rows that share a campaign id.
  const searchStream = [
    {
      results: [
        {
          campaign: {
            resourceName: 'customers/1234567890/campaigns/9012345678',
            id: 9012345678,
            name: 'Search — Chicago Plumber',
            status: 'ENABLED',
          },
          campaignBudget: { resourceName: 'customers/1234567890/campaignBudgets/77', amountMicros: '100000000' },
          metrics: { impressions: '1200', clicks: '60', costMicros: '30000000', conversions: '4' },
        },
        {
          campaign: {
            resourceName: 'customers/1234567890/campaigns/9012345678',
            id: 9012345678,
            name: 'Search — Chicago Plumber',
            status: 'ENABLED',
          },
          campaignBudget: { resourceName: 'customers/1234567890/campaignBudgets/77', amountMicros: '100000000' },
          metrics: { impressions: '800', clicks: '40', costMicros: '20000000', conversions: '2' },
        },
      ],
    },
    {
      results: [
        {
          campaign: {
            resourceName: 'customers/1234567890/campaigns/555000111',
            id: 555000111,
            name: 'Brand — paused',
            status: 'PAUSED',
          },
          campaignBudget: { resourceName: 'customers/1234567890/campaignBudgets/78', amountMicros: '50000000' },
          metrics: { impressions: '500', clicks: '10', costMicros: '5000000', conversions: '0' },
        },
      ],
    },
  ];

  it('parses campaigns into the exact internal AdCampaign shape', async () => {
    const { fetchImpl } = fakeFetch({ 'googleAds:searchStream': searchStream });
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fetchImpl));
    const campaigns = await adapter.listCampaigns();

    expect(campaigns).toHaveLength(2); // two campaigns, not three rows
    expect(campaigns[0]).toEqual({
      externalId: '9012345678',
      platform: 'google_ads',
      name: 'Search — Chicago Plumber',
      status: 'active',
      budgetDailyCents: 10_000, // 100_000_000 micros ÷ 10_000
      metrics: { impressions: 2000, clicks: 100, spendCents: 5000, conversions: 6 },
    } satisfies AdCampaign);
    expect(campaigns[1]).toMatchObject({
      externalId: '555000111',
      status: 'paused',
      budgetDailyCents: 5000,
      metrics: { impressions: 500, clicks: 10, spendCents: 500, conversions: 0 },
    });
  });

  it('keeps spend/clicks consistent so ctr + cpc derive correctly', async () => {
    const { fetchImpl } = fakeFetch({ 'googleAds:searchStream': searchStream });
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fetchImpl));
    const [campaign] = await adapter.listCampaigns();
    expect(rates(campaign!.metrics)).toEqual({ ctr: 0.05, cpcCents: 50 });
  });

  it('aggregates getMetrics across date-segment rows the same way', async () => {
    // The real API only returns rows for the queried campaign id.
    const { fetchImpl } = fakeFetch({ 'googleAds:searchStream': searchStream.slice(0, 1) });
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fetchImpl));
    await expect(adapter.getMetrics('9012345678')).resolves.toEqual({
      impressions: 2000,
      clicks: 100,
      spendCents: 5000,
      conversions: 6,
    });
  });

  it('surfaces a 401 as the documented AdapterError (typed, .status, no retry)', async () => {
    const { fetchImpl, calls } = fakeFetch({
      'googleAds:searchStream': {
        __status: 401,
        error: {
          code: 401,
          message: 'Request had invalid authentication credentials.',
          status: 'UNAUTHENTICATED',
        },
      },
    });
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fetchImpl));
    const err = await adapter.listCampaigns().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterError);
    expect((err as Error).message).toMatch(/reconnect/i);
    expect((err as { status?: number }).status).toBe(401);
    expect((err as AdapterError).platform).toBe('google_ads');
    expect(calls).toHaveLength(1); // permanent 4xx is not retried
  });
});

describe('Meta adapter contract: Graph API → internal shape', () => {
  it('parses the campaign list (string budgets, status enum, id-less rows dropped)', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/campaigns': {
        data: [
          {
            id: '23851234567890123',
            name: 'Spring Leads — Chicago',
            status: 'ACTIVE',
            daily_budget: '2000',
            objective: 'OUTCOME_LEADS',
            buying_type: 'AUCTION',
            account_id: 'act_777',
          },
          {
            id: '23851234567890456',
            name: 'Retargeting — purchasers',
            status: 'PAUSED',
            daily_budget: '1500',
            objective: 'OUTCOME_SALES',
          },
          { name: 'draft without id is filtered', status: 'ARCHIVED' },
        ],
        paging: { cursors: { before: 'MAZDZD', after: 'MgZDZD' } },
      },
    });
    const adapter = createMetaLiveAdapter(metaDeps(fetchImpl));
    const campaigns = await adapter.listCampaigns();

    expect(calls[0]!.url).toContain('/act_777/campaigns');
    expect(campaigns).toHaveLength(2);
    expect(campaigns[0]).toEqual({
      externalId: '23851234567890123',
      platform: 'meta',
      name: 'Spring Leads — Chicago',
      status: 'active',
      budgetDailyCents: 2000, // Meta minor units = cents for USD accounts
      metrics: { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 },
    } satisfies AdCampaign);
    expect(campaigns[1]).toMatchObject({ externalId: '23851234567890456', status: 'paused', budgetDailyCents: 1500 });
  });

  it('parses insights: spend dollars → cents, conversions only from conversion-ish actions', async () => {
    const { fetchImpl } = fakeFetch({
      '/insights': {
        data: [
          {
            impressions: '12500',
            clicks: '340',
            spend: '123.45',
            actions: [
              { action_type: 'offsite_conversion.fb_pixel_purchase', value: '12' },
              { action_type: 'lead', value: '3' },
              { action_type: 'link_click', value: '340' },
              { action_type: 'landing_page_view', value: '300' },
            ],
            date_start: '2026-07-03',
            date_stop: '2026-08-01',
          },
        ],
      },
    });
    const adapter = createMetaLiveAdapter(metaDeps(fetchImpl));
    const metrics = await adapter.getMetrics('23851234567890123');

    expect(metrics).toEqual({ impressions: 12500, clicks: 340, spendCents: 12345, conversions: 15 });
    const { ctr, cpcCents } = rates(metrics);
    expect(ctr).toBeCloseTo(0.0272, 4);
    expect(cpcCents).toBeCloseTo(36.31, 1);
  });

  it('surfaces a 401 as the documented AdapterError (typed, .status, no retry)', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/campaigns': {
        __status: 401,
        error: { message: 'Invalid OAuth access token.', type: 'OAuthException', code: 190, fbtrace_id: 'AbC' },
      },
    });
    const adapter = createMetaLiveAdapter(metaDeps(fetchImpl));
    const err = await adapter.listCampaigns().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdapterError);
    expect((err as Error).message).toMatch(/reconnect/i);
    expect((err as { status?: number }).status).toBe(401);
    expect((err as AdapterError).platform).toBe('meta');
    expect(calls).toHaveLength(1);
  });
});
