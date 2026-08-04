// Technical SEO audit (GROWTHCREW_VISIBILITY_PHASE2.md Feature 1).
//
// Deterministic checks only — no LLM, no paid SEO vendors. Everything runs on
// the free PageSpeed Insights API plus plain HTTP fetches (robots.txt, sitemap,
// on-page crawl), and every finding is stored in seo_findings. Honesty rail:
// when PageSpeed can't run (missing key / API error) we store an info finding
// and show "pending" — never a simulated score.

import { desc, eq, inArray, sql } from 'drizzle-orm';
import * as cheerio from 'cheerio';
import {
  organizations,
  seoAudits,
  seoFindings,
  type Db,
  type SeoAudit,
  type SeoFinding,
  type SeoFindingCategory,
  type SeoFindingSeverity,
} from '@growthcrew/db';
import type { AgentContext } from '../types.js';
import { createAgentContext } from '../context.js';
import { runGeoScansForAllOrgs, type GeoScanOptions, type GeoScansRun } from './geo.js';

export const SEO_FETCH_TIMEOUT_MS = 20_000;
// PSI runs a full Lighthouse pass server-side — give it a longer leash than
// plain site fetches, but never unbounded.
export const SEO_PSI_TIMEOUT_MS = 60_000;
export const SEO_AUDIT_HARD_CAP_MS = 5 * 60_000;
export const SEO_MAX_CRAWL_PAGES = 50;
/** Safety valve so one huge site can't flood seo_findings. */
export const SEO_MAX_FINDINGS = 200;
const MAX_CONCURRENT_FETCHES = 4;
const MAX_IMAGE_SIZE_CHECKS_PER_PAGE = 5;
const MAX_IMAGE_SIZE_CHECKS_TOTAL = 30;
const IMAGE_SIZE_THRESHOLD_BYTES = 300 * 1024;
const STALE_LASTMOD_DAYS = 90;
const TITLE_MAX_CHARS = 65;
const KEY_ROBOTS_PATHS = ['/blog', '/posts', '/articles', '/news', '/resources'];
const USER_AGENT = 'GrowthCrewBot/1.0 (+https://growthcrew.dev)';
const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|avif|css|js|mjs|json|pdf|zip|ico|woff2?)$/i;

export interface NewFinding {
  category: SeoFindingCategory;
  severity: SeoFindingSeverity;
  code: string;
  message: string;
  detail?: Record<string, unknown> | null;
}

/** Plain-language fix hint per finding code — static strings, no LLM. */
export const SEO_FINDING_HINTS: Record<string, string> = {
  psi_key_missing:
    'Core Web Vitals are pending: set a free PageSpeed Insights API key (PAGESPEED_API_KEY) and re-run the audit.',
  psi_error:
    'The PageSpeed API was unavailable when this audit ran. Re-run the audit later — no scores are shown until a real measurement exists.',
  cwv_perf_score:
    'Improve the slowest part of page load first: image weight, JavaScript, and server response time.',
  cwv_seo_score:
    'PageSpeed’s SEO checks flag crawlability basics — titles, meta descriptions, and crawlable links.',
  cwv_lcp:
    'Speed up the largest visible element: compress/resize images, preload the hero asset, and cut server response time (aim under 2.5s).',
  cwv_cls: 'Reserve space for images and embeds (set width/height) so the layout doesn’t shift while loading.',
  cwv_tbt: 'Split or defer heavy JavaScript so the page responds to input sooner (aim under 200ms).',
  robots_missing: 'Add a robots.txt file at your site root so crawlers know what to visit (and where your sitemap lives).',
  robots_fetch_error: 'Check that your site is reachable and not blocking automated crawlers.',
  robots_blocks_all: 'Your robots.txt disallows everything — search and AI crawlers cannot index the site at all.',
  robots_blocks_key_paths:
    'Remove the Disallow rule for content paths like /blog — blocked pages can’t be cited by search or AI engines.',
  robots_references_sitemap: 'No action needed — crawlers can discover your sitemap from robots.txt.',
  robots_no_sitemap_ref: 'Add a “Sitemap: https://your-site/sitemap.xml” line to robots.txt for reliable discovery.',
  sitemap_missing:
    'Add a sitemap.xml listing your important pages so crawlers and AI engines can find everything.',
  sitemap_fetch_error: 'Your robots.txt points at a sitemap that could not be fetched — check the URL is correct.',
  sitemap_empty: 'Your sitemap contains no URLs — regenerate it with your published pages.',
  sitemap_stale_lastmod:
    'Old lastmod dates suggest the sitemap isn’t regenerated on publish — refresh it when content changes.',
  crawl_source_homepage_links:
    'No sitemap was found, so the crawl followed links from your homepage. Adding a sitemap gives fuller coverage.',
  link_broken: 'Fix or redirect the broken URL — dead links waste crawl budget and hurt trust.',
  page_timeout: 'The page took too long to respond. Investigate server performance for this URL.',
  meta_title_missing: 'Give the page a descriptive title tag (roughly 20–65 characters).',
  meta_title_long: 'Shorten the title tag to about 65 characters so it isn’t cut off in results.',
  meta_description_missing:
    'Add a meta description (roughly 70–160 characters) summarizing the page — engines often show it verbatim.',
  meta_missing_h1: 'Add one clear H1 heading describing the page’s topic.',
  meta_canonical_missing:
    'Add a canonical link tag so engines know the preferred URL for this content (avoids duplicate-content splits).',
  images_missing_alt: 'Add alt text to images — it’s used by accessibility tools and by engines reading the page.',
  images_oversized:
    'Compress or resize images over 300KB (WebP/AVIF, correct dimensions) to speed up the page.',
  crawl_truncated:
    'The audit hit its 5-minute cap, so only part of the site was checked. Re-run later to cover the rest.',
};

