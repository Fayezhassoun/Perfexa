// Live-mode adapter dispatch (CONTRACTS §7, Phase 2+3). With OAuth-connected
// deps, google_ads, meta, and tiktok get real API adapters; without them,
// every method throws a typed, user-safe error the agent layer surfaces.

import { LiveAdapterNotConnected } from '../errors.js';
import type { AdAdapter, AdPlatform, LiveAdapterDeps } from '../types.js';
import { createGoogleAdsLiveAdapter } from './live-google.js';
import { createMetaLiveAdapter } from './live-meta.js';
import { createTikTokLiveAdapter } from './live-tiktok.js';

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
    if (platform === 'google_ads') return createGoogleAdsLiveAdapter(deps);
    if (platform === 'meta') return createMetaLiveAdapter(deps);
    if (platform === 'tiktok') return createTikTokLiveAdapter(deps);
  }
  return createUnconnectedLiveAdapter(platform);
}
