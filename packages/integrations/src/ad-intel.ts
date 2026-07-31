// Competitor ad-intelligence adapter: Google Ads Transparency Center scanning.
// Mock mode is deterministic + offline; live mode fetches the Transparency page
// and degrades gracefully (the page is a JS SPA, so a plain fetch often returns
// a shell — we parse what's available and never throw).

import { hashString, seededRange, pickDeterministic } from './util/hash.js';

export interface AdCreative {
  headline?: string;
  cta?: string;
  lang?: string;
  operator?: string;
  pricingNote?: string;
  angle?: string;
}

export interface ScanRegionInput {
  advertiserId: string;
  region: string;
}

export interface ScanRegionResult {
  adCount: number;
  advertiserName?: string;
  creatives: AdCreative[];
  raw?: Record<string, unknown>;
}

export interface AdIntelAdapter {
  readonly provider: string;
  scanRegion(input: ScanRegionInput): Promise<ScanRegionResult>;
}

export const REGIONS = [
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'AE', label: 'UAE' },
  { code: 'KW', label: 'Kuwait' },
  { code: 'MA', label: 'Morocco' },
  { code: 'DZ', label: 'Algeria' },
  { code: 'CA', label: 'Canada' },
  { code: 'US', label: 'United States' },
] as const;

const ARABIC_SAMPLES: AdCreative[] = [
  { headline: 'اشترك الآن واحصل على مكافأة حصرية', cta: 'اشترك', lang: 'ar', angle: 'reward' },
  { headline: 'عرض لفترة محدودة — فعّل خدمتك اليوم', cta: 'فعّل الآن', lang: 'ar', operator: 'STC', angle: 'urgency' },
  { headline: 'اكتشف باقاتنا المميزة بأسعار تبدأ من 5 ريال', cta: 'اكتشف المزيد', lang: 'ar', pricingNote: 'from 5 SAR', angle: 'price' },
];

const ENGLISH_SAMPLES: AdCreative[] = [
  { headline: 'Unlock exclusive rewards when you subscribe', cta: 'Subscribe', lang: 'en', angle: 'reward' },
  { headline: 'Limited-time offer — activate your service today', cta: 'Activate now', lang: 'en', operator: 'Mobily', angle: 'urgency' },
  { headline: 'Discover premium plans starting at just $1.99', cta: 'Learn more', lang: 'en', pricingNote: 'from $1.99', angle: 'price' },
];

export function createMockAdIntelAdapter(): AdIntelAdapter {
  return {
    provider: 'mock',
    async scanRegion({ advertiserId, region }) {
      const seed = hashString(`${advertiserId}:${region}`);
      const adCount = seededRange(seed, 0, 8000);
      // 2–4 deterministic creatives, mixing Arabic + English samples
      const nCreatives = seededRange(seed + 1, 2, 4);
      const creatives: AdCreative[] = [];
      for (let i = 0; i < nCreatives; i++) {
        const pool = i % 2 === 0 ? ARABIC_SAMPLES : ENGLISH_SAMPLES;
        creatives.push(pickDeterministic(seed + i, pool));
      }
      return {
        adCount,
        advertiserName: `Advertiser ${advertiserId.slice(0, 8)}`,
        creatives,
        raw: { mode: 'mock', seed },
      };
    },
  };
}

export function createTransparencyAdIntelAdapter(options?: { fetch?: typeof fetch }): AdIntelAdapter {
  const doFetch = options?.fetch ?? globalThis.fetch;
  return {
    provider: 'transparency',
    async scanRegion({ advertiserId, region }) {
      const url = `https://adstransparency.google.com/advertiser/${encodeURIComponent(advertiserId)}?region=${encodeURIComponent(region)}`;
      try {
        const res = await doFetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
        });
        const html = await res.text();

        // The Transparency Center is a JS SPA — try to pull a name/count from
        // whatever is server-rendered (title, JSON-LD, __NEXT_DATA__).
        let advertiserName: string | undefined;
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch?.[1]) advertiserName = titleMatch[1].trim();

        let adCount = 0;
        const countMatch = html.match(/(\d[\d,]*)\s*(?:active\s+)?ads?/i);
        if (countMatch?.[1]) adCount = Number(countMatch[1].replace(/,/g, ''));

        const note =
          'Google Ads Transparency Center is a JS SPA; a plain fetch returns a shell. ' +
          'Parsed server-rendered signals only. Deep creative scraping requires a browser-based job.';

        return {
          adCount,
          advertiserName,
          creatives: [],
          raw: { mode: 'live', url, status: res.status, note },
        };
      } catch (err) {
        return {
          adCount: 0,
          creatives: [],
          raw: {
            mode: 'live',
            url,
            note: `Fetch failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        };
      }
    },
  };
}

export function getAdIntelAdapter(options?: { mode?: string; fetch?: typeof fetch }): AdIntelAdapter {
  const mode = options?.mode ?? process.env.AD_INTEL_MODE ?? 'mock';
  if (mode === 'live') {
    return createTransparencyAdIntelAdapter(options);
  }
  return createMockAdIntelAdapter();
}
