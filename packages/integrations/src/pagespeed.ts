// PageSpeed Insights API (CONTRACTS §7). Keyless live calls allowed; mock
// fallback deterministic per URL. example.com mobile fixture = 58 (load-bearing).

import type { PageSpeedResult } from './types.js';
import { hashString, hostnameOf, seededRange } from './util/hash.js';

function mockPageSpeed(url: string, strategy: 'mobile' | 'desktop'): PageSpeedResult {
  const host = hostnameOf(url);
  const seed = hashString(`${host}:${strategy}`);
  const score =
    host === 'example.com' ? (strategy === 'mobile' ? 58 : 71) : seededRange(seed, 45, 85);
  const r = (min: number, max: number, s: number) => seededRange(seed + s, min, max);
  const slow = score < 60 ? 1.5 : 1;
  return {
    url,
    strategy,
    performanceScore: score,
    cwv: {
      lcpMs: Math.round(r(1800, 3000, 1) * slow),
      cls: Math.round(r(2, 12, 2) * slow) / 100,
      inpMs: Math.round(r(120, 260, 3) * slow),
      fcpMs: Math.round(r(900, 1800, 4) * slow),
    },
    isMock: true,
  };
}

interface PsiAudit {
  numericValue?: number;
}
interface PsiResponse {
  lighthouseResult?: {
    categories?: { performance?: { score?: number } };
    audits?: Record<string, PsiAudit | undefined>;
  };
  error?: { message?: string };
}

export async function runPageSpeed(
  url: string,
  strategy: 'mobile' | 'desktop' = 'mobile',
  opts?: { mode?: 'live' | 'mock' },
): Promise<PageSpeedResult> {
  const mode = opts?.mode ?? (process.env.SEO_AUDIT_MODE === 'mock' ? 'mock' : 'live');
  if (mode === 'mock') return mockPageSpeed(url, strategy);

  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('strategy', strategy);
  endpoint.searchParams.set('category', 'performance');
  const key = process.env.PAGESPEED_API_KEY;
  if (key) endpoint.searchParams.set('key', key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(endpoint, { signal: controller.signal });
    const data = (await res.json()) as PsiResponse;
    if (!res.ok || !data.lighthouseResult) {
      throw new Error(data.error?.message ?? `PSI HTTP ${res.status}`);
    }
    const audits = data.lighthouseResult.audits ?? {};
    const score = data.lighthouseResult.categories?.performance?.score;
    return {
      url,
      strategy,
      performanceScore: typeof score === 'number' ? Math.round(score * 100) : 0,
      cwv: {
        lcpMs: audits['largest-contentful-paint']?.numericValue ?? null,
        cls: audits['cumulative-layout-shift']?.numericValue ?? null,
        inpMs: audits['interaction-to-next-paint']?.numericValue ?? null,
        fcpMs: audits['first-contentful-paint']?.numericValue ?? null,
      },
      isMock: false,
    };
  } catch (err) {
    const fallback = mockPageSpeed(url, strategy);
    fallback.error = `PageSpeed API failed (${err instanceof Error ? err.message : String(err)}). Showing simulated results.`;
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
