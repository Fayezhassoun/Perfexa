// Combined SEO audit: crawl + PageSpeed → deterministic score, checks,
// keyword suggestions (CONTRACTS §7).

import { crawlWebsite } from './crawler.js';
import { runPageSpeed } from './pagespeed.js';
import type { SeoAudit } from './types.js';

const STOPWORDS = new Set(
  ('a an the and or of to in for on with at by from is are was were be been we our your you ' +
    'us it its this that these those welcome home page best top get more about contact')
    .split(' '),
);

interface CheckSpec {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

function buildChecks(audit: { crawl: Awaited<ReturnType<typeof crawlWebsite>>; ps: Awaited<ReturnType<typeof runPageSpeed>> }): CheckSpec[] {
  const { crawl, ps } = audit;
  const checks: CheckSpec[] = [];
  const title = crawl.title ?? '';
  checks.push({
    id: 'title',
    label: 'Page title',
    status: !title ? 'fail' : title.length < 20 || title.length > 65 ? 'warn' : 'pass',
    detail: !title
      ? 'Every page needs a title tag.'
      : title.length < 20 || title.length > 65
        ? `Title is ${title.length} characters (ideal 20–65).`
        : 'Title tag looks good.',
  });
  const meta = crawl.metaDescription ?? '';
  checks.push({
    id: 'meta_description',
    label: 'Meta description',
    status: !meta ? 'fail' : meta.length < 70 || meta.length > 160 ? 'warn' : 'pass',
    detail: !meta
      ? `Homepage has no meta description (${crawl.missingMetaDescriptions} page(s) missing in total).`
      : meta.length < 70 || meta.length > 160
        ? `Meta description is ${meta.length} characters (ideal 70–160).`
        : 'Meta description looks good.',
  });
  checks.push({
    id: 'single_h1',
    label: 'Main heading (H1)',
    status: crawl.headings.h1.length === 1 ? 'pass' : crawl.headings.h1.length === 0 ? 'fail' : 'warn',
    detail:
      crawl.headings.h1.length === 1
        ? 'Exactly one H1 — good.'
        : crawl.headings.h1.length === 0
          ? 'No H1 heading found.'
          : `${crawl.headings.h1.length} H1 headings found (should be exactly one).`,
  });
  checks.push({
    id: 'lead_form',
    label: 'Lead capture',
    status: crawl.hasLeadForm ? 'pass' : 'fail',
    detail: crawl.hasLeadForm
      ? 'A contact or signup form was found.'
      : 'No lead form found — visitors have no easy way to contact you.',
  });
  checks.push({
    id: 'https',
    label: 'HTTPS',
    status: crawl.finalUrl.startsWith('https://') ? 'pass' : 'fail',
    detail: crawl.finalUrl.startsWith('https://') ? 'Site is served over HTTPS.' : 'Site is not using HTTPS.',
  });
  checks.push({
    id: 'robots_txt',
    label: 'robots.txt',
    status: crawl.hasRobotsTxt ? 'pass' : 'warn',
    detail: crawl.hasRobotsTxt ? 'robots.txt present.' : 'No robots.txt found.',
  });
  checks.push({
    id: 'sitemap',
    label: 'Sitemap',
    status: crawl.hasSitemap ? 'pass' : 'warn',
    detail: crawl.hasSitemap ? 'sitemap.xml present.' : 'No sitemap.xml found — search engines may miss pages.',
  });
  const s = ps.performanceScore;
  checks.push({
    id: 'mobile_speed',
    label: 'Mobile speed',
    status: s >= 90 ? 'pass' : s >= 50 ? 'warn' : 'fail',
    detail: `Mobile performance score ${s}/100${ps.isMock ? ' (simulated)' : ''}.`,
  });
  return checks;
}

/** Deterministic score: start at 100, subtract per-check penalties. */
function scoreFromChecks(checks: CheckSpec[]): number {
  const PENALTY: Record<string, { warn: number; fail: number }> = {
    title: { warn: 3, fail: 8 },
    meta_description: { warn: 3, fail: 10 },
    single_h1: { warn: 2, fail: 6 },
    lead_form: { warn: 0, fail: 12 },
    https: { warn: 0, fail: 15 },
    robots_txt: { warn: 2, fail: 4 },
    sitemap: { warn: 4, fail: 6 },
    mobile_speed: { warn: 10, fail: 20 },
  };
  let score = 100;
  for (const c of checks) {
    if (c.status === 'pass') continue;
    score -= PENALTY[c.id]?.[c.status] ?? 2;
  }
  return Math.max(0, Math.min(100, score));
}

function suggestKeywords(crawl: Awaited<ReturnType<typeof crawlWebsite>>): SeoAudit['keywordSuggestions'] {
  const text = [crawl.title ?? '', ...crawl.headings.h1, ...crawl.headings.h2].join(' ');
  const words = (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []).filter((w) => !STOPWORDS.has(w));
  const unigrams = [...new Set(words)];
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`;
    if (!bigrams.includes(bg)) bigrams.push(bg);
  }
  const candidates = [...bigrams, ...unigrams];
  const keywords = candidates.slice(0, 12).map((keyword) => ({
    keyword,
    intent: /service|quote|hire|book|buy|pricing/.test(keyword)
      ? 'transactional'
      : /near|city|town/.test(keyword)
        ? 'local'
        : 'informational',
  }));
  const GENERIC: SeoAudit['keywordSuggestions'] = [
    { keyword: 'services near me', intent: 'local' },
    { keyword: 'get a quote', intent: 'transactional' },
    { keyword: 'contact us', intent: 'transactional' },
    { keyword: 'about our company', intent: 'informational' },
    { keyword: 'customer reviews', intent: 'informational' },
    { keyword: 'pricing', intent: 'transactional' },
    { keyword: 'book an appointment', intent: 'transactional' },
    { keyword: 'how it works', intent: 'informational' },
    { keyword: 'our team', intent: 'informational' },
    { keyword: 'special offers', intent: 'transactional' },
  ];
  for (const g of GENERIC) {
    if (keywords.length >= 10) break;
    if (!keywords.some((k) => k.keyword === g.keyword)) keywords.push(g);
  }
  return keywords;
}

export async function runSeoAudit(url: string, opts?: { mode?: 'live' | 'mock' }): Promise<SeoAudit> {
  const [crawl, pagespeed] = await Promise.all([crawlWebsite(url, opts), runPageSpeed(url, 'mobile', opts)]);
  const checks = buildChecks({ crawl, ps: pagespeed });
  return {
    url: crawl.finalUrl,
    score: scoreFromChecks(checks),
    checks,
    pagespeed,
    crawl,
    keywordSuggestions: suggestKeywords(crawl),
    isMock: pagespeed.isMock || Boolean(crawl.error),
  };
}
