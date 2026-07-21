// Adapter factory (CONTRACTS §7).

import type { AdAdapter, AdPlatform, AdapterDeps } from '../types.js';
import { createLiveAdapter } from './live-adapter.js';
import { createMockAdapter } from './mock-adapter.js';

export function getAdAdapter(platform: AdPlatform, mode: 'sandbox' | 'live', deps: AdapterDeps): AdAdapter {
  return mode === 'live' ? createLiveAdapter(platform, deps.live) : createMockAdapter(platform, deps);
}

export { createMockAdapter, type MockAdAdapter } from './mock-adapter.js';
export { createLiveAdapter } from './live-adapter.js';
