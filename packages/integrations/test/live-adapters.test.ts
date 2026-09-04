// Live ad adapters (Phase 2): Google Ads + Meta against an injected fake
// fetch — request mapping (micros/cents, GAQL, forms), error mapping, retry,
// and the safe stub for unconnected/tiktok live mode.

import { describe, expect, it } from 'vitest';
import {
  LiveAdapterNotConnected,
  createLiveAdapter,
  type LiveAdapterDeps,
} from '../src/index.js';
import { createGoogleAdsLiveAdapter } from '../src/ads/live-google.js';
import { createMetaLiveAdapter } from '../src/ads/live-meta.js';
import { createTikTokLiveAdapter } from '../src/ads/live-tiktok.js';
import { fakeFetch, parsedBody } from './oauth.test.js';

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

describe('Google Ads live adapter', () => {
  it('lists campaigns with micros → cents mapping and aggregated metrics', async () => {
    const { fetchImpl, calls } = fakeFetch({
      'googleAds:searchStream': [
        {
          results: [
            {
              campaign: { id: 11, name: 'Search — Chicago', status: 'ENABLED' },
              campaignBudget: { amountMicros: '50000000' },
              metrics: { impressions: '1000', clicks: '50', costMicros: '25000000', conversions: '3' },
            },
            {
              campaign: { id: 22, name: 'Paused one', status: 'PAUSED' },
              campaignBudget: { amountMicros: '10000000' },
              metrics: { impressions: '10', clicks: '1', costMicros: '500000', conversions: '0' },
            },
          ],
        },
      ],
    });
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fetchImpl));
    const campaigns = await adapter.listCampaigns();

    expect(campaigns).toHaveLength(2);
    expect(campaigns[0]).toMatchObject({
      externalId: '11',
      platform: 'google_ads',
      name: 'Search — Chicago',
      status: 'active',
      budgetDailyCents: 5000,
      metrics: { impressions: 1000, clicks: 50, spendCents: 2500, conversions: 3 },
    });
    expect(campaigns[1]!.status).toBe('paused');
    expect(campaigns[1]!.budgetDailyCents).toBe(1000);

    const body = calls[0]!.init?.body ?? '';
    expect(body).toContain('FROM campaign');
    expect(calls[0]!.init?.headers?.authorization).toBe('Bearer tok-google');
    expect(calls[0]!.init?.headers?.['developer-token']).toBe('dev-tok');
  });

  it('creates budget → campaign → geo → ad group → keywords → ad → negatives, in order', async () => {
    const { fetchImpl, calls } = fakeFetch({
      'campaignBudgets:mutate': { results: [{ resourceName: 'customers/1234567890/campaignBudgets/77' }] },
      'campaigns:mutate': { results: [{ resourceName: 'customers/1234567890/campaigns/555' }] },
      'geoTargetConstants:suggest': {
        geoTargetConstantSuggestions: [{ geoTargetConstant: { resourceName: 'geoTargetConstants/1023191' } }],
      },
      'campaignCriteria:mutate': { results: [{}] },
      'adGroups:mutate': { results: [{ resourceName: 'customers/1234567890/adGroups/88' }] },
      'adGroupCriteria:mutate': { results: [{}] },
      'adGroupAds:mutate': { results: [{}] },
    });
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fetchImpl));
    const campaign = await adapter.createCampaign({
      name: 'Chicago Plumber',
      objective: 'leads',
      dailyBudgetCents: 1000,
      targeting: { geography: 'Chicago', keywords: ['plumber chicago'] },
      adCopy: { headline: 'Fast Plumber', body: 'We fix pipes same day.' },
      landingUrl: 'https://example.com/landing',
    });

    expect(campaign).toMatchObject({ externalId: '555', status: 'active', budgetDailyCents: 1000 });
    expect(calls.map((c) => c.url)).toEqual([
      expect.stringContaining('campaignBudgets:mutate'),
      expect.stringContaining('campaigns:mutate'),
      expect.stringContaining('geoTargetConstants:suggest'),
      expect.stringContaining('campaignCriteria:mutate'), // location target
      expect.stringContaining('adGroups:mutate'),
      expect.stringContaining('adGroupCriteria:mutate'),
      expect.stringContaining('adGroupAds:mutate'),
      expect.stringContaining('campaignCriteria:mutate'), // negative keywords
    ]);

    const budgetBody = parsedBody(calls[0]) as { operations: { create: { amountMicros: string } }[] };
    expect(budgetBody.operations[0]!.create.amountMicros).toBe('10000000'); // 1000¢ × 10_000

    const campaignBody = parsedBody(calls[1]) as {
      operations: { create: { status: string; campaignBudget: string; advertisingChannelType: string } }[];
    };
    expect(campaignBody.operations[0]!.create.status).toBe('ENABLED');
    expect(campaignBody.operations[0]!.create.campaignBudget).toBe('customers/1234567890/campaignBudgets/77');
    expect(campaignBody.operations[0]!.create.advertisingChannelType).toBe('SEARCH');

    const geoBody = parsedBody(calls[2]) as { locationNames: { names: string[] } };
    expect(geoBody.locationNames.names).toEqual(['Chicago']);
    const locationBody = parsedBody(calls[3]) as {
      operations: { create: { campaign: string; location: { geoTargetConstant: string }; negative: boolean } }[];
    };
    expect(locationBody.operations[0]!.create.location.geoTargetConstant).toBe('geoTargetConstants/1023191');
    expect(locationBody.operations[0]!.create.campaign).toBe('customers/1234567890/campaigns/555');

    const criteriaBody = parsedBody(calls[5]) as {
      operations: { create: { keyword: { text: string; matchType: string } } }[];
    };
    expect(criteriaBody.operations[0]!.create.keyword).toEqual({ text: 'plumber chicago', matchType: 'PHRASE' });

    const adBody = parsedBody(calls[6]) as {
      operations: { create: { ad: { finalUrls: string[]; responsiveSearchAd: { headlines: unknown[] } } } }[];
    };
    expect(adBody.operations[0]!.create.ad.finalUrls).toEqual(['https://example.com/landing']);
    expect(adBody.operations[0]!.create.ad.responsiveSearchAd.headlines.length).toBeGreaterThanOrEqual(3);

    const negativeBody = parsedBody(calls[7]) as {
      operations: { create: { negative: boolean; keyword: { text: string; matchType: string } } }[];
    };
    expect(negativeBody.operations).toHaveLength(7);
    expect(negativeBody.operations.every((op) => op.create.negative)).toBe(true);
    expect(negativeBody.operations.map((op) => op.create.keyword.text)).toContain('free');
    expect(negativeBody.operations[0]!.create.keyword.matchType).toBe('PHRASE');
  });

  it('creates only the campaign shell (+ negatives) when no copy/keywords are given', async () => {
    const { fetchImpl, calls } = fakeFetch({
      'campaignBudgets:mutate': { results: [{ resourceName: 'customers/1234567890/campaignBudgets/77' }] },
      'campaigns:mutate': { results: [{ resourceName: 'customers/1234567890/campaigns/556' }] },
      'campaignCriteria:mutate': { results: [{}] },
    });
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fetchImpl));
    const campaign = await adapter.createCampaign({
      name: 'Shell',
      objective: 'traffic',
      dailyBudgetCents: 500,
      targeting: {},
    });
    expect(campaign.externalId).toBe('556');
    expect(calls).toHaveLength(3); // budget, campaign, negatives — no geo/ad-group calls
    expect(calls[2]!.url).toContain('campaignCriteria:mutate');
  });


  it('pauses/resumes via campaigns:mutate with updateMask', async () => {
    const { fetchImpl, calls } = fakeFetch({ 'campaigns:mutate': { results: [{}] } });
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fetchImpl));
    await adapter.pauseCampaign('555');
    await adapter.resumeCampaign('555');

    const pause = parsedBody(calls[0]) as { operations: { update: { resourceName: string; status: string }; updateMask: string }[] };
    expect(pause.operations[0]!.update.resourceName).toBe('customers/1234567890/campaigns/555');
    expect(pause.operations[0]!.update.status).toBe('PAUSED');
    expect(pause.operations[0]!.updateMask).toBe('status');
    const resume = parsedBody(calls[1]) as typeof pause;
    expect(resume.operations[0]!.update.status).toBe('ENABLED');
  });

  it('updates budget via the campaignBudgets resource (micros)', async () => {
    const { fetchImpl, calls } = fakeFetch({
      'googleAds:searchStream': [{ results: [{ campaignBudget: { resourceName: 'customers/1234567890/campaignBudgets/9' } }] }],
      'campaignBudgets:mutate': { results: [{}] },
    });
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fetchImpl));
    await adapter.updateBudget('555', 2500);

    const body = parsedBody(calls[1]) as { operations: { update: { amountMicros: string }; updateMask: string }[] };
    expect(body.operations[0]!.update.amountMicros).toBe('25000000');
    expect(body.operations[0]!.updateMask).toBe('amount_micros');
  });

  it('rejects malformed campaign ids before they reach GAQL', async () => {
    const { fetchImpl, calls } = fakeFetch({});
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fetchImpl));
    await expect(adapter.pauseCampaign('1 OR 1=1')).rejects.toThrow(/invalid/i);
    expect(calls).toHaveLength(0);
  });

  it('maps keyword ideas with micros → cents', async () => {
    const { fetchImpl } = fakeFetch({
      'keywordPlanIdeas:generate': {
        results: [
          {
            text: 'plumber chicago',
            keywordIdeaMetrics: { avgMonthlySearches: '1200', lowTopOfPageBidMicros: '1000000', highTopOfPageBidMicros: '3000000' },
          },
        ],
      },
    });
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fetchImpl));
    const ideas = await adapter.getKeywordIdeas!('plumber');
    expect(ideas).toEqual([{ keyword: 'plumber chicago', avgMonthlySearches: 1200, cpcCents: 200 }]);
  });

  it('surfaces 401 as a reconnect error and does not retry it', async () => {
    const { fetchImpl, calls } = fakeFetch({ 'googleAds:searchStream': { __status: 401, error: 'unauthenticated' } });
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fetchImpl));
    await expect(adapter.listCampaigns()).rejects.toThrow(/reconnect/i);
    expect(calls).toHaveLength(1);
  });

  it('retries 429 rate limits then succeeds', async () => {
    let hits = 0;
    const { fetchImpl, calls } = fakeFetch({
      'googleAds:searchStream': () => {
        hits += 1;
        return hits === 1 ? { __status: 429, error: 'rate' } : [{ results: [] }];
      },
    });
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fetchImpl));
    await expect(adapter.listCampaigns()).resolves.toEqual([]);
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('runs the shared copy policy pre-flight', async () => {
    const adapter = createGoogleAdsLiveAdapter(googleDeps(fakeFetch({}).fetchImpl));
    const bad = await adapter.checkAdPolicy!({ headline: 'FREE MONEY', body: 'Guaranteed wins!!! click here' });
    expect(bad.ok).toBe(false);
    expect(bad.violations.length).toBeGreaterThanOrEqual(3);
    const good = await adapter.checkAdPolicy!({ headline: 'Plumber in Chicago', body: 'Same-day repairs, fair prices.' });
    expect(good).toEqual({ ok: true, violations: [] });
  });
});

