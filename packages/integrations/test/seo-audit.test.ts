// Mock-mode SEO audit determinism + the example.com fixture the §12 dialog
// depends on (CONTRACTS §7).

import { describe, expect, it } from 'vitest';
import { crawlWebsite } from '../src/crawler.js';
import { runPageSpeed } from '../src/pagespeed.js';
import { runSeoAudit } from '../src/seo-audit.js';

describe('example.com fixture (mock mode)', () => {
  it('pagespeed mobile score is exactly 58', async () => {
    const ps = await runPageSpeed('https://example.com', 'mobile', { mode: 'mock' });
    expect(ps.performanceScore).toBe(58);
    expect(ps.isMock).toBe(true);
  });

  it('crawl reports 3 missing meta descriptions and no lead form', async () => {
    const crawl = await crawlWebsite('https://example.com', { mode: 'mock' });
    expect(crawl.missingMetaDescriptions).toBe(3);
    expect(crawl.hasLeadForm).toBe(false);
  });

  it('full audit carries the fixture values and ≥10 keyword suggestions', async () => {
    const audit = await runSeoAudit('https://example.com', { mode: 'mock' });
    expect(audit.pagespeed.performanceScore).toBe(58);
    expect(audit.crawl.missingMetaDescriptions).toBe(3);
    expect(audit.crawl.hasLeadForm).toBe(false);
    expect(audit.keywordSuggestions.length).toBeGreaterThanOrEqual(10);
    expect(audit.isMock).toBe(true);
  });
});

describe('mock determinism', () => {
  it('same url → identical audit numbers', async () => {
    const a = await runSeoAudit('https://some-other-site.io', { mode: 'mock' });
    const b = await runSeoAudit('https://some-other-site.io', { mode: 'mock' });
    expect(b.score).toBe(a.score);
    expect(b.pagespeed.performanceScore).toBe(a.pagespeed.performanceScore);
    expect(b.crawl.missingMetaDescriptions).toBe(a.crawl.missingMetaDescriptions);
  });

  it('different urls → (generally) different numbers', async () => {
    const a = await runSeoAudit('https://site-a.io', { mode: 'mock' });
    const b = await runSeoAudit('https://site-b.io', { mode: 'mock' });
    expect(a.score === b.score && a.pagespeed.performanceScore === b.pagespeed.performanceScore).toBe(
      false,
    );
  });

  it('score is within 0–100', async () => {
    const audit = await runSeoAudit('https://bounds-check.example', { mode: 'mock' });
    expect(audit.score).toBeGreaterThanOrEqual(0);
    expect(audit.score).toBeLessThanOrEqual(100);
  });
});
