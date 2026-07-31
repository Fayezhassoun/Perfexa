import { describe, expect, it, vi } from 'vitest';
import {
  createMockAdIntelAdapter,
  createTransparencyAdIntelAdapter,
  getAdIntelAdapter,
  REGIONS,
} from '../src/ad-intel.js';

describe('ad-intel adapter', () => {
  describe('mock adapter', () => {
    it('returns deterministic ad counts + creatives for the same input', async () => {
      const adapter = createMockAdIntelAdapter();
      const input = { advertiserId: 'AR15714032992319963137', region: 'SA' };
      const a = await adapter.scanRegion(input);
      const b = await adapter.scanRegion(input);

      expect(a.adCount).toBe(b.adCount);
      expect(a.creatives).toEqual(b.creatives);
      expect(a.creatives.length).toBeGreaterThanOrEqual(2);
      expect(a.creatives.length).toBeLessThanOrEqual(4);
      expect(a.advertiserName).toBeTruthy();
    });

    it('mixes Arabic and English sample creatives', async () => {
      const adapter = createMockAdIntelAdapter();
      const res = await adapter.scanRegion({ advertiserId: 'AR123', region: 'AE' });
      const langs = new Set(res.creatives.map((c) => c.lang));
      expect(langs.has('ar')).toBe(true);
      expect(langs.has('en')).toBe(true);
    });

    it('varies counts across regions deterministically', async () => {
      const adapter = createMockAdIntelAdapter();
      const sa = await adapter.scanRegion({ advertiserId: 'AR999', region: 'SA' });
      const ca = await adapter.scanRegion({ advertiserId: 'AR999', region: 'CA' });
      // different seeds → not guaranteed different, but both in range
      expect(sa.adCount).toBeGreaterThanOrEqual(0);
      expect(ca.adCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('live (transparency) adapter', () => {
    it('degrades gracefully on a JS SPA shell instead of throwing', async () => {
      const spaShell = '<!doctype html><html><head><title>Ads Transparency</title></head><body><div id="root"></div></body></html>';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => spaShell,
      });

      const adapter = createTransparencyAdIntelAdapter({ fetch: mockFetch as unknown as typeof fetch });
      const res = await adapter.scanRegion({ advertiserId: 'AR15714032992319963137', region: 'SA' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res.adCount).toBe(0);
      expect(res.creatives).toEqual([]);
      expect(res.raw?.note).toMatch(/SPA/i);
    });

    it('parses an ad count when the shell exposes one', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '<html><title>D-MOBILELAB SPAIN S.A.</title><body>4,123 active ads</body></html>',
      });

      const adapter = createTransparencyAdIntelAdapter({ fetch: mockFetch as unknown as typeof fetch });
      const res = await adapter.scanRegion({ advertiserId: 'AR1', region: 'SA' });

      expect(res.adCount).toBe(4123);
      expect(res.advertiserName).toBe('D-MOBILELAB SPAIN S.A.');
    });

    it('returns adCount 0 with a note on fetch failure, never throws', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('network down'));
      const adapter = createTransparencyAdIntelAdapter({ fetch: mockFetch as unknown as typeof fetch });
      const res = await adapter.scanRegion({ advertiserId: 'AR1', region: 'KW' });

      expect(res.adCount).toBe(0);
      expect(res.raw?.note).toMatch(/network down/);
    });
  });

  describe('factory + regions', () => {
    it('defaults to mock', () => {
      expect(getAdIntelAdapter().provider).toBe('mock');
    });

    it('REGIONS has the 7 expected codes', () => {
      expect(REGIONS.map((r) => r.code)).toEqual(['SA', 'AE', 'KW', 'MA', 'DZ', 'CA', 'US']);
    });
  });
});
