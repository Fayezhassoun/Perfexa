// Shared types for @voxmarketer/integrations — mirrors CONTRACTS.md §7.
// These definitions are the binding contract; do not change shapes without
// updating CONTRACTS.md and every consumer.

export interface CrawlResult {
  url: string;
  finalUrl: string;
  fetchedAt: string; // ISO
  title: string | null;
  metaDescription: string | null;
  headings: { h1: string[]; h2: string[] };
  pages: { url: string; title: string | null; metaDescription: string | null }[]; // up to 10 internal pages
  hasLeadForm: boolean; // <form> with email-ish input OR contact CTA
  hasRobotsTxt: boolean;
  hasSitemap: boolean;
  missingMetaDescriptions: number; // pages missing meta desc
  technologies: string[]; // naive detection (wordpress, shopify, react...)
  error?: string; // set when crawl failed (caller falls back to mock)
}

export interface PageSpeedResult {
  url: string;
  strategy: 'mobile' | 'desktop';
  performanceScore: number; // 0-100
  cwv: {
    lcpMs: number | null;
    cls: number | null;
    inpMs: number | null;
    fcpMs: number | null;
  };
  isMock: boolean;
  error?: string;
}

export interface SeoAudit {
  url: string;
  score: number; // 0-100 deterministic from checks
  checks: { id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }[];
  pagespeed: PageSpeedResult;
  crawl: CrawlResult;
  keywordSuggestions: { keyword: string; intent: string }[]; // min 10
  isMock: boolean;
}

export type AdPlatform = 'google_ads' | 'meta' | 'tiktok';

export interface AdCampaignInput {
  name: string;
  objective: string;
  dailyBudgetCents: number;
  targeting: { geography?: string; keywords?: string[]; audience?: string };
  adCopy?: { headline: string; body: string };
}

export interface CampaignMetrics {
  impressions: number;
  clicks: number;
  spendCents: number;
  conversions: number;
}

export interface AdCampaign {
  externalId: string;
  platform: AdPlatform;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'removed';
  budgetDailyCents: number;
  metrics: CampaignMetrics;
}

export interface AdapterStore {
  load(orgId: string, platform: AdPlatform): Promise<unknown>;
  save(orgId: string, platform: AdPlatform, state: unknown): Promise<void>;
}

export interface AdapterDeps {
  store: AdapterStore;
  /** Org whose state the adapter reads/writes (mock adapters are per-org stateful). */
  orgId?: string;
}

export interface AdAdapter {
  platform: AdPlatform;
  mode: 'sandbox' | 'live';
  listCampaigns(): Promise<AdCampaign[]>;
  createCampaign(input: AdCampaignInput): Promise<AdCampaign>; // SPEND-GATED at tool layer
  pauseCampaign(externalId: string): Promise<void>;
  resumeCampaign(externalId: string): Promise<void>;
  updateBudget(externalId: string, dailyBudgetCents: number): Promise<void>; // SPEND-GATED
  getMetrics(externalId: string): Promise<CampaignMetrics>;
  getKeywordIdeas?(
    seed: string,
    geography?: string,
  ): Promise<{ keyword: string; avgMonthlySearches: number; cpcCents: number }[]>;
  checkAdPolicy?(adCopy: { headline: string; body: string }): Promise<{ ok: boolean; violations: string[] }>;
}

export interface KnowledgeSeedDoc {
  source: 'google_ads_help' | 'meta_help' | 'tiktok_help' | 'seo_guide' | 'policy';
  title: string;
  content: string;
}
