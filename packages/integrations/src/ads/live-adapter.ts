// Live-mode adapter placeholder. Phase 1 ships no OAuth-connected adapters, so
// every method throws a typed, user-safe error the agent layer surfaces.

import { LiveAdapterNotConnected } from '../errors.js';
import type { AdAdapter, AdPlatform } from '../types.js';

export function createLiveAdapter(platform: AdPlatform): AdAdapter {
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