describe('Meta live adapter', () => {
  it('creates a campaign with ODAX objective mapping + minor-unit budget', async () => {
    const { fetchImpl, calls } = fakeFetch({ '/campaigns': { id: '9001' } });
    const adapter = createMetaLiveAdapter(metaDeps(fetchImpl));
    const campaign = await adapter.createCampaign({
      name: 'Spring Leads',
      objective: 'get more leads',
      dailyBudgetCents: 2000,
      targeting: { audience: 'Chicago homeowners' },
    });

    expect(campaign).toMatchObject({ externalId: '9001', platform: 'meta', status: 'active', budgetDailyCents: 2000 });
    expect(calls[0]!.url).toContain('/act_777/campaigns');
    expect(calls[0]!.init?.method).toBe('POST');
    const form = calls[0]!.init?.body ?? '';
    expect(form).toContain('objective=OUTCOME_LEADS');
    expect(form).toContain('daily_budget=2000');
    expect(form).toContain('special_ad_categories=%5B%5D');
    expect(calls[0]!.init?.headers?.authorization).toBe('Bearer tok-meta');
  });

  it('prefixes a bare account id with act_', async () => {
    const { fetchImpl, calls } = fakeFetch({ '/campaigns': { data: [] } });
    const adapter = createMetaLiveAdapter({ ...metaDeps(fetchImpl), externalAccountId: '777' });
    await adapter.listCampaigns();
    expect(calls[0]!.url).toContain('/act_777/campaigns');
  });

  it('lists campaigns with status mapping', async () => {
    const { fetchImpl } = fakeFetch({
      '/campaigns': { data: [{ id: '1', name: 'M', status: 'PAUSED', daily_budget: '1500' }] },
    });
    const adapter = createMetaLiveAdapter(metaDeps(fetchImpl));
    const campaigns = await adapter.listCampaigns();
    expect(campaigns[0]).toMatchObject({ externalId: '1', status: 'paused', budgetDailyCents: 1500 });
  });

  it('pauses, resumes, and updates budget via POST to the campaign edge', async () => {
    const { fetchImpl, calls } = fakeFetch({ '/9001': { success: true } });
    const adapter = createMetaLiveAdapter(metaDeps(fetchImpl));
    await adapter.pauseCampaign('9001');
    await adapter.resumeCampaign('9001');
    await adapter.updateBudget('9001', 3000);

    expect(calls.map((c) => c.url)).toEqual([
      expect.stringContaining('/9001'),
      expect.stringContaining('/9001'),
      expect.stringContaining('/9001'),
    ]);
    expect(calls[0]!.init?.body).toContain('status=PAUSED');
    expect(calls[1]!.init?.body).toContain('status=ACTIVE');
    expect(calls[2]!.init?.body).toContain('daily_budget=3000');
  });

  it('maps insights: spend dollars → cents, conversions from actions only', async () => {
    const { fetchImpl } = fakeFetch({
      '/insights': {
        data: [
          {
            impressions: '2000',
            clicks: '120',
            spend: '45.67',
            actions: [
              { action_type: 'offsite_conversion', value: '5' },
              { action_type: 'link_click', value: '100' },
            ],
          },
        ],
      },
    });
    const adapter = createMetaLiveAdapter(metaDeps(fetchImpl));
    await expect(adapter.getMetrics('9001')).resolves.toEqual({
      impressions: 2000,
      clicks: 120,
      spendCents: 4567,
      conversions: 5,
    });
  });

  it('has no keyword planner (method intentionally absent)', () => {
    const adapter = createMetaLiveAdapter(metaDeps(fakeFetch({}).fetchImpl));
    expect(adapter.getKeywordIdeas).toBeUndefined();
  });

  it('surfaces 401 as a reconnect error', async () => {
    const { fetchImpl } = fakeFetch({ '/campaigns': { __status: 401, error: { message: 'Invalid OAuth' } } });
    const adapter = createMetaLiveAdapter(metaDeps(fetchImpl));
    await expect(adapter.listCampaigns()).rejects.toThrow(/reconnect/i);
  });
});

