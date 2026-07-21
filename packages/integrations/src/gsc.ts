// Google Search Console — deterministic mock query rows (default), plus a
// real Search Analytics API adapter (Phase 2) for OAuth-connected orgs.

import { liveFetchJson } from './live-http.js';
import type { LiveAdapterDeps } from './types.js';
import { dateDaysAgo, hashString, hostnameOf, seededRange } from './util/hash.js';

export interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

const MODIFIERS = ['', ' near me', ' services', ' company', ' cost', ' best', ' reviews', ' affordable', ' contact', ' hours', ' pricing', ' quote', ' local', ' professional', ' about'];

export async function getGscQueries(siteUrl: string, _days = 30): Promise<GscQueryRow[]> {
  const host = hostnameOf(siteUrl);
  const brand = (host.split('.')[0] ?? host).replace(/[-_]/g, ' ');
  return MODIFIERS.slice(0, 15).map((mod, i) => {
    const seed = hashString(`${brand}${mod}:${i}`);
    return {
      query: `${brand}${mod}`.trim(),
      clicks: seededRange(seed, 0, 60),
      impressions: seededRange(seed + 1, 50, 2000),
      position: seededRange(seed + 2, 3, 48),
    };
  });
}

// ---------------------------------------------------------------------------
// Live adapter (Phase 2): Search Analytics query.
// ---------------------------------------------------------------------------

export interface GscAdapter {
  mode: 'live';
  getQueries(days?: number): Promise<GscQueryRow[]>;
}

interface GscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  position?: number;
}

export function createGscLiveAdapter(deps: LiveAdapterDeps): GscAdapter {
  const siteUrl = deps.externalAccountId;
  return {
    mode: 'live',
    async getQueries(days = 30): Promise<GscQueryRow[]> {
      const data = await liveFetchJson<{ rows?: GscRow[] }>(
        'gsc',
        deps,
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          body: {
            startDate: dateDaysAgo(days),
            endDate: dateDaysAgo(0),
            dimensions: ['query'],
            rowLimit: 15,
          },
        },
      );
      return (data.rows ?? [])
        .filter((row) => typeof row.keys?.[0] === 'string')
        .map((row) => ({
          query: row.keys![0]!,
          clicks: Math.round(row.clicks ?? 0),
          impressions: Math.round(row.impressions ?? 0),
          position: Math.round(row.position ?? 0),
        }));
    },
  };
}

