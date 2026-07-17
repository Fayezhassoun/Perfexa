// Website crawler (CONTRACTS §7). Live mode fetches real pages; mock mode is
// deterministic per URL. Live failures degrade to mock with `error` set.

import * as cheerio from 'cheerio';
import type { CrawlResult } from './types.js';
import { hashString, hostnameOf, pickDeterministic, seededRange } from './util/hash.js';

const UA = 'VoxMarketerBot/1.0 (+https://voxmarketer.dev)';
const MAX_PAGES = 10;

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Empty URL');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function fetchText(url: string, timeoutMs: number): Promise<{ finalUrl: string; body: string; headers: Headers }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*' },
      redirect: 'follow',
    });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { status: res.status });
    return { finalUrl: res.url || url, body: await res.text(), headers: res.headers };
  } finally {
    clearTimeout(timer);
  }
}

async function pathExists(baseOrigin: string, path: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${baseOrigin}${path}`, {
      signal: controller.signal,
      headers: { 'user-agent': UA },
      redirect: 'follow',
    });
    return res.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const CTA_RE = /contact|get (a )?quote|sign ?up|book|call us|request (a )?(call|demo)|get started/i;

interface ParsedPage {
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  h2: string[];
  links: string[];
  hasLeadForm: boolean;
  technologies: string[];
}

function parsePage(html: string, pageUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  const text = (sel: string) => $(sel).first().text().trim() || null;
  const metaDescription =
    $('meta[name="description"]').attr('content')?.trim() ||
    $('meta[property="og:description"]').attr('content')?.trim() ||
    null;

  const h1 = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h2 = $('h2').map((_, el) => $(el).text().trim()).get().filter(Boolean);

  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    origin = pageUrl;
  }
  const links = $('a[href]')
    .map((_, el) => $(el).attr('href') ?? '')
    .get()
    .filter((href) => href && !href.startsWith('#') && !/^(mailto:|tel:|javascript:)/i.test(href))
    .map((href) => {
      try {
        return new URL(href, pageUrl).toString();
      } catch {
        return '';
      }
    })
    .filter((abs) => abs.startsWith(origin))
    .map((abs) => (abs.split('#')[0] ?? abs).replace(/\/$/, ''))
    .filter((abs, i, arr) => arr.indexOf(abs) === i && !/\.(png|jpe?g|gif|svg|css|js|pdf|zip|webp)$/i.test(abs));

  let hasLeadForm = false;
  $('form').each((_, form) => {
    const inputs = $(form).find('input, textarea');
    const emailish = inputs.filter((_, inp) => {
      const type = ($(inp).attr('type') ?? '').toLowerCase();
      const name = ($(inp).attr('name') ?? '').toLowerCase();
      return type === 'email' || type === 'tel' || /email|phone/.test(name);
    });
    if (emailish.length > 0) hasLeadForm = true;
  });
  if (!hasLeadForm) {
    $('a, button').each((_, el) => {
      if (CTA_RE.test($(el).text())) hasLeadForm = true;
    });
  }

  const technologies = new Set<string>();
  const generator = $('meta[name="generator"]').attr('content')?.toLowerCase() ?? '';
  if (generator.includes('wordpress') || html.includes('wp-content')) technologies.add('wordpress');
  if (generator.includes('shopify') || html.includes('cdn.shopify.com')) technologies.add('shopify');
  if (generator.includes('wix') || html.includes('wix.com')) technologies.add('wix');
  if (html.includes('squarespace')) technologies.add('squarespace');
  if (html.includes('__NEXT_DATA__')) technologies.add('nextjs');
  if (html.includes('data-reactroot') || html.includes('__react')) technologies.add('react');

  return { title: text('title'), metaDescription, h1, h2, links, hasLeadForm, technologies: [...technologies] };
}

/** Load-bearing fixture for the §12 reference dialog. */
function mockCrawl(url: string): CrawlResult {
  const host = hostnameOf(url);
  if (host === 'example.com') {
    return {
      url,
      finalUrl: url,
      fetchedAt: new Date().toISOString(),
      title: 'Example Business — Home Services',
      metaDescription: null,
      headings: { h1: ['Welcome to Example Business'], h2: ['Our Services', 'About Us'] },
      pages: [
        { url: `${url.replace(/\/$/, '')}/`, title: 'Example Business — Home Services', metaDescription: null },
        { url: `${url.replace(/\/$/, '')}/about`, title: 'About Us', metaDescription: null },
        { url: `${url.replace(/\/$/, '')}/services`, title: 'Our Services', metaDescription: 'We offer great services.' },
        { url: `${url.replace(/\/$/, '')}/contact`, title: 'Contact', metaDescription: null },
      ],
      hasLeadForm: false,
      hasRobotsTxt: true,
      hasSitemap: false,
      missingMetaDescriptions: 3,
      technologies: ['wordpress'],
    };
  }
  const seed = hashString(host);
  const brand = (host.split('.')[0] ?? host).replace(/[-_]/g, ' ');
  const pageCount = 2 + (seed % 4);
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    url: `${url.replace(/\/$/, '')}/${i === 0 ? '' : ['about', 'services', 'pricing', 'contact'][i - 1] ?? `page-${i}`}`,
    title: i === 0 ? `${brand} — home` : `${brand} — page ${i}`,
    metaDescription: seededRange(seed + i, 0, 1) === 1 ? `Description of ${brand} page ${i}` : null,
  }));
  return {
    url,
    finalUrl: url,
    fetchedAt: new Date().toISOString(),
    title: `${brand} — home`,
    metaDescription: pages[0]?.metaDescription ?? null,
    headings: {
      h1: [`Welcome to ${brand}`],
      h2: pickDeterministic(seed, [['Our services', 'Why choose us'], ['What we do'], ['About us', 'Testimonials']]),
    },
    pages,
    hasLeadForm: seed % 2 === 0,
    hasRobotsTxt: seed % 3 !== 0,
    hasSitemap: seed % 2 === 1,
    missingMetaDescriptions: pages.filter((p) => !p.metaDescription).length,
    technologies: [pickDeterministic(seed, ['wordpress', 'shopify', 'wix', 'nextjs'] as const)],
  };
}

export async function crawlWebsite(url: string, opts?: { mode?: 'live' | 'mock' }): Promise<CrawlResult> {
  const normalized = normalizeUrl(url);
  const mode = opts?.mode ?? (process.env.SEO_AUDIT_MODE === 'mock' ? 'mock' : 'live');
  if (mode === 'mock') return mockCrawl(normalized);

  try {
    const { finalUrl, body } = await fetchText(normalized, 10_000);
    const home = parsePage(body, finalUrl);
    const origin = new URL(finalUrl).origin;

    const pages: CrawlResult['pages'] = [
      { url: finalUrl, title: home.title, metaDescription: home.metaDescription },
    ];
    const seen = new Set<string>();
    for (const link of home.links) {
      if (pages.length >= MAX_PAGES) break;
      const key = link.replace(/\/$/, '');
      if (seen.has(key) || key === finalUrl.replace(/\/$/, '')) continue;
      seen.add(key);
      try {
        const sub = await fetchText(link, 5000);
        const parsed = parsePage(sub.body, sub.finalUrl);
        pages.push({ url: sub.finalUrl, title: parsed.title, metaDescription: parsed.metaDescription });
        if (parsed.hasLeadForm) home.hasLeadForm = true;
      } catch {
        // skip unreachable internal page
      }
    }

    const [hasRobotsTxt, hasSitemap] = await Promise.all([
      pathExists(origin, '/robots.txt'),
      pathExists(origin, '/sitemap.xml'),
    ]);

    return {
      url: normalized,
      finalUrl,
      fetchedAt: new Date().toISOString(),
      title: home.title,
      metaDescription: home.metaDescription,
      headings: { h1: home.h1, h2: home.h2 },
      pages,
      hasLeadForm: home.hasLeadForm,
      hasRobotsTxt,
      hasSitemap,
      missingMetaDescriptions: pages.filter((p) => !p.metaDescription).length,
      technologies: home.technologies,
    };
  } catch (err) {
    // Graceful degradation: deterministic mock + visible error.
    const fallback = mockCrawl(normalized);
    fallback.error = `Live crawl failed (${err instanceof Error ? err.message : String(err)}). Showing simulated results.`;
    return fallback;
  }
}
