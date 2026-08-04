// Technical SEO audit tests (Visibility Phase 2). All network access goes
// through injected fake fetch implementations — deterministic, offline. The
// honesty rail is under test too: no PSI key must produce an info finding,
// never a simulated score.

import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { geoResults, geoRuns, seoAudits, seoFindings } from '@growthcrew/db';
import {
  checkCoreWebVitals,
  checkRobots,
  checkSitemap,
  crawlOnPage,
  getAuditHistory,
  getLatestAuditSummary,
  runGeoScansAndSeoAuditsForAllOrgs,
  runSeoAudit,
  runSeoAuditsForAllOrgs,
  summarizeAudit,
} from '../src/services/seo-audit.js';
import { addPrompt, type GeoEngineClients } from '../src/services/geo.js';
import type { LLMResponse } from '@growthcrew/llm';
import { db, freshOrg, truncateAll } from './helpers.js';

// ---------------------------------------------------------------------------
// Fake-site machinery
// ---------------------------------------------------------------------------

type FetchInit = RequestInit | undefined;

interface FakePage {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

/** Route fetches by URL; anything unmapped 404s. */
function siteFetch(pages: Record<string, FakePage>, seen?: string[]) {
  return async (input: RequestInfo | URL, init?: FetchInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    seen?.push(`${init?.method ?? 'GET'} ${url}`);
    const page = pages[url];
    if (!page) return new Response('not found', { status: 404 });
    return new Response(page.body ?? '', {
      status: page.status ?? 200,
      headers: { 'content-type': 'text/html', ...(page.headers ?? {}) },
    });
  };
}

const FAKE_ORIGIN = 'https://site.test';

function html(overrides: Partial<{ title: string; description: string; h1: string; canonical: boolean; imgs: string[] }> = {}): string {
  const title = overrides.title !== undefined ? overrides.title : 'A perfectly reasonable page title';
  const description =
    overrides.description !== undefined
      ? overrides.description
      : 'A meta description long enough to count as present for this page.';
  return [
    '<html><head>',
    title ? `<title>${title}</title>` : '',
    description ? `<meta name="description" content="${description}">` : '',
    overrides.canonical === false ? '' : '<link rel="canonical" href="https://site.test/">',
    '</head><body>',
    overrides.h1 !== undefined ? (overrides.h1 ? `<h1>${overrides.h1}</h1>` : '') : '<h1>Main heading</h1>',
    ...(overrides.imgs ?? []).map(
      (src, i) => `<img src="${src}" ${i % 2 === 0 ? 'alt="described image"' : ''}>`,
    ),
    '</body></html>',
  ].join('');
}

/** A realistic little site: robots + sitemap + mixed page quality. */
function fakeSite(seen?: string[]) {
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '<url><loc>https://site.test/</loc><lastmod>2026-08-01</lastmod></url>',
    '<url><loc>https://site.test/good</loc><lastmod>2026-08-02</lastmod></url>',
    '<url><loc>https://site.test/messy</loc><lastmod>2025-01-01</lastmod></url>',
    '<url><loc>https://site.test/broken</loc></url>',
    '<url><loc>https://other-site.test/ignored</loc></url>',
    '</urlset>',
  ].join('');
  return siteFetch(
    {
      'https://site.test/robots.txt': {
        body: 'User-agent: *\nDisallow: /private\nSitemap: https://site.test/sitemap.xml\n',
        headers: { 'content-type': 'text/plain' },
      },
      'https://site.test/sitemap.xml': { body: sitemap, headers: { 'content-type': 'application/xml' } },
      'https://site.test/': {
        body: html({ imgs: ['https://site.test/img/big.png', 'https://site.test/img/small.png'] }),
      },
      'https://site.test/good': { body: html({}) },
      // Messy page: no H1, no description, overlong title, no canonical.
      'https://site.test/messy': {
        body: html({
          h1: '',
          description: '',
          title: 'This page title goes on and on far beyond the sensible limit for search results',
          canonical: false,
        }),
      },
      'https://site.test/broken': { status: 404, body: 'gone' },
    },
    seen,
  );
}

