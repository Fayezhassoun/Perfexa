// Google Search Console stub — deterministic mock query rows (phase 2 shape).

import { hashString, hostnameOf, seededRange } from './util/hash.js';

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