describe('createLiveAdapter dispatch', () => {
  it('returns real adapters when deps are present', () => {
    const { fetchImpl } = fakeFetch({});
    expect(createLiveAdapter('google_ads', googleDeps(fetchImpl)).mode).toBe('live');
    expect(createLiveAdapter('meta', metaDeps(fetchImpl)).mode).toBe('live');
  });

  it('returns a real tiktok adapter when deps are present, stub without', async () => {
    const noDeps = createLiveAdapter('google_ads');
    expect(() => noDeps.listCampaigns()).toThrow(LiveAdapterNotConnected);

    const { fetchImpl } = fakeFetch({ 'campaign/get': { code: 0, data: { list: [] } } });
    const tiktok = createLiveAdapter('tiktok', {
      getAccessToken: async () => 'tok',
      externalAccountId: 'tt-1',
      fetchImpl,
    });
    expect(tiktok.platform).toBe('tiktok');
    expect(tiktok.mode).toBe('live');
    await expect(tiktok.listCampaigns()).resolves.toEqual([]);

    const tiktokNoDeps = createLiveAdapter('tiktok');
    expect(() => tiktokNoDeps.listCampaigns()).toThrow(LiveAdapterNotConnected);
  });

  it('stub errors carry the user-safe connect hint', () => {
    const stub = createLiveAdapter('meta');
    expect(() =>
      stub.createCampaign({ name: 'x', objective: 'y', dailyBudgetCents: 1, targeting: {} }),
    ).toThrow(/Connect it in Settings or switch back to sandbox/i);
  });
});


