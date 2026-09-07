import { describe, expect, it } from 'vitest';
import { setupProgress, type SetupConnection } from '../lib/setup-progress';

const account: SetupConnection = { platform: 'meta', connected: true, status: 'connected', mode: 'live', oauthConnected: true };
const completed = (connections: SetupConnection[], source: 'live' | 'mixed' | 'demo' = 'live', reportSource: 'live' | 'sandbox' = 'live', reportDemo = false) => setupProgress({ connections, source, reportSource, reportDemo }).map(step => step.complete);

describe('first live report guidance', () => {
  it('does not mistake simulations or analytics-only accounts for connected ad accounts', () => {
    expect(completed([{ ...account, oauthConnected: false }])).toEqual([false, false, false]);
    expect(completed([{ ...account, platform: 'ga4' }])).toEqual([false, false, false]);
  });
  it('requires a healthy live account even if old live data and reports remain', () => {
    expect(completed([{ ...account, status: 'error' }])).toEqual([false, false, false]);
    expect(completed([{ ...account, mode: 'sandbox' }])).toEqual([true, false, false]);
  });
  it('does not complete the workflow with mixed or demo data', () => {
    expect(completed([account], 'mixed')).toEqual([true, false, false]);
    expect(completed([account], 'demo')).toEqual([true, false, false]);
  });
  it('requires the latest report to be live and not demo', () => {
    expect(completed([account], 'live', 'sandbox')).toEqual([true, true, false]);
    expect(completed([account], 'live', 'live', true)).toEqual([true, true, false]);
    expect(completed([account])).toEqual([true, true, true]);
  });
});
