// GA4 / GSC live adapters (Phase 2): response mapping for the Analytics Data
// API and Search Console Search Analytics API, with the deterministic mocks
// untouched as the offline default.

import { describe, expect, it } from 'vitest';
import {
  createGa4LiveAdapter,
  createGscLiveAdapter,
  getGa4Traffic,
  getGscQueries,
  type LiveAdapterDeps,
} from '../src/index.js';
import { fakeFetch, parsedBody } from './oauth.test.js';

function deps(fetchImpl: LiveAdapterDeps['fetchImpl'], externalAccountId: string): LiveAdapterDeps {
  return { getAccessToken: async () => 'tok', externalAccountId, fetchImpl };
}

describe('GA4 live adapter', () => {
  it('maps runReport rows and normalizes YYYYMMDD dates', async () => {
    const { fetchImpl, calls } = fakeFetch({
      ':runReport': {
        rows: [
          { dimensionValues: [{ value: '20260719' }], metricValues: [{ value: '12' }, { value: '9' }, { value: '1' }] },
          { dimensionValues: [{ value: '20260720' }], metricValues: [{ value: '10' }, { value: '8' }, { value: '2' }] },
        ],
      },
    });
    const adapter = createGa4LiveAdapter(deps(fetchImpl, '12345'));
    const points = await adapter.getTraffic(14);

    expect(points).toEqual([
      { date: '2026-07-19', sessions: 12, users: 9, conversions: 1 },
      { date: '2026-07-20', sessions: 10, users: 8, conversions: 2 },
    ]);
    expect(calls[0]!.url).toContain('/properties/12345:runReport');
    const body = parsedBody(calls[0]) as { dateRanges: { startDate: string }[] };
    expect(body.dateRanges[0]!.startDate).toBe('14daysAgo');
    expect(calls[0]!.init?.headers?.authorization).toBe('Bearer tok');
  });

  it('surfaces API errors as AdapterError with the reconnect hint', async () => {
    const { fetchImpl } = fakeFetch({ ':runReport': { __status: 401, error: 'unauthenticated' } });
    const adapter = createGa4LiveAdapter(deps(fetchImpl, '12345'));
    await expect(adapter.getTraffic()).rejects.toThrow(/reconnect/i);
  });
});

describe('GSC live adapter', () => {
  it('maps search analytics rows and rounds positions', async () => {
    const { fetchImpl, calls } = fakeFetch({
      'searchAnalytics/query': {
        rows: [
          { keys: ['plumber chicago'], clicks: 12, impressions: 400, position: 4.6 },
          { keys: ['emergency plumber'], clicks: 3, impressions: 90, position: 11.2 },
        ],
      },
    });
    const adapter = createGscLiveAdapter(deps(fetchImpl, 'https://example.com/'));
    const rows = await adapter.getQueries(30);

    expect(rows).toEqual([
      { query: 'plumber chicago', clicks: 12, impressions: 400, position: 5 },
      { query: 'emergency plumber', clicks: 3, impressions: 90, position: 11 },
    ]);
    expect(calls[0]!.url).toContain(`/sites/${encodeURIComponent('https://example.com/')}/searchAnalytics/query`);
    const body = parsedBody(calls[0]) as { dimensions: string[]; rowLimit: number };
    expect(body.dimensions).toEqual(['query']);
    expect(body.rowLimit).toBe(15);
  });
});

describe('mock defaults remain deterministic and unchanged', () => {
  it('getGa4Traffic / getGscQueries are stable per input', async () => {
    expect(await getGa4Traffic('https://example.com', 7)).toEqual(await getGa4Traffic('https://example.com', 7));
    expect((await getGa4Traffic('https://example.com', 7))).toHaveLength(7);
    expect(await getGscQueries('https://example.com')).toEqual(await getGscQueries('https://example.com'));
  });
});