describe('TikTok live adapter', () => {
  function tiktokDeps(fetchImpl: LiveAdapterDeps['fetchImpl']): LiveAdapterDeps {
    return {
      getAccessToken: async () => 'tt-tok',
      externalAccountId: '998877',
      tokenHeader: 'access-token',
      fetchImpl,
    };
  }

  it('creates a campaign with objective mapping + daily budget in currency units', async () => {
    const { fetchImpl, calls } = fakeFetch({ 'campaign/create': { code: 0, data: { campaign_id: 'c-1' } } });
    const adapter = createTikTokLiveAdapter(tiktokDeps(fetchImpl));
    const campaign = await adapter.createCampaign({
      name: 'Dance Promo',
      objective: 'get more leads',
      dailyBudgetCents: 2000,
      targeting: { audience: 'Gen Z Chicago' },
    });

    expect(campaign).toMatchObject({ externalId: 'c-1', platform: 'tiktok', status: 'active', budgetDailyCents: 2000 });
    const body = parsedBody(calls[0]) as Record<string, unknown>;
    expect(body).toMatchObject({
      advertiser_id: '998877',
      campaign_name: 'Dance Promo',
      objective_type: 'LEAD_GENERATION',
      budget_mode: 'BUDGET_MODE_DAY',
      budget: 20,
    });
    expect(calls[0]!.init?.headers?.['Access-Token']).toBe('tt-tok');
    expect(calls[0]!.init?.headers?.authorization).toBeUndefined();
  });

  it('lists campaigns with operation_status + budget mapping', async () => {
    const { fetchImpl } = fakeFetch({
      'campaign/get': {
        code: 0,
        data: {
          list: [
            { campaign_id: '1', campaign_name: 'A', operation_status: 'ENABLE', budget_mode: 'BUDGET_MODE_DAY', budget: 15.5 },
            { campaign_id: '2', campaign_name: 'B', operation_status: 'DISABLE', budget_mode: 'BUDGET_MODE_TOTAL', budget: 100 },
          ],
        },
      },
    });
    const adapter = createTikTokLiveAdapter(tiktokDeps(fetchImpl));
    const campaigns = await adapter.listCampaigns();
    expect(campaigns[0]).toMatchObject({ externalId: '1', status: 'active', budgetDailyCents: 1550 });
    expect(campaigns[1]).toMatchObject({ externalId: '2', status: 'paused', budgetDailyCents: 0 }); // total budget ≠ daily
  });

  it('pauses/resumes via campaign/status/update', async () => {
    const { fetchImpl, calls } = fakeFetch({ 'campaign/status/update': { code: 0, data: {} } });
    const adapter = createTikTokLiveAdapter(tiktokDeps(fetchImpl));
    await adapter.pauseCampaign('c-1');
    await adapter.resumeCampaign('c-1');
    expect(parsedBody(calls[0])).toMatchObject({ campaign_ids: ['c-1'], operation_status: 'DISABLE' });
    expect(parsedBody(calls[1])).toMatchObject({ campaign_ids: ['c-1'], operation_status: 'ENABLE' });
  });

  it('updates budget via campaign/update (cents → units)', async () => {
    const { fetchImpl, calls } = fakeFetch({ 'campaign/update': { code: 0, data: {} } });
    const adapter = createTikTokLiveAdapter(tiktokDeps(fetchImpl));
    await adapter.updateBudget('c-1', 3000);
    expect(parsedBody(calls[0])).toMatchObject({ campaign_id: 'c-1', budget_mode: 'BUDGET_MODE_DAY', budget: 30 });
  });

  it('maps report metrics with spend units → cents', async () => {
    const { fetchImpl } = fakeFetch({
      'report/integrated/get': { code: 0, data: { list: [{ metrics: { impressions: 1000, clicks: 40, spend: 12.5, conversion: 3 } }] } },
    });
    const adapter = createTikTokLiveAdapter(tiktokDeps(fetchImpl));
    await expect(adapter.getMetrics('c-1')).resolves.toEqual({
      impressions: 1000,
      clicks: 40,
      spendCents: 1250,
      conversions: 3,
    });
  });

  it('treats a non-zero envelope code as an API error even on HTTP 200', async () => {
    const { fetchImpl } = fakeFetch({ 'campaign/get': { code: 40100, message: 'access token invalid', data: {} } });
    const adapter = createTikTokLiveAdapter(tiktokDeps(fetchImpl));
    await expect(adapter.listCampaigns()).rejects.toThrow(/access token invalid/i);
  });

  it('has no keyword planner and shares the copy policy pre-flight', async () => {
    const adapter = createTikTokLiveAdapter(tiktokDeps(fakeFetch({}).fetchImpl));
    expect(adapter.getKeywordIdeas).toBeUndefined();
    const bad = await adapter.checkAdPolicy!({ headline: 'GUARANTEED', body: 'free money!!!' });
    expect(bad.ok).toBe(false);
  });
});