/** Same fake site, but HEAD image requests answer with real content-lengths. */
function fakeSiteWithImages(seen?: string[]) {
  const base = fakeSite(seen);
  return async (input: RequestInfo | URL, init?: FetchInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    if (init?.method === 'HEAD') {
      if (url === 'https://site.test/img/big.png') {
        return new Response(null, { status: 200, headers: { 'content-length': String(400 * 1024) } });
      }
      return new Response(null, { status: 200, headers: { 'content-length': '1024' } });
    }
    return base(url, init);
  };
}

const codes = (findings: { code: string }[]) => findings.map((f) => f.code);

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

describe('checkCoreWebVitals', () => {
  it('records psi_key_missing and makes no API call without a key', async () => {
    const seen: string[] = [];
    const findings = await checkCoreWebVitals('https://site.test/', {
      apiKey: '',
      fetchImpl: siteFetch({}, seen),
    });
    expect(codes(findings)).toEqual(['psi_key_missing']);
    expect(findings[0]!.severity).toBe('info');
    expect(seen).toEqual([]); // honesty rail: nothing fetched, nothing invented
  });

  it('extracts scores and LCP/CLS/TBT from a real-shaped PSI response', async () => {
    const psiBody = JSON.stringify({
      lighthouseResult: {
        categories: { performance: { score: 0.42 }, seo: { score: 0.91 } },
        audits: {
          'largest-contentful-paint': { numericValue: 4800 },
          'cumulative-layout-shift': { numericValue: 0.31 },
          'total-blocking-time': { numericValue: 150 },
        },
      },
    });
    const fetchImpl = async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      expect(url).toContain('googleapis.com/pagespeedonline');
      expect(url).toContain('strategy=mobile');
      expect(url).toContain('category=PERFORMANCE');
      expect(url).toContain('category=SEO');
      return new Response(psiBody, { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const findings = await checkCoreWebVitals('https://site.test/', { apiKey: 'k', fetchImpl });
    const byCode = Object.fromEntries(findings.map((f) => [f.code, f]));
    expect(byCode.cwv_perf_score!.severity).toBe('fail');
    expect(byCode.cwv_perf_score!.detail).toEqual({ score: 42 });
    expect(byCode.cwv_seo_score!.severity).toBe('pass');
    expect(byCode.cwv_lcp!.severity).toBe('fail');
    expect(byCode.cwv_lcp!.detail).toEqual({ lcpMs: 4800 });
    expect(byCode.cwv_cls!.severity).toBe('fail');
    expect(byCode.cwv_tbt!.severity).toBe('pass');
  });

  it('records psi_error (not fake scores) when the API fails', async () => {
    const findings = await checkCoreWebVitals('https://site.test/', {
      apiKey: 'k',
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429 }),
    });
    expect(codes(findings)).toEqual(['psi_error']);
    expect(findings[0]!.message).toContain('rate limited');
  });
});

describe('checkRobots', () => {
  it('flags missing robots.txt', async () => {
    const { findings, sitemapUrl } = await checkRobots(FAKE_ORIGIN, {
      fetchImpl: siteFetch({}),
    });
    expect(codes(findings)).toContain('robots_missing');
    expect(sitemapUrl).toBeNull();
  });

  it('parses disallows and sitemap references', async () => {
    const fetchImpl = siteFetch({
      'https://site.test/robots.txt': {
        body: 'User-agent: *\nDisallow: /blog\nDisallow: /private\nSitemap: https://site.test/map.xml\n',
      },
    });
    const { findings, sitemapUrl } = await checkRobots(FAKE_ORIGIN, { fetchImpl });
    expect(codes(findings)).toContain('robots_blocks_key_paths');
    expect(codes(findings)).toContain('robots_references_sitemap');
    expect(sitemapUrl).toBe('https://site.test/map.xml');
  });

  it('treats Disallow: / as blocking everything', async () => {
    const fetchImpl = siteFetch({
      'https://site.test/robots.txt': { body: 'User-agent: *\nDisallow: /\n' },
    });
    const { findings } = await checkRobots(FAKE_ORIGIN, { fetchImpl });
    const block = findings.find((f) => f.code === 'robots_blocks_all');
    expect(block?.severity).toBe('fail');
  });
});

