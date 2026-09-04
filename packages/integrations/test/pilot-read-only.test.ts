import { describe, expect, it } from 'vitest';
import { PilotReadOnlyViolation, createLiveAdapter, type AdPlatform, type FetchLike } from '../src/index.js';

const PLATFORMS = ['google_ads', 'meta', 'tiktok'] as const satisfies readonly AdPlatform[];

describe('pilot read-only boundary', () => {
  it.each(PLATFORMS)('blocks every live write for %s before any network request', async (platform) => {
    let networkCalls = 0;
    const fetchImpl: FetchLike = async () => {
      networkCalls += 1;
      throw new Error('A blocked write must never reach the provider');
    };
    const adapter = createLiveAdapter(platform, {
      getAccessToken: async () => 'token', externalAccountId: platform === 'meta' ? 'act_123' : '123',
      developerToken: platform === 'google_ads' ? 'developer-token' : undefined,
      tokenHeader: platform === 'tiktok' ? 'access-token' : undefined, fetchImpl,
    });
    const input = { name: 'Blocked campaign', objective: 'leads', dailyBudgetCents: 1000, targeting: {} };

    await expect(adapter.createCampaign(input)).rejects.toBeInstanceOf(PilotReadOnlyViolation);
    await expect(adapter.pauseCampaign('campaign-1')).rejects.toBeInstanceOf(PilotReadOnlyViolation);
    await expect(adapter.resumeCampaign('campaign-1')).rejects.toBeInstanceOf(PilotReadOnlyViolation);
    await expect(adapter.updateBudget('campaign-1', 2000)).rejects.toBeInstanceOf(PilotReadOnlyViolation);
    expect(networkCalls).toBe(0);
  });
});
