// Live-mode adapter dispatch (CONTRACTS §7, Phase 2+3). With OAuth-connected
// deps, google_ads, meta, and tiktok get real API adapters; without them,
// every method throws a typed, user-safe error the agent layer surfaces.

import { LiveAdapterNotConnected, PilotReadOnlyViolation } from '../errors.js';
import type { AdAdapter, AdPlatform, LiveAdapterDeps } from '../types.js';
import { createGoogleAdsLiveAdapter } from './live-google.js';
import { createMetaLiveAdapter } from './live-meta.js';
import { createTikTokLiveAdapter } from './live-tiktok.js';

function enforcePilotReadOnly(adapter: AdAdapter): AdAdapter {
  const block = async (action: string): Promise<never> => {
    throw new PilotReadOnlyViolation(adapter.platform, action);
  };

  return {
    ...adapter,
    createCampaign: () => block('Campaign creation'),
    pauseCampaign: () => block('Campaign pausing'),
    resumeCampaign: () => block('Campaign resuming'),
    updateBudget: () => block('Budget updates'),
  };
}

function createUnconnectedLiveAdapter(platform: AdPlatform): AdAdapter {
  const fail = (): never => {
    throw new LiveAdapterNotConnected(platform);
  };
  return {
    platform,
    mode: 'live',
    listCampaigns: fail,
    createCampaign: fail,
    pauseCampaign: fail,
    resumeCampaign: fail,
    updateBudget: fail,
    getMetrics: fail,
    getKeywordIdeas: fail,
    checkAdPolicy: fail,
  };
}

export function createLiveAdapter(platform: AdPlatform, deps?: LiveAdapterDeps): AdAdapter {
  if (deps?.externalAccountId) {
    if (platform === 'google_ads') return enforcePilotReadOnly(createGoogleAdsLiveAdapter(deps));
    if (platform === 'meta') return enforcePilotReadOnly(createMetaLiveAdapter(deps));
    if (platform === 'tiktok') return enforcePilotReadOnly(createTikTokLiveAdapter(deps));
  }
  return createUnconnectedLiveAdapter(platform);
}