describe('checkSitemap', () => {
  it('counts entries, keeps same-origin URLs, and flags stale lastmod', async () => {
    const fetchImpl = fakeSite();
    const { findings, urls } = await checkSitemap(FAKE_ORIGIN, null, {
      fetchImpl,
      now: new Date('2026-08-04T00:00:00Z'),
    });
    expect(urls).toEqual([
      'https://site.test/',
      'https://site.test/good',
      'https://site.test/messy',
      'https://site.test/broken',
    ]); // other-site.test filtered out
    const found = findings.find((f) => f.code === 'sitemap_found');
    expect(found?.detail).toMatchObject({ count: 4, crawled: 4 });
    const stale = findings.find((f) => f.code === 'sitemap_stale_lastmod');
    expect(stale?.detail).toEqual({ stale: 1, total: 4 }); // 2025-01-01 entry
  });

  it('reports a missing sitemap', async () => {
    const { findings, urls } = await checkSitemap(FAKE_ORIGIN, null, { fetchImpl: siteFetch({}) });
    expect(codes(findings)).toEqual(['sitemap_missing']);
    expect(urls).toEqual([]);
  });

  it('follows sitemap indexes one level', async () => {
    const index =
      '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      '<sitemap><loc>https://site.test/sitemap-1.xml</loc></sitemap></sitemapindex>';
    const child =
      '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      '<url><loc>https://site.test/a</loc></url></urlset>';
    const fetchImpl = siteFetch({
      'https://site.test/sitemap.xml': { body: index },
      'https://site.test/sitemap-1.xml': { body: child },
    });
    const { urls } = await checkSitemap(FAKE_ORIGIN, null, { fetchImpl });
    expect(urls).toEqual(['https://site.test/a']);
  });
});