// ---------------------------------------------------------------------------
// Small HTTP helpers (injectable fetch for tests; real timeouts in prod)
// ---------------------------------------------------------------------------

interface FetchPage {
  status: number;
  finalUrl: string;
  body: string;
  headers: Headers;
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      redirect: 'follow',
      ...init,
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, ...(init?.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPage(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<FetchPage> {
  const res = await fetchWithTimeout(fetchImpl, url, timeoutMs);
  const body = await res.text();
  return { status: res.status, finalUrl: res.url || url, body, headers: res.headers };
}

export function normalizeSiteUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Site URL is required.');
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  // Throws on garbage input — surfaced as a 400 by the API route.
  return new URL(url).toString();
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? '/' : u.pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}

/** Strip subdomain noise so www.site.com and site.com aggregate together. */
export function canonicalDomain(url: string): string | null {
  try {
    const host = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.toLowerCase();
    return host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Check 1 — Core Web Vitals via PageSpeed Insights (free API)
// ---------------------------------------------------------------------------

interface PsiAudits {
  'largest-contentful-paint'?: { numericValue?: number };
  'cumulative-layout-shift'?: { numericValue?: number };
  'total-blocking-time'?: { numericValue?: number };
}
interface PsiResponse {
  lighthouseResult?: {
    categories?: { performance?: { score?: number }; seo?: { score?: number } };
    audits?: PsiAudits;
  };
  error?: { message?: string };
}

export interface PsiOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export async function checkCoreWebVitals(siteUrl: string, opts: PsiOptions = {}): Promise<NewFinding[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const key = opts.apiKey ?? process.env.PAGESPEED_API_KEY ?? '';
  if (!key.trim()) {
    return [
      {
        category: 'cwv',
        severity: 'info',
        code: 'psi_key_missing',
        message: 'Core Web Vitals not checked — PAGESPEED_API_KEY is not configured.',
        detail: null,
      },
    ];
  }

  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', siteUrl);
  endpoint.searchParams.set('strategy', 'mobile');
  endpoint.searchParams.append('category', 'PERFORMANCE');
  endpoint.searchParams.append('category', 'SEO');
  endpoint.searchParams.set('key', key.trim());

  let data: PsiResponse;
  let status: number;
  try {
    const res = await fetchWithTimeout(fetchImpl, endpoint.toString(), opts.timeoutMs ?? SEO_PSI_TIMEOUT_MS);
    status = res.status;
    data = (await res.json()) as PsiResponse;
  } catch (err) {
    return [
      {
        category: 'cwv',
        severity: 'info',
        code: 'psi_error',
        message: `PageSpeed check skipped — ${err instanceof Error ? err.message : 'request failed'}.`,
        detail: null,
      },
    ];
  }

  const lh = data.lighthouseResult;
  if (!lh) {
    return [
      {
        category: 'cwv',
        severity: 'info',
        code: 'psi_error',
        message: `PageSpeed check skipped — ${data.error?.message ?? `API returned HTTP ${status}`}.`,
        detail: { status },
      },
    ];
  }

  const findings: NewFinding[] = [];
  const perf = lh.categories?.performance?.score;
  const seoScore = lh.categories?.seo?.score;
  if (typeof perf === 'number') {
    const score = Math.round(perf * 100);
    findings.push({
      category: 'cwv',
      severity: score >= 90 ? 'pass' : score >= 50 ? 'warn' : 'fail',
      code: 'cwv_perf_score',
      message: `PageSpeed mobile performance score: ${score}/100.`,
      detail: { score },
    });
  }
  if (typeof seoScore === 'number') {
    const score = Math.round(seoScore * 100);
    findings.push({
      category: 'cwv',
      severity: score >= 90 ? 'pass' : score >= 50 ? 'warn' : 'fail',
      code: 'cwv_seo_score',
      message: `PageSpeed SEO score: ${score}/100.`,
      detail: { score },
    });
  }

  const audits = lh.audits ?? {};
  const lcp = audits['largest-contentful-paint']?.numericValue;
  const cls = audits['cumulative-layout-shift']?.numericValue;
  const tbt = audits['total-blocking-time']?.numericValue;
  if (typeof lcp === 'number') {
    findings.push({
      category: 'cwv',
      severity: lcp <= 2500 ? 'pass' : lcp <= 4000 ? 'warn' : 'fail',
      code: 'cwv_lcp',
      message: `Largest Contentful Paint: ${(lcp / 1000).toFixed(1)}s on mobile.`,
      detail: { lcpMs: Math.round(lcp) },
    });
  }
  if (typeof cls === 'number') {
    findings.push({
      category: 'cwv',
      severity: cls <= 0.1 ? 'pass' : cls <= 0.25 ? 'warn' : 'fail',
      code: 'cwv_cls',
      message: `Cumulative Layout Shift: ${cls.toFixed(3)} on mobile.`,
      detail: { cls: Number(cls.toFixed(3)) },
    });
  }
  if (typeof tbt === 'number') {
    findings.push({
      category: 'cwv',
      severity: tbt <= 200 ? 'pass' : tbt <= 600 ? 'warn' : 'fail',
      code: 'cwv_tbt',
      message: `Total Blocking Time: ${Math.round(tbt)}ms on mobile.`,
      detail: { tbtMs: Math.round(tbt) },
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Check 2 — robots.txt
// ---------------------------------------------------------------------------

export interface RobotsOutcome {
  findings: NewFinding[];
  /** First Sitemap: reference resolved against the site origin, if any. */
  sitemapUrl: string | null;
}

export async function checkRobots(
  origin: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<RobotsOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const robotsUrl = `${origin}/robots.txt`;
  let page: FetchPage;
  try {
    page = await fetchPage(fetchImpl, robotsUrl, opts.timeoutMs ?? SEO_FETCH_TIMEOUT_MS);
  } catch (err) {
    return {
      findings: [
        {
          category: 'robots',
          severity: 'warn',
          code: 'robots_fetch_error',
          message: `Could not fetch robots.txt (${err instanceof Error ? err.message : 'request failed'}).`,
          detail: { url: robotsUrl },
        },
      ],
      sitemapUrl: null,
    };
  }

  if (page.status >= 400) {
    return {
      findings: [
        {
          category: 'robots',
          severity: 'warn',
          code: 'robots_missing',
          message: `No robots.txt found (${robotsUrl} returned HTTP ${page.status}).`,
          detail: { url: robotsUrl, status: page.status },
        },
      ],
      sitemapUrl: null,
    };
  }

  const findings: NewFinding[] = [];
  const disallows: string[] = [];
  let sitemapUrl: string | null = null;
  for (const rawLine of page.body.split(/\r?\n/)) {
    const line = rawLine.trim();
    const lower = line.toLowerCase();
    if (lower.startsWith('sitemap:')) {
      const value = line.slice('sitemap:'.length).trim();
      if (value && !sitemapUrl) {
        try {
          sitemapUrl = new URL(value, origin).toString();
        } catch {
          /* malformed reference — ignore */
        }
      }
    } else if (lower.startsWith('disallow:')) {
      disallows.push(line.slice('disallow:'.length).trim());
    }
  }

  if (disallows.some((d) => d === '/' || d === '/*')) {
    findings.push({
      category: 'robots',
      severity: 'fail',
      code: 'robots_blocks_all',
      message: 'robots.txt disallows all paths — the entire site is blocked from crawling.',
      detail: { url: robotsUrl },
    });
  }
  const blockedKeyPaths = KEY_ROBOTS_PATHS.filter((path) =>
    disallows.some((d) => d === path || d === `${path}/` || (d.startsWith(path) && d.startsWith(`${path}/`))),
  );
  if (blockedKeyPaths.length > 0) {
    findings.push({
      category: 'robots',
      severity: 'warn',
      code: 'robots_blocks_key_paths',
      message: `robots.txt blocks key content paths: ${blockedKeyPaths.join(', ')}.`,
      detail: { url: robotsUrl, paths: blockedKeyPaths },
    });
  }

  if (sitemapUrl) {
    findings.push({
      category: 'robots',
      severity: 'pass',
      code: 'robots_references_sitemap',
      message: 'robots.txt references a sitemap.',
      detail: { sitemapUrl },
    });
  } else {
    findings.push({
      category: 'robots',
      severity: 'info',
      code: 'robots_no_sitemap_ref',
      message: 'robots.txt exists but does not reference a sitemap.',
      detail: { url: robotsUrl },
    });
  }
  if (findings.every((f) => f.code !== 'robots_blocks_all' && f.code !== 'robots_blocks_key_paths')) {
    // Present + nothing blocked → surface an explicit pass for the scorecard.
    findings.unshift({
      category: 'robots',
      severity: 'pass',
      code: 'robots_ok',
      message: 'robots.txt is present and does not block key paths.',
      detail: { url: robotsUrl },
    });
  }

  return { findings, sitemapUrl };
}

// ---------------------------------------------------------------------------
// Check 3 — sitemap
// ---------------------------------------------------------------------------

export interface SitemapOutcome {
  findings: NewFinding[];
  /** Same-origin page URLs from the sitemap, capped at SEO_MAX_CRAWL_PAGES. */
  urls: string[];
}

function parseSitemapEntries(xml: string): { pages: { loc: string; lastmod: string | null }[]; index: string[] } {
  const $ = cheerio.load(xml, { xml: true });
  const isIndex = $('sitemapindex').length > 0;
  const index: string[] = [];
  if (isIndex) {
    $('sitemap > loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc) index.push(loc);
    });
  }
  const pages: { loc: string; lastmod: string | null }[] = [];
  $('url').each((_, el) => {
    const loc = $(el).find('loc').first().text().trim();
    if (!loc) return;
    const lastmod = $(el).find('lastmod').first().text().trim() || null;
    pages.push({ loc, lastmod });
  });
  return { pages, index };
}

export async function checkSitemap(
  origin: string,
  robotsSitemapUrl: string | null,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; now?: Date } = {},
): Promise<SitemapOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? SEO_FETCH_TIMEOUT_MS;
  const now = opts.now ?? new Date();
  const candidate = robotsSitemapUrl ?? `${origin}/sitemap.xml`;

  let page: FetchPage;
  try {
    page = await fetchPage(fetchImpl, candidate, timeoutMs);
  } catch (err) {
    const findings: NewFinding[] = [
      {
        category: 'sitemap',
        severity: 'warn',
        code: robotsSitemapUrl ? 'sitemap_fetch_error' : 'sitemap_missing',
        message: robotsSitemapUrl
          ? `Sitemap referenced by robots.txt could not be fetched (${err instanceof Error ? err.message : 'request failed'}).`
          : `No sitemap found (${candidate} unreachable).`,
        detail: { url: candidate },
      },
    ];
    return { findings, urls: [] };
  }

  if (page.status >= 400 || !/<(urlset|sitemapindex)[\s>]/i.test(page.body)) {
    const findings: NewFinding[] = [
      {
        category: 'sitemap',
        severity: 'warn',
        code: 'sitemap_missing',
        message:
          page.status >= 400
            ? `No sitemap found (${candidate} returned HTTP ${page.status}).`
            : `No valid sitemap at ${candidate} (response is not sitemap XML).`,
        detail: { url: candidate, status: page.status },
      },
    ];
    return { findings, urls: [] };
  }

  let { pages, index } = parseSitemapEntries(page.body);
  // One level of sitemap-index indirection, capped so this stays cheap.
  if (pages.length === 0 && index.length > 0) {
    for (const child of index.slice(0, 5)) {
      try {
        const childPage = await fetchPage(fetchImpl, child, timeoutMs);
        if (childPage.status < 400) {
          pages = pages.concat(parseSitemapEntries(childPage.body).pages);
        }
      } catch {
        /* unreachable child sitemap — skip */
      }
    }
  }

  const sameOrigin = pages.filter((p) => canonicalDomain(p.loc) === canonicalDomain(origin));
  const seen = new Set<string>();
  const urls: string[] = [];
  let stale = 0;
  const staleCutoff = now.getTime() - STALE_LASTMOD_DAYS * 24 * 60 * 60 * 1000;
  for (const entry of sameOrigin) {
    const key = entry.loc.split('#')[0]!;
    if (seen.has(key)) continue;
    seen.add(key);
    if (entry.lastmod) {
      const ts = Date.parse(entry.lastmod);
      if (!Number.isNaN(ts) && ts < staleCutoff) stale += 1;
    }
    if (urls.length < SEO_MAX_CRAWL_PAGES) urls.push(key);
  }

  const findings: NewFinding[] = [];
  if (urls.length === 0) {
    findings.push({
      category: 'sitemap',
      severity: 'warn',
      code: 'sitemap_empty',
      message: `Sitemap found at ${candidate} but contains no same-origin URLs.`,
      detail: { url: candidate },
    });
    return { findings, urls: [] };
  }

  findings.push({
    category: 'sitemap',
    severity: 'pass',
    code: 'sitemap_found',
    message: `Sitemap found with ${sameOrigin.length} same-origin URL(s).`,
    detail: { url: candidate, count: sameOrigin.length, crawled: urls.length },
  });
  if (stale > 0) {
    findings.push({
      category: 'sitemap',
      severity: 'info',
      code: 'sitemap_stale_lastmod',
      message: `${stale} of ${sameOrigin.length} sitemap URL(s) have a lastmod older than ${STALE_LASTMOD_DAYS} days.`,
      detail: { stale, total: sameOrigin.length },
    });
  }
  return { findings, urls };
}

// ---------------------------------------------------------------------------
// Check 4 — on-page crawl (cap 50 internal URLs)
// ---------------------------------------------------------------------------

interface PageChecks {
  url: string;
  findings: NewFinding[];
  /** Same-origin links discovered on the page (fallback crawl source). */
  links: string[];
  /** Same-origin image URLs worth a size check. */
  imageUrls: string[];
}

function extractInternalLinks($: cheerio.CheerioAPI, pageUrl: string, origin: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) return;
    let abs: URL;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (abs.origin !== origin || ASSET_RE.test(abs.pathname)) return;
    const key = `${abs.origin}${abs.pathname.replace(/\/$/, '') || '/'}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push(key);
  });
  return links;
}

function checkPageHtml(url: string, html: string): PageChecks {
  const $ = cheerio.load(html);
  const findings: NewFinding[] = [];
  const path = pathOf(url);
  let origin = '';
  try {
    origin = new URL(url).origin;
  } catch {
    /* leave empty — link/image discovery skipped */
  }

  const title = $('title').first().text().trim();
  if (!title) {
    findings.push({
      category: 'meta',
      severity: 'warn',
      code: 'meta_title_missing',
      message: `${path} has no title tag.`,
      detail: { url, path },
    });
  } else if (title.length > TITLE_MAX_CHARS) {
    findings.push({
      category: 'meta',
      severity: 'warn',
      code: 'meta_title_long',
      message: `${path} title is ${title.length} characters (over ${TITLE_MAX_CHARS}).`,
      detail: { url, path, length: title.length },
    });
  }

  const description =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    '';
  if (!description) {
    findings.push({
      category: 'meta',
      severity: 'warn',
      code: 'meta_description_missing',
      message: `${path} has no meta description.`,
      detail: { url, path },
    });
  }

  if ($('h1').length === 0) {
    findings.push({
      category: 'meta',
      severity: 'warn',
      code: 'meta_missing_h1',
      message: `${path} has no H1 heading.`,
      detail: { url, path },
    });
  }

  if ($('link[rel="canonical"]').length === 0) {
    findings.push({
      category: 'meta',
      severity: 'info',
      code: 'meta_canonical_missing',
      message: `${path} has no canonical link tag.`,
      detail: { url, path },
    });
  }

  let missingAlt = 0;
  const missingAltSamples: string[] = [];
  const imageUrls: string[] = [];
  const seenImg = new Set<string>();
  $('img').each((_, el) => {
    const alt = $(el).attr('alt');
    const role = $(el).attr('role');
    if ((alt === undefined || alt.trim() === '') && role !== 'presentation') {
      missingAlt += 1;
      if (missingAltSamples.length < 3) {
        const src = $(el).attr('src') ?? '';
        if (src) missingAltSamples.push(src);
      }
    }
    const src = $(el).attr('src');
    if (src && origin) {
      try {
        const abs = new URL(src, url);
        if (abs.origin === origin && !seenImg.has(abs.toString())) {
          seenImg.add(abs.toString());
          imageUrls.push(abs.toString());
        }
      } catch {
        /* ignore malformed src */
      }
    }
  });
  if (missingAlt > 0) {
    findings.push({
      category: 'images',
      severity: 'warn',
      code: 'images_missing_alt',
      message: `${path}: ${missingAlt} image(s) without alt text.`,
      detail: { url, path, count: missingAlt, samples: missingAltSamples },
    });
  }

  return { url, findings, links: origin ? extractInternalLinks($, url, origin) : [], imageUrls };
}

export interface CrawlOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Epoch ms after which the crawl must stop (partial results are kept). */
  deadline?: number;
}

export interface CrawlOutcome {
  findings: NewFinding[];
  truncated: boolean;
  pagesChecked: number;
}

/**
 * Crawl up to `urls.length` pages (already capped upstream). When `urls` is
 * empty, falls back to internal links discovered on the homepage — still real
 * pages, just discovered differently (recorded as an info finding).
 */
export async function crawlOnPage(
  siteUrl: string,
  urls: string[],
  opts: CrawlOptions = {},
): Promise<CrawlOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? SEO_FETCH_TIMEOUT_MS;
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY;
  const findings: NewFinding[] = [];
  let truncated = false;
  let pagesChecked = 0;
  let imageSizeChecks = 0;

  const sitemapDriven = urls.length > 0;
  const dedupeKey = (url: string) => url.split('#')[0]!;

  // Build the crawl queue. With a sitemap we trust its URLs; without one we
  // first fetch the homepage and seed the queue from its internal links.
  const queue: string[] = [];
  const queued = new Set<string>();
  const enqueue = (url: string) => {
    const key = dedupeKey(url);
    if (queued.has(key) || queued.size >= SEO_MAX_CRAWL_PAGES) return;
    queued.add(key);
    queue.push(key);
  };

  if (sitemapDriven) {
    // The audited URL itself is always crawled, even if the sitemap omits it.
    enqueue(siteUrl);
    for (const url of urls) enqueue(url);
  } else {
    if (Date.now() >= deadline) {
      return { findings, truncated: true, pagesChecked: 0 };
    }
    let home: FetchPage;
    try {
      home = await fetchPage(fetchImpl, siteUrl, timeoutMs);
    } catch (err) {
      const timedOut = err instanceof Error && /abort|timeout/i.test(err.message);
      findings.push({
        category: 'links',
        severity: 'fail',
        code: timedOut ? 'page_timeout' : 'link_broken',
        message: timedOut
          ? `${pathOf(siteUrl)} timed out after ${Math.round(timeoutMs / 1000)}s.`
          : `${pathOf(siteUrl)} could not be fetched (${err instanceof Error ? err.message : 'network error'}).`,
        detail: { url: siteUrl, error: err instanceof Error ? err.message : String(err) },
      });
      return { findings, truncated: false, pagesChecked: 0 };
    }
    if (home.status >= 400) {
      findings.push({
        category: 'links',
        severity: 'fail',
        code: 'link_broken',
        message: `${pathOf(siteUrl)} returned HTTP ${home.status}.`,
        detail: { url: siteUrl, status: home.status },
      });
      return { findings, truncated: false, pagesChecked: 0 };
    }
    pagesChecked += 1;
    const parsedHome = checkPageHtml(home.finalUrl || siteUrl, home.body);
    findings.push(...parsedHome.findings);
    await checkImageWeights(parsedHome.imageUrls);
    for (const link of parsedHome.links) enqueue(link);
  }

  async function checkImageWeights(imageUrls: string[]): Promise<void> {
    // HEAD only; servers that refuse HEAD or omit content-length are skipped —
    // we only report sizes we really measured.
    for (const img of imageUrls.slice(0, MAX_IMAGE_SIZE_CHECKS_PER_PAGE)) {
      if (imageSizeChecks >= MAX_IMAGE_SIZE_CHECKS_TOTAL || Date.now() >= deadline) {
        if (Date.now() >= deadline) truncated = true;
        return;
      }
      imageSizeChecks += 1;
      try {
        const res = await fetchWithTimeout(fetchImpl, img, timeoutMs, { method: 'HEAD' });
        const bytes = Number(res.headers.get('content-length') ?? 0);
        if (res.ok && bytes > IMAGE_SIZE_THRESHOLD_BYTES) {
          findings.push({
            category: 'images',
            severity: 'warn',
            code: 'images_oversized',
            message: `${pathOf(img)} is ${(bytes / 1024).toFixed(0)}KB (over ${IMAGE_SIZE_THRESHOLD_BYTES / 1024}KB).`,
            detail: { url: img, bytes },
          });
        }
      } catch {
        /* image unreachable via HEAD — not a finding we can stand behind */
      }
    }
  }

  async function checkOne(url: string): Promise<void> {
    if (Date.now() >= deadline) {
      truncated = true;
      return;
    }
    let page: FetchPage;
    try {
      page = await fetchPage(fetchImpl, url, timeoutMs);
    } catch (err) {
      const timedOut = err instanceof Error && /abort|timeout/i.test(err.message);
      findings.push({
        category: 'links',
        severity: 'fail',
        code: timedOut ? 'page_timeout' : 'link_broken',
        message: timedOut
          ? `${pathOf(url)} timed out after ${Math.round(timeoutMs / 1000)}s.`
          : `${pathOf(url)} could not be fetched (${err instanceof Error ? err.message : 'network error'}).`,
        detail: { url, error: err instanceof Error ? err.message : String(err) },
      });
      return;
    }

    if (page.status >= 400) {
      findings.push({
        category: 'links',
        severity: 'fail',
        code: 'link_broken',
        message: `${pathOf(url)} returned HTTP ${page.status}.`,
        detail: { url, status: page.status },
      });
      return;
    }

    pagesChecked += 1;
    const contentType = page.headers.get('content-type') ?? '';
    if (!/text\/html|application\/xhtml/i.test(contentType) && contentType !== '') {
      return; // PDFs, images, feeds — nothing to parse on-page
    }

    const parsed = checkPageHtml(page.finalUrl || url, page.body);
    findings.push(...parsed.findings);
    await checkImageWeights(parsed.imageUrls);
  }

  // Small worker pool keeps wall-clock sane without hammering the site.
  let cursor = 0;
  const workers = Array.from({ length: MAX_CONCURRENT_FETCHES }, async () => {
    for (;;) {
      if (Date.now() >= deadline) {
        if (cursor < queue.length) truncated = true;
        return;
      }
      const idx = cursor;
      cursor += 1;
      const url = queue[idx];
      if (!url) return;
      await checkOne(url);
    }
  });
  await Promise.all(workers);

  if (!sitemapDriven && pagesChecked > 0) {
    findings.unshift({
      category: 'sitemap',
      severity: 'info',
      code: 'crawl_source_homepage_links',
      message: `No sitemap available — crawled ${pagesChecked} page(s) discovered via homepage links instead.`,
      detail: { pagesChecked },
    });
  }

  return { findings, truncated, pagesChecked };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface SeoAuditOptions {
  /** Override the org's stored website URL (per-request audits). */
  siteUrl?: string;
  trigger?: 'manual' | 'scheduled';
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  hardCapMs?: number;
  fetchTimeoutMs?: number;
  psiTimeoutMs?: number;
  now?: Date;
}

export type SeoAuditOutcome =
  | { status: 'skipped'; reason: 'no-site' }
  | { status: 'audited'; audit: SeoAudit; findings: SeoFinding[] };

export async function runSeoAudit(ctx: AgentContext, opts: SeoAuditOptions = {}): Promise<SeoAuditOutcome> {
  let siteUrl = opts.siteUrl?.trim();
  if (!siteUrl) {
    const [org] = await ctx.db
      .select({ websiteUrl: organizations.websiteUrl })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);
    siteUrl = org?.websiteUrl?.trim() ?? '';
  }
  if (!siteUrl) return { status: 'skipped', reason: 'no-site' };
  const normalized = normalizeSiteUrl(siteUrl);
  const origin = new URL(normalized).origin;

  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.fetchTimeoutMs ?? SEO_FETCH_TIMEOUT_MS;
  const startedAt = opts.now ?? ctx.now ?? new Date();
  const deadline = startedAt.getTime() + (opts.hardCapMs ?? SEO_AUDIT_HARD_CAP_MS);

  const [auditRow] = await ctx.db
    .insert(seoAudits)
    .values({ orgId: ctx.orgId, siteUrl: normalized, status: 'running' })
    .returning();
  const auditId = auditRow!.id;

  const findings: NewFinding[] = [];
  let truncated = false;
  const pushAll = (items: NewFinding[]) => {
    for (const item of items) {
      if (findings.length >= SEO_MAX_FINDINGS) {
        truncated = true;
        return;
      }
      findings.push(item);
    }
  };

  try {
    const env = opts.env ?? process.env;
    // PSI runs a Lighthouse pass server-side — kick it off while we do the
    // cheap HTTP checks, then collect it before finishing.
    const psiPromise = checkCoreWebVitals(normalized, {
      apiKey: env.PAGESPEED_API_KEY ?? '',
      fetchImpl,
      timeoutMs: opts.psiTimeoutMs ?? SEO_PSI_TIMEOUT_MS,
    });

    const robots = await checkRobots(origin, { fetchImpl, timeoutMs });
    pushAll(robots.findings);

    const sitemap =
      Date.now() < deadline
        ? await checkSitemap(origin, robots.sitemapUrl, { fetchImpl, timeoutMs, now: startedAt })
        : { findings: [], urls: [] as string[] };
    pushAll(sitemap.findings);
    if (Date.now() >= deadline) truncated = true;

    // Without a usable sitemap the crawl discovers pages from homepage links.
    const crawl =
      Date.now() < deadline
        ? await crawlOnPage(normalized, sitemap.urls, { fetchImpl, timeoutMs, deadline })
        : { findings: [], truncated: true, pagesChecked: 0 };
    pushAll(crawl.findings);
    if (crawl.truncated) truncated = true;

    const psiFindings = await psiPromise;
    pushAll(psiFindings);

    if (truncated) {
      pushAll([
        {
          category: 'meta',
          severity: 'info',
          code: 'crawl_truncated',
          message: 'The audit hit its time cap — results below are real but partial.',
          detail: null,
        },
      ]);
    }

    const inserted =
      findings.length > 0
        ? await ctx.db
            .insert(seoFindings)
            .values(findings.map((f) => ({ auditId, ...f, detail: f.detail ?? null })))
            .returning()
        : [];

    const [finished] = await ctx.db
      .update(seoAudits)
      .set({ status: 'done', truncated, finishedAt: opts.now ?? ctx.now ?? new Date() })
      .where(eq(seoAudits.id, auditId))
      .returning();

    await ctx.audit.log({
      actorType: opts.trigger === 'manual' && ctx.userId ? 'user' : 'system',
      actorId: ctx.userId ?? `seo-audit-${opts.trigger ?? 'manual'}`,
      action: 'seo.audit_completed',
      entityType: 'seo_audit',
      entityId: auditId,
      metadata: {
        trigger: opts.trigger ?? 'manual',
        status: 'done',
        findings: inserted.length,
        truncated,
        pagesChecked: crawl.pagesChecked,
      },
    });

    return { status: 'audited', audit: finished!, findings: inserted };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Persist whatever was collected so far, then mark the run failed.
    if (findings.length > 0) {
      await ctx.db
        .insert(seoFindings)
        .values(findings.map((f) => ({ auditId, ...f, detail: f.detail ?? null })))
        .catch(() => {});
    }
    const [finished] = await ctx.db
      .update(seoAudits)
      .set({ status: 'failed', truncated, error: message, finishedAt: opts.now ?? ctx.now ?? new Date() })
      .where(eq(seoAudits.id, auditId))
      .returning();
    await ctx.audit.log({
      actorType: 'system',
      actorId: `seo-audit-${opts.trigger ?? 'manual'}`,
      action: 'seo.audit_failed',
      entityType: 'seo_audit',
      entityId: auditId,
      metadata: { error: message },
    });
    return { status: 'audited', audit: finished!, findings: [] };
  }
}

// ---------------------------------------------------------------------------
// Reads — always computed from stored rows (honesty rail)
// ---------------------------------------------------------------------------

export interface SeoAuditSummary {
  audit: SeoAudit;
  counts: Record<SeoFindingSeverity, number>;
  scores: {
    performance: number | null;
    seo: number | null;
    psiPending: boolean;
    psiError: string | null;
  };
  cwv: { lcpMs: number | null; cls: number | null; tbtMs: number | null };
  findings: (SeoFinding & { hint: string | null })[];
}

export async function latestAudit(ctx: AgentContext): Promise<SeoAudit | null> {
  const [row] = await ctx.db
    .select()
    .from(seoAudits)
    .where(eq(seoAudits.orgId, ctx.orgId))
    .orderBy(desc(seoAudits.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getLatestAuditSummary(ctx: AgentContext): Promise<SeoAuditSummary | null> {
  const audit = await latestAudit(ctx);
  if (!audit) return null;
  const findings = await ctx.db
    .select()
    .from(seoFindings)
    .where(eq(seoFindings.auditId, audit.id))
    .orderBy(seoFindings.createdAt);
  return summarizeAudit(audit, findings);
}

export function summarizeAudit(audit: SeoAudit, findings: SeoFinding[]): SeoAuditSummary {
  const counts: Record<SeoFindingSeverity, number> = { pass: 0, info: 0, warn: 0, fail: 0 };
  let performance: number | null = null;
  let seo: number | null = null;
  let lcpMs: number | null = null;
  let cls: number | null = null;
  let tbtMs: number | null = null;
  let psiPending = false;
  let psiError: string | null = null;

  for (const finding of findings) {
    counts[finding.severity as SeoFindingSeverity] =
      (counts[finding.severity as SeoFindingSeverity] ?? 0) + 1;
    const detail = finding.detail ?? {};
    switch (finding.code) {
      case 'cwv_perf_score':
        performance = typeof detail.score === 'number' ? detail.score : null;
        break;
      case 'cwv_seo_score':
        seo = typeof detail.score === 'number' ? detail.score : null;
        break;
      case 'cwv_lcp':
        lcpMs = typeof detail.lcpMs === 'number' ? detail.lcpMs : null;
        break;
      case 'cwv_cls':
        cls = typeof detail.cls === 'number' ? detail.cls : null;
        break;
      case 'cwv_tbt':
        tbtMs = typeof detail.tbtMs === 'number' ? detail.tbtMs : null;
        break;
      case 'psi_key_missing':
        psiPending = true;
        break;
      case 'psi_error':
        psiError = finding.message;
        break;
      default:
        break;
    }
  }

  return {
    audit,
    counts,
    scores: { performance, seo, psiPending, psiError },
    cwv: { lcpMs, cls, tbtMs },
    findings: findings.map((f) => ({ ...f, hint: SEO_FINDING_HINTS[f.code] ?? null })),
  };
}

export interface SeoAuditHistoryPoint {
  audit: SeoAudit;
  counts: Record<SeoFindingSeverity, number>;
}

export async function getAuditHistory(ctx: AgentContext, limit = 12): Promise<SeoAuditHistoryPoint[]> {
  const audits = await ctx.db
    .select()
    .from(seoAudits)
    .where(eq(seoAudits.orgId, ctx.orgId))
    .orderBy(desc(seoAudits.createdAt))
    .limit(limit);
  if (audits.length === 0) return [];

  const rows = await ctx.db
    .select({
      auditId: seoFindings.auditId,
      severity: seoFindings.severity,
      n: sql<number>`count(*)::int`,
    })
    .from(seoFindings)
    .where(inArray(seoFindings.auditId, audits.map((a) => a.id)))
    .groupBy(seoFindings.auditId, seoFindings.severity);

  const byAudit = new Map<string, Record<SeoFindingSeverity, number>>();
  for (const row of rows) {
    const slot = byAudit.get(row.auditId) ?? { pass: 0, info: 0, warn: 0, fail: 0 };
    slot[row.severity as SeoFindingSeverity] = row.n;
    byAudit.set(row.auditId, slot);
  }

  return audits.map((audit) => ({
    audit,
    counts: byAudit.get(audit.id) ?? { pass: 0, info: 0, warn: 0, fail: 0 },
  }));
}

// ---------------------------------------------------------------------------
// Batch runner (worker geo-scan weekly hook)
// ---------------------------------------------------------------------------

export interface SeoAuditsRun {
  orgs: number;
  audited: number;
  skipped: number;
  errors: string[];
}

/** Audit every org's site; per-org failures are collected, never thrown. */
export async function runSeoAuditsForAllOrgs(db: Db, opts: SeoAuditOptions = {}): Promise<SeoAuditsRun> {
  const orgs = await db.select({ id: organizations.id }).from(organizations);
  const run: SeoAuditsRun = { orgs: orgs.length, audited: 0, skipped: 0, errors: [] };

  for (const org of orgs) {
    const ctx = createAgentContext({ db, orgId: org.id });
    try {
      const outcome = await runSeoAudit(ctx, opts);
      if (outcome.status === 'audited') run.audited += 1;
      else run.skipped += 1;
    } catch (err) {
      run.errors.push(`${org.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return run;
}

export interface WeeklyVisibilityRun {
  geo: GeoScansRun;
  seo: SeoAuditsRun;
}

/**
 * Weekly hook (worker `geo-scan` queue): run the GEO scan first, then a fresh
 * technical SEO audit for every org — visibility gaps and site health land
 * together on the /visibility page.
 */
export async function runGeoScansAndSeoAuditsForAllOrgs(
  db: Db,
  opts: { geo?: GeoScanOptions; seo?: SeoAuditOptions } = {},
): Promise<WeeklyVisibilityRun> {
  const geo = await runGeoScansForAllOrgs(db, { trigger: 'scheduled', ...(opts.geo ?? {}) });
  const seo = await runSeoAuditsForAllOrgs(db, { trigger: 'scheduled', ...(opts.seo ?? {}) });
  return { geo, seo };
}
