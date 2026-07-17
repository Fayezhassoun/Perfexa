// Seed corpus for the pgvector/JSONB knowledge store (CONTRACTS §7).
// Distilled best-practice notes in plain language, written for grounding agent
// advice. Keep docs self-contained and jargon-light.

import type { KnowledgeSeedDoc } from './types.js';

export const KNOWLEDGE_SEED_DOCS: KnowledgeSeedDoc[] = [
  {
    source: 'google_ads_help',
    title: 'Google Ads campaign structure',
    content:
      'A Google Ads account is organized as campaigns → ad groups → keywords and ads. Each campaign has its own budget, bidding strategy, location targeting, and language. Group tightly related keywords into the same ad group so the ads in that group match the searcher’s intent closely. A common starter structure for a local business: one Search campaign, 2–4 ad groups by service theme, 5–15 keywords per ad group, and at least 2 responsive search ads per group. Keep brand-name keywords in their own ad group — they are cheap and convert well.',
  },
  {
    source: 'google_ads_help',
    title: 'Quality Score and Ad Rank',
    content:
      'Ad Rank decides whether and where your ad shows. It is roughly your bid × Quality Score × expected impact of extensions. Quality Score (1–10) is Google’s estimate of expected click-through rate, ad relevance, and landing page experience. Improving it lowers your cost per click: match ad copy closely to the keywords in the ad group, send clicks to a specific, fast, mobile-friendly page (not always the homepage), and keep CTR healthy by writing specific, benefit-led headlines. A quality score of 7+ on core keywords is a good target.',
  },
  {
    source: 'google_ads_help',
    title: 'Negative keywords',
    content:
      'Negative keywords stop your ads from showing on irrelevant searches — the cheapest money in Google Ads. Review the search terms report weekly and add negatives for anything off-target: job seekers (“jobs”, “salary”), DIY researchers (“how to”, “free”, “tutorial”), and competitors if you do not want those clicks. Common starter negatives for service businesses: free, jobs, career, DIY, course, pdf, images. Use exact-phrase negatives carefully so you do not block good traffic.',
  },
  {
    source: 'google_ads_help',
    title: 'Smart bidding basics',
    content:
      'Automated bidding strategies adjust bids per auction. Maximize Clicks is reasonable for the first 1–2 weeks to gather data with a capped daily budget. Switch to Maximize Conversions once the campaign has consistent conversion tracking, and only add a target CPA after ~15–30 conversions in 30 days so the algorithm has signal. Always set up conversion tracking before enabling conversion-based bidding — bidding toward an unmeasured goal wastes budget. Raise or lower budgets gradually (≤20% per week) to avoid resetting the learning phase.',
  },
  {
    source: 'meta_help',
    title: 'Meta campaign structure (campaign, ad set, ad)',
    content:
      'Meta campaigns have three levels. The campaign sets the objective (e.g. Leads, Traffic, Sales). Each ad set controls budget, audience, placements, and schedule. Ads are the creatives inside an ad set. For small budgets, keep it simple: one campaign with the Leads or Traffic objective, 1–3 ad sets testing distinct audiences, and 2–4 ads per ad set. Avoid editing live ad sets often — every significant edit restarts Meta’s learning phase, which needs roughly 50 optimization events per ad set per week to exit.',
  },
  {
    source: 'meta_help',
    title: 'Audiences: Advantage+ vs interest targeting',
    content:
      'Advantage+ audience lets Meta’s system find people beyond your manual inputs and is now the default recommendation for most advertisers — provide your customer description and location, and let delivery optimize. Manual interest/behavior targeting still helps when starting from zero: stack 3–6 closely related interests rather than dozens of unrelated ones, and keep the potential audience above ~1M people for prospecting. Retargeting (website visitors, engagers, customer lists) usually delivers the cheapest leads — build those audiences from day one even if you target them later.',
  },
  {
    source: 'meta_help',
    title: 'Pixel and Conversions API',
    content:
      'The Meta Pixel is a snippet on your website that reports visitor actions (page views, leads, purchases) back to Meta for measurement and optimization. The Conversions API (CAPI) sends the same events server-to-server, which recovers signal lost to browser tracking prevention. Best practice is running both with event deduplication via a shared event_id. Verify events in Events Manager before spending — optimizing toward a broken lead event teaches the system the wrong lesson and burns budget.',
  },
  {
    source: 'tiktok_help',
    title: 'TikTok campaign structure',
    content:
      'TikTok Ads Manager mirrors other platforms: campaign (objective) → ad group (budget, audience, placement, schedule) → ads (creative). Minimum budgets: $50/day at campaign level and $20/day at ad group level for most objectives. Start with one campaign, 2–3 ad groups with distinct audiences, and 3–5 creatives per group — TikTok creative fatigues faster than other platforms, so plan to refresh creatives every 1–2 weeks. Use Automatic Placement and let the algorithm optimize unless you have a reason not to.',
  },
  {
    source: 'tiktok_help',
    title: 'TikTok creative best practices',
    content:
      'Winning TikTok ads look native to the feed, not like TV commercials. Hook attention in the first 3 seconds (a question, bold claim, or visual surprise), shoot vertical 9:16, design for sound-on with voiceover or music, and keep videos 21–34 seconds for performance objectives. Show real people using the product; user-generated-content style beats polished brand spots on both CTR and CPA. Add captions or text overlays for accessibility, end with one clear call to action, and produce several variations — creative is the biggest performance lever on TikTok.',
  },
  {
    source: 'seo_guide',
    title: 'Technical SEO checklist',
    content:
      'The foundations every small-business site needs: one unique title tag (20–65 characters) and meta description (70–160 characters) per page; exactly one H1 per page matching the page’s topic; HTTPS everywhere; a sitemap.xml submitted in Search Console; a robots.txt that does not block important pages; clean, readable URLs (/services/plumbing, not /page?id=42); mobile-friendly responsive layout; and internal links between your main pages. Fix these before chasing advanced tactics — they unblock indexing and are fully within your control.',
  },
  {
    source: 'seo_guide',
    title: 'Core Web Vitals thresholds',
    content:
      'Google measures real-user page experience with three Core Web Vitals. LCP (Largest Contentful Paint): main content should load within 2.5 seconds. INP (Interaction to Next Paint): pages should respond to taps/clicks within 200 milliseconds. CLS (Cumulative Layout Shift): visual stability score should stay at or below 0.1. The biggest wins for slow sites: compress and resize images (and lazy-load below-the-fold ones), remove unused third-party scripts, use a lightweight theme, and enable caching/CDN. Run PageSpeed Insights monthly; aim for all three metrics “Good” on mobile.',
  },
  {
    source: 'seo_guide',
    title: 'Local SEO basics',
    content:
      'For businesses serving a city or region: create and fully complete a Google Business Profile (categories, hours, photos, services) — it drives map-pack visibility more than any website change. Keep your business name, address, and phone number identical everywhere online. Add your city/region to title tags, H1s, and body copy where natural (“Roof repair in Austin”). Collect Google reviews steadily and reply to them. Create one page per service and, if you serve multiple areas, one page per area with unique content. Local rankings typically move in 4–12 weeks with consistent effort.',
  },
  {
    source: 'policy',
    title: 'Google Ads policy basics',
    content:
      'Google disapproves ads or suspends accounts for: misrepresentation (claims you cannot substantiate, “#1” without evidence, guaranteed results), prohibited content (counterfeit, dangerous products, some healthcare and financial claims without certification), prohibited practices (cloaking, malicious sites, data collection without disclosure), and editorial standards (excessive capitalization, gimmicky punctuation, “click here” as the entire CTA, phone numbers in ad text). Before launching: read the ad aloud — would a skeptic believe every claim? If not, soften it. Disapproved ads can be edited and resubmitted; repeated violations escalate to account suspension.',
  },
  {
    source: 'policy',
    title: 'Meta ad policy basics',
    content:
      'Meta rejects ads for: personal attributes targeting (calling out “Are you in debt?”, “Do you suffer from…”), before/after and unrealistic-results imagery (especially health/weight), sensational or shocking content, misleading claims, and prohibited categories (tobacco, weapons, adult, some financial products without permission). Landing pages must match the ad and work properly. Text in images is allowed now but keep it under ~20% for best delivery. If an ad is rejected, edit the copy/creative and request review — do not duplicate the rejected ad unchanged, as repeated rejections can restrict the ad account.',
  },
  {
    source: 'policy',
    title: 'TikTok ad policy basics',
    content:
      'TikTok enforces: no misleading claims or exaggerated results, no before/after comparisons for body image products, age-appropriate targeting (no alcohol/gambling to minors; some verticals banned outright by region), creatives must match the landing page, and mandatory disclosures for regulated industries. Intellectual property rules are strict — use licensed or original music via TikTok’s Commercial Music Library in ads. Review is mostly automated and fast (often under an hour); rejected ads include a reason, and most are fixable by softening claims or swapping creative.',
  },
];