describe('crawlOnPage', () => {
  it('reports real on-page issues per URL (sitemap-driven)', async () => {
    const outcome = await crawlOnPage(
      'https://site.test/',
      ['https://site.test/', 'https://site.test/good', 'https://site.test/messy', 'https://site.test/broken'],
      { fetchImpl: fakeSiteWithImages() },
    );
    const list = codes(outcome.findings);
    expect(list).toContain('link_broken'); // /broken → 404
    expect(list).toContain('meta_missing_h1'); // /messy
    expect(list).toContain('meta_description_missing'); // /messy
    expect(list).toContain('meta_title_long'); // /messy
    expect(list).toContain('meta_canonical_missing'); // /messy
    expect(list).toContain('images_missing_alt'); // every second img lacks alt
    expect(list).toContain('images_oversized'); // big.png measured at 400KB via HEAD
    expect(list).not.toContain('crawl_source_homepage_links'); // sitemap-driven
    expect(outcome.truncated).toBe(false);
    expect(outcome.pagesChecked).toBe(3); // broken page not counted as checked

    const oversized = outcome.findings.find((f) => f.code === 'images_oversized');
    expect(oversized?.detail).toMatchObject({ url: 'https://site.test/img/big.png' });
    const broken = outcome.findings.find((f) => f.code === 'link_broken');
    expect(broken?.severity).toBe('fail');
    expect(broken?.detail).toMatchObject({ status: 404 });
  });

  it('falls back to homepage link discovery when no sitemap exists', async () => {
    const fetchImpl = siteFetch({
      'https://site.test/': {
        body:
          '<html><head><title>Home of the test site</title>' +
          '<meta name="description" content="Described home page for the fallback crawl test."></head>' +
          '<body><h1>Home</h1><a href="/about">About</a><a href="https://elsewhere.test/x">out</a></body></html>',
      },
      'https://site.test/about': { body: html({}) },
    });
    const outcome = await crawlOnPage('https://site.test/', [], { fetchImpl });
    expect(codes(outcome.findings)).toContain('crawl_source_homepage_links');
    expect(outcome.pagesChecked).toBe(2); // homepage + /about; external link ignored
  });

  it('marks pages that never answer as timeouts (fail), not silently skipped', async () => {
    const hanging = async (_input: RequestInfo | URL, init?: FetchInit): Promise<Response> => {
      // Respect aborts so the 20ms timeout below actually rejects.
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted')));
      });
    };
    const outcome = await crawlOnPage('https://site.test/', [], { fetchImpl: hanging, timeoutMs: 20 });
    const finding = outcome.findings.find((f) => f.code === 'page_timeout');
    expect(finding?.severity).toBe('fail');
    expect(outcome.pagesChecked).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Orchestration (runSeoAudit)
// ---------------------------------------------------------------------------

describe('runSeoAudit', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('skips orgs without any site URL (no audit row, no findings)', async () => {
    const org = await freshOrg({ websiteUrl: '' });
    const outcome = await runSeoAudit(org.ctx, { fetchImpl: siteFetch({}) });
    expect(outcome).toEqual({ status: 'skipped', reason: 'no-site' });
    expect(await db.select().from(seoAudits)).toHaveLength(0);
  });

  it('runs every check, stores real findings, and derives the summary', async () => {
    const org = await freshOrg();
    const outcome = await runSeoAudit(org.ctx, {
      siteUrl: 'https://site.test',
      fetchImpl: fakeSiteWithImages(),
      env: {}, // no PAGESPEED_API_KEY — must skip honestly
      trigger: 'manual',
    });
    expect(outcome.status).toBe('audited');
    if (outcome.status !== 'audited') return;
    expect(outcome.audit.status).toBe('done');
    expect(outcome.audit.truncated).toBe(false);
    expect(outcome.findings.length).toBeGreaterThan(0);

    const stored = await db.select().from(seoFindings).where(eq(seoFindings.auditId, outcome.audit.id));
    const list = codes(stored);
    expect(list).toContain('psi_key_missing'); // honest skip
    expect(list).toContain('robots_references_sitemap');
    expect(list).toContain('sitemap_found');
    expect(list).toContain('link_broken');
    expect(list).toContain('meta_missing_h1');
    expect(list).not.toContain('cwv_perf_score'); // no invented scores

    const summary = summarizeAudit(outcome.audit, stored);
    expect(summary.scores.psiPending).toBe(true);
    expect(summary.scores.performance).toBeNull();
    expect(summary.scores.seo).toBeNull();
    expect(summary.counts.fail).toBeGreaterThanOrEqual(1);
    expect(summary.counts.warn).toBeGreaterThanOrEqual(1);
    expect(summary.counts.pass).toBeGreaterThanOrEqual(2);
    // Every finding carries its static hint (or explicitly null) — no LLM.
    for (const finding of summary.findings) {
      if (finding.code === 'meta_missing_h1') {
        expect(finding.hint).toMatch(/H1/);
      }
    }

    const latest = await getLatestAuditSummary(org.ctx);
    expect(latest?.audit.id).toBe(outcome.audit.id);
    expect(latest?.findings.length).toBe(stored.length);

    const history = await getAuditHistory(org.ctx);
    expect(history).toHaveLength(1);
    expect(history[0]!.counts.warn).toBe(summary.counts.warn);
  });

  it('marks the run truncated when the hard cap is exceeded (partial real findings)', async () => {
    const org = await freshOrg();
    const outcome = await runSeoAudit(org.ctx, {
      siteUrl: 'https://site.test',
      fetchImpl: fakeSiteWithImages(),
      env: {},
      hardCapMs: -1, // deadline already passed once PSI starts
    });
    if (outcome.status !== 'audited') throw new Error('expected audit');
    expect(outcome.audit.status).toBe('done');
    expect(outcome.audit.truncated).toBe(true);
    const stored = await db.select().from(seoFindings).where(eq(seoFindings.auditId, outcome.audit.id));
    const list = codes(stored);
    expect(list).toContain('psi_key_missing'); // PSI ran in parallel
    expect(list).toContain('crawl_truncated'); // labelled partial, not hidden
    expect(list).not.toContain('sitemap_found'); // never reached
  });

  it('audits the org website URL when no override is given', async () => {
    const org = await freshOrg({ websiteUrl: 'https://site.test' });
    const seen: string[] = [];
    const outcome = await runSeoAudit(org.ctx, {
      fetchImpl: fakeSite(seen),
      env: {},
    });
    if (outcome.status !== 'audited') throw new Error('expected audit');
    expect(outcome.audit.siteUrl).toBe('https://site.test/');
    expect(seen.some((s) => s.includes('site.test'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Batch runner + weekly hook (worker geo-scan queue)
// ---------------------------------------------------------------------------

function scriptedParser() {
  return {
    name: 'parser',
    async chat(): Promise<LLMResponse> {
      return { content: JSON.stringify({ brand_mentioned: true, brand_rank: 1, competitor_mentions: [], sentiment: 'positive' }) };
    },
  };
}

describe('runSeoAuditsForAllOrgs / weekly hook', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('audits orgs with a site, skips orgs without one, isolates errors', async () => {
    await freshOrg({ websiteUrl: 'https://site.test' });
    await freshOrg({ websiteUrl: '' });

    const run = await runSeoAuditsForAllOrgs(db, { fetchImpl: fakeSiteWithImages(), env: {} });
    expect(run.orgs).toBe(2);
    expect(run.audited).toBe(1);
    expect(run.skipped).toBe(1);
    expect(run.errors).toEqual([]);
  });

  it('weekly hook runs the geo scan first, then a seo audit per org (verified end-to-end)', async () => {
    // Org A has prompts AND a site — gets both a geo run and an audit.
    const orgA = await freshOrg({ websiteUrl: 'https://site.test' });
    await addPrompt(orgA.ctx, { text: 'Best tool for X?' });
    // Org B has neither prompts nor a site — skipped by both halves.
    const orgB = await freshOrg({ websiteUrl: '' });

    const clients: GeoEngineClients = {
      perplexity: {
        name: 'perplexity',
        async chat(): Promise<LLMResponse> {
          return { content: 'Test Business is the pick for this question.' };
        },
      },
      parser: scriptedParser(),
    };

    const result = await runGeoScansAndSeoAuditsForAllOrgs(db, {
      geo: { clients },
      seo: { fetchImpl: fakeSiteWithImages(), env: {} },
    });

    // GEO half (Phase 1 behaviour preserved).
    expect(result.geo.orgs).toBe(2);
    expect(result.geo.scanned).toBe(1);
    expect(result.geo.skipped).toBe(1);
    const runsA = await db.select().from(geoRuns).where(eq(geoRuns.orgId, orgA.orgId));
    expect(runsA).toHaveLength(1);
    expect(runsA[0]!.status).toBe('done');
    expect(runsA[0]!.trigger).toBe('scheduled');
    expect(await db.select().from(geoResults).where(eq(geoResults.runId, runsA[0]!.id))).toHaveLength(1);

    // SEO half — triggered by the same weekly job, after the scan.
    expect(result.seo.audited).toBe(1);
    expect(result.seo.skipped).toBe(1);
    const auditsA = await db.select().from(seoAudits).where(eq(seoAudits.orgId, orgA.orgId));
    expect(auditsA).toHaveLength(1);
    expect(auditsA[0]!.status).toBe('done');
    expect(auditsA[0]!.siteUrl).toBe('https://site.test/');
    const findingsA = await db.select().from(seoFindings).where(eq(seoFindings.auditId, auditsA[0]!.id));
    expect(findingsA.length).toBeGreaterThan(0);
    expect(await db.select().from(seoAudits).where(eq(seoAudits.orgId, orgB.orgId))).toHaveLength(0);
  });
});
