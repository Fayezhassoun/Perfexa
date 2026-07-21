// Google Analytics 4 — deterministic mock traffic series (default), plus a
// real Analytics Data API adapter (Phase 2) for OAuth-connected orgs.

import { liveFetchJson } from './live-http.js';
import type { LiveAdapterDeps } from './types.js';
import { dateDaysAgo, hashString, seededRandom } from './util/hash.js';

export interface Ga4TrafficPoint {
  date: string;
  sessions: number;
  users: number;
  conversions: number;
}

export async function getGa4Traffic(propertyUrl: string, days = 30): Promise<Ga4TrafficPoint[]> {
  const seed = hashString(propertyUrl);
  const rand = seededRandom(seed);
  const baseSessions = 20 + (seed % 180);
  const points: Ga4TrafficPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const weeklyWave = 1 + 0.25 * Math.sin(((days - i) / 7) * Math.PI * 2);
    const sessions = Math.max(1, Math.round(baseSessions * weeklyWave * (0.85 + rand() * 0.3)));
    points.push({
      date: dateDaysAgo(i),
      sessions,
      users: Math.round(sessions * (0.7 + rand() * 0.2)),
      conversions: Math.floor(sessions * (0.01 + rand() * 0.03)),
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// Live adapter (Phase 2): Analytics Data API runReport.
// ---------------------------------------------------------------------------

export interface Ga4Adapter {
  mode: 'live';
  getTraffic(days?: number): Promise<Ga4TrafficPoint[]>;
}

interface Ga4ReportRow {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}

/** GA4 returns dates as YYYYMMDD — normalize to ISO YYYY-MM-DD. */
function isoDate(raw: string): string {
  return /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
}

export function createGa4LiveAdapter(deps: LiveAdapterDeps): Ga4Adapter {
  const propertyId = deps.externalAccountId;
  return {
    mode: 'live',
    async getTraffic(days = 30): Promise<Ga4TrafficPoint[]> {
      const data = await liveFetchJson<{ rows?: Ga4ReportRow[] }>(
        'ga4',
        deps,
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          body: {
            dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
            dimensions: [{ name: 'date' }],
            metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }],
            orderBys: [{ dimension: { dimensionName: 'date' } }],
          },
        },
      );
      return (data.rows ?? []).map((row) => ({
        date: isoDate(row.dimensionValues?.[0]?.value ?? ''),
        sessions: Math.round(Number(row.metricValues?.[0]?.value ?? 0) || 0),
        users: Math.round(Number(row.metricValues?.[1]?.value ?? 0) || 0),
        conversions: Math.round(Number(row.metricValues?.[2]?.value ?? 0) || 0),
      }));
    },
  };
}

