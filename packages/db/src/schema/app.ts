import { pgTable, text, timestamp, integer, uuid, jsonb, unique, boolean, real, bigint } from 'drizzle-orm/pg-core';
import { users } from './auth';
import type { Goal } from './enums';

// App tables per CONTRACTS §4. Table names snake_case plural; TS props camelCase.
// Money is integer cents (*Cents). "Enums" are text columns (zod unions in enums.ts).

/** Structured brand context the AI uses to ground all output. */
export interface BrandProfile {
  companyName?: string;
  tagline?: string;
  industry?: string;
  targetAudience?: string;
  voiceTone?: string;
  brandColors?: string[];
  doList?: string[];
  dontList?: string[];
  competitors?: string[];
  usp?: string;
  website?: string;
  products?: string[];
  pastWins?: string[];
}

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  websiteUrl: text('website_url'),
  goals: jsonb('goals').$type<Goal[]>(),
  monthlyBudgetCeilingCents: integer('monthly_budget_ceiling_cents').default(50000),
  onboardingStep: text('onboarding_step').default('welcome'),
  // notifications + agent memory live here (CONTRACTS §5/§8)
  settings: jsonb('settings').$type<Record<string, unknown>>().default({}),
  // Brand DNA — structured brand context for AI grounding
  brandProfile: jsonb('brand_profile').$type<BrandProfile>().default({}),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const orgMembers = pgTable(
  'org_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').default('owner'),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [unique('org_members_org_user_unique').on(t.orgId, t.userId)],
);

/** White-label portal configuration per org. */
export interface PortalConfig {
  portalName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  customDomain?: string;
  footerText?: string;
  showGrowthCrewBranding?: boolean;
  allowedEmailDomains?: string[];
}

export const portalConfigs = pgTable('portal_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .unique()
    .references(() => organizations.id),
  config: jsonb('config').$type<PortalConfig>().default({}),
  enabled: boolean('enabled').default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const portalShareLinks = pgTable('portal_share_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  token: text('token').notNull().unique(),
  label: text('label'),
  scopes: jsonb('scopes').$type<string[]>().default(['dashboard']),
  expiresAt: timestamp('expires_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const orgInvites = pgTable('org_invites', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  email: text('email').notNull(),
  role: text('role').default('member'),
  token: text('token').notNull().unique(),
  status: text('status').default('pending'),
  expiresAt: timestamp('expires_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const connectedAccounts = pgTable('connected_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  platform: text('platform'),
  externalAccountId: text('external_account_id'),
  accessTokenEnc: text('access_token_enc'),
  refreshTokenEnc: text('refresh_token_enc'),
  expiresAt: timestamp('expires_at', { mode: 'date' }),
  mode: text('mode').default('sandbox'),
  scopes: jsonb('scopes').$type<string[]>(),
  status: text('status').default('connected'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const websites = pgTable('websites', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  url: text('url').notNull(),
  lastCrawledAt: timestamp('last_crawled_at', { mode: 'date' }),
  crawl: jsonb('crawl'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const agents = pgTable('agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  type: text('type'),
  name: text('name'),
  config: jsonb('config').$type<Record<string, unknown>>(),
  status: text('status').default('active'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  agentId: uuid('agent_id').references(() => agents.id),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  conversationId: uuid('conversation_id'),
  input: text('input'),
  output: text('output'),
  toolCalls: jsonb('tool_calls').$type<unknown[]>(),
  status: text('status').default('running'),
  error: text('error'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { mode: 'date' }),
});

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  userId: uuid('user_id').references(() => users.id),
  title: text('title'),
  // orchestrator per-conversation state machine draft (CONTRACTS §8 step 4)
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id),
  role: text('role'),
  content: text('content'),
  audioUrl: text('audio_url'),
  transcript: text('transcript'),
  inputModality: text('input_modality').default('text'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const proposals = pgTable('proposals', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  conversationId: uuid('conversation_id').references(() => conversations.id),
  createdByAgentId: uuid('created_by_agent_id').references(() => agents.id),
  plan: jsonb('plan'),
  status: text('status').default('pending'),
  decidedBy: uuid('decided_by'),
  decidedVia: text('decided_via'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  decidedAt: timestamp('decided_at', { mode: 'date' }),
});

export const approvals = pgTable('approvals', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  proposalId: uuid('proposal_id').references(() => proposals.id),
  agentRunId: uuid('agent_run_id').references(() => agentRuns.id),
  action: jsonb('action'),
  status: text('status').default('pending'),
  decidedBy: uuid('decided_by'),
  decidedVia: text('decided_via'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  decidedAt: timestamp('decided_at', { mode: 'date' }),
});

export const campaignsMirror = pgTable('campaigns_mirror', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  connectedAccountId: uuid('connected_account_id').references(() => connectedAccounts.id),
  platform: text('platform'),
  externalId: text('external_id'),
  name: text('name'),
  status: text('status').default('active'),
  budgetDailyCents: integer('budget_daily_cents'),
  metrics: jsonb('metrics'),
  mode: text('mode').default('sandbox'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const budgets = pgTable('budgets', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  scope: text('scope'),
  capCents: integer('cap_cents'),
  period: text('period'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const leadForms = pgTable('lead_forms', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name'),
  fields: jsonb('fields').$type<unknown[]>(),
  createdByAgentId: uuid('created_by_agent_id').references(() => agents.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const leads = pgTable('leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  formId: uuid('form_id').references(() => leadForms.id),
  sourceCampaignId: uuid('source_campaign_id'),
  name: text('name'),
  email: text('email'),
  phone: text('phone'),
  customFields: jsonb('custom_fields').$type<Record<string, unknown>>(),
  score: integer('score').default(0),
  status: text('status').default('new'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const reports = pgTable('reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  type: text('type'),
  content: jsonb('content'),
  periodStart: timestamp('period_start', { mode: 'date' }),
  periodEnd: timestamp('period_end', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

/** Structured payload stored in `weekly_reports.content_json`. */
export interface WeeklyReportPayload {
  /** Rendered markdown brief (wins / losses / recommendations / priorities). */
  markdown: string;
  periodLabel: string;
  totals: { spendCents: number; impressions: number; clicks: number; conversions: number };
  byPlatform: Record<string, { spendCents: number; impressions: number; clicks: number; conversions: number }>;
  wins: string[];
  losses: string[];
  recommendations: string[];
  priorities: string[];
  alertCount: number;
  fatiguedCreatives: number;
  /** Whether the narrative came from the LLM or the deterministic fallback. */
  source: 'llm' | 'deterministic';
  generatedAt: string;
  /** True when the numbers are simulated (demo-data mode) and must be labeled as such. */
  demoData?: boolean;
}

// In-app weekly performance report (the #1 retention surface). Distinct from
// the legacy `reports` table used by the Phase-3 email cron: this one is
// generated on demand from the /reports page and rendered in-app as markdown.
export const weeklyReports = pgTable('weekly_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  weekStart: timestamp('week_start', { mode: 'date' }).notNull(),
  content: jsonb('content_json').$type<WeeklyReportPayload>().notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const reportShares = pgTable('report_shares', {
  id: uuid('id').defaultRandom().primaryKey(),
  shareId: text('share_id').notNull().unique(),
  reportId: uuid('report_id')
    .notNull()
    .references(() => weeklyReports.id),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  brandName: text('brand_name').notNull(),
  brandColor: text('brand_color'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { mode: 'date' }),
});

// Per-org cloud business memory (client-imported data). Distinct from the
// GLOBAL knowledge_documents best-practice library: these rows are scoped to an
// org and hold the client's own business data (uploaded files, pasted notes,
// URLs) that agents ground their advice on.
export const orgMemoryDocuments = pgTable('org_memory_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  title: text('title'),
  content: text('content'),
  // text|file|url|note — how the memory entered the system
  kind: text('kind').default('note'),
  // {filename, mimeType, sizeBytes, url} provenance for imports
  sourceMeta: jsonb('source_meta').$type<Record<string, unknown>>(),
  tags: jsonb('tags').$type<string[]>().default([]),
  // number[] | null — same pattern as knowledge_documents (§4): JSONB + JS cosine
  embedding: jsonb('embedding').$type<number[] | null>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const knowledgeDocuments = pgTable('knowledge_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  source: text('source'),
  title: text('title'),
  content: text('content'),
  // number[] | null — pgvector in compose, JSONB + JS cosine in embedded dev (§4)
  embedding: jsonb('embedding').$type<number[] | null>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// IMMUTABLE per CONTRACTS §4 — never update/delete; code enforces (no update helpers).
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id'),
  actorType: text('actor_type'),
  actorId: text('actor_id'),
  action: text('action'),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  payloadHash: text('payload_hash'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// First-party product analytics (Fox Biz Phase 2 retention metrics). Deliberately
// separate from the IMMUTABLE audit_logs: product telemetry is higher-frequency,
// includes client-emitted UI events, and must not pollute the user-visible audit
// trail. Keyed by (org, user, event, timestamp); see migration 0012.
export const productEvents = pgTable('product_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  userId: uuid('user_id'),
  event: text('event').notNull(),
  props: jsonb('props').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Expansion: social media, content studio, competitor intel, reputation.
// ---------------------------------------------------------------------------

export const socialPosts = pgTable('social_posts', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  platform: text('platform'), // facebook|instagram|x|linkedin|tiktok
  content: text('content'),
  mediaUrls: jsonb('media_urls').$type<string[]>(),
  status: text('status').default('draft'), // draft|scheduled|published|failed
  scheduledAt: timestamp('scheduled_at', { mode: 'date' }),
  publishedAt: timestamp('published_at', { mode: 'date' }),
  externalId: text('external_id'),
  // {impressions,likes,comments,shares} latest snapshot
  metrics: jsonb('metrics').$type<Record<string, number>>(),
  createdByAgentId: uuid('created_by_agent_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const contentPieces = pgTable('content_pieces', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  type: text('type'), // blog|ad_copy|social_caption
  title: text('title'),
  body: text('body'),
  status: text('status').default('draft'), // draft|approved|rejected
  // what the draft was grounded on: audit facts, knowledge doc titles, topic
  grounding: jsonb('grounding').$type<Record<string, unknown>>(),
  createdByAgentId: uuid('created_by_agent_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const competitors = pgTable('competitors', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  url: text('url').notNull(),
  name: text('name'),
  // latest analysis: {score, title, keywords[], missingMetaDescriptions, hasLeadForm, performanceScore, analyzedAt}
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>(),
  // prior snapshots for diffs: [{analyzedAt, score, keywords[]}]
  history: jsonb('history').$type<Record<string, unknown>[]>(),
  suggestions: jsonb('suggestions').$type<string[]>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// Competitor ad-intelligence: Google Ads Transparency Center region scans.
// One row per (competitor, region) scan; latest per region drives the matrix.
export const competitorAdScans = pgTable('competitor_ad_scans', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  competitorId: uuid('competitor_id').references(() => competitors.id),
  advertiserId: text('advertiser_id'), // Google Transparency AR id
  advertiserName: text('advertiser_name'),
  region: text('region'), // SA|AE|KW|MA|DZ|CA|US|...
  adCount: integer('ad_count').default(0),
  // [{headline,cta,lang,operator,pricingNote,angle}] captured creative text
  creatives: jsonb('creatives').$type<Record<string, unknown>[]>().default([]),
  scannedAt: timestamp('scanned_at', { mode: 'date' }).defaultNow().notNull(),
  raw: jsonb('raw').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// Video generation studio jobs. Mock-first; live renders gated behind approval.
export const videoJobs = pgTable('video_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  prompt: text('prompt').notNull(),
  style: text('style').default('ugc'), // ugc|product_demo|cinematic|slideshow
  aspectRatio: text('aspect_ratio').default('9:16'), // 9:16|1:1|16:9
  durationSec: integer('duration_sec').default(15),
  status: text('status').default('queued'), // queued|processing|completed|failed|needs_approval
  provider: text('provider').default('mock'), // mock|fal|replicate
  resultUrl: text('result_url'),
  thumbnailUrl: text('thumbnail_url'),
  costCents: integer('cost_cents').default(0),
  error: text('error'),
  approvalId: uuid('approval_id'),
  createdByAgentId: uuid('created_by_agent_id'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const reviews = pgTable('reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  source: text('source').default('google_business'),
  externalId: text('external_id'),
  author: text('author'),
  rating: integer('rating'),
  content: text('content'),
  sentiment: text('sentiment'), // positive|neutral|negative
  replyDraft: text('reply_draft'),
  replyStatus: text('reply_status').default('none'), // none|drafted|replied
  repliedAt: timestamp('replied_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertType =
  | 'spend_velocity'
  | 'zero_conversions'
  | 'ctr_drop'
  | 'cpc_spike'
  | 'budget_cap_near'
  | 'campaign_paused'
  | 'competitor_surge';

export const alerts = pgTable('alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  type: text('type').notNull(),
  severity: text('severity').notNull().default('info'),
  title: text('title').notNull(),
  message: text('message').notNull(),
  campaignId: uuid('campaign_id'),
  platform: text('platform'),
  metrics: jsonb('metrics').$type<Record<string, unknown>>(),
  suggestedAction: text('suggested_action'),
  acknowledged: boolean('acknowledged').default(false).notNull(),
  acknowledgedAt: timestamp('acknowledged_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

/** Per-creative performance snapshots for fatigue detection. */
export const creativePerformance = pgTable('creative_performance', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  campaignId: uuid('campaign_id').references(() => campaignsMirror.id),
  creativeId: text('creative_id').notNull(),
  platform: text('platform'),
  headline: text('headline'),
  imageUrl: text('image_url'),
  impressions: integer('impressions').default(0),
  clicks: integer('clicks').default(0),
  spendCents: integer('spend_cents').default(0),
  conversions: integer('conversions').default(0),
  frequency: real('frequency').default(0),
  ctr: real('ctr').default(0),
  snapshotAt: timestamp('snapshot_at', { mode: 'date' }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

/** Monthly LLM usage rollup per org for cost guardrails. */
export const llmUsage = pgTable(
  'llm_usage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    month: text('month').notNull(), // 'YYYY-MM'
    promptTokens: bigint('prompt_tokens', { mode: 'number' }).default(0).notNull(),
    completionTokens: bigint('completion_tokens', { mode: 'number' }).default(0).notNull(),
    totalTokens: bigint('total_tokens', { mode: 'number' }).default(0).notNull(),
    estimatedCostCents: integer('estimated_cost_cents').default(0).notNull(),
    requestCount: integer('request_count').default(0).notNull(),
    createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [unique('llm_usage_org_month_unique').on(t.orgId, t.month)],
);

// ---------------------------------------------------------------------------
// GEO — AI visibility: is the brand cited when AI engines answer tracked
// questions? Every stored datapoint traces to a REAL engine query (honesty
// rail): engines that were not actually queried are never shown as tracked.
// ---------------------------------------------------------------------------

/** Questions the org wants to track in AI engine answers. Cap: 60 active per org (enforced in the API/service layer). */
export const geoPrompts = pgTable('geo_prompts', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  text: text('text').notNull(),
  category: text('category'),
  position: integer('position').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

/** A citation extracted from an engine answer. */
export interface GeoCitation {
  title?: string;
  url: string;
}

/** A competitor mention counted in an engine answer. */
export interface GeoCompetitorMention {
  name: string;
  count: number;
}

/** Per-engine outcome of one run: only engines actually queried appear here. */
export interface GeoRunEngine {
  status: 'ok' | 'failed';
  error?: string;
}
export type GeoRunEngines = Partial<Record<'perplexity' | 'gemini', GeoRunEngine>>;

export const geoRuns = pgTable('geo_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  status: text('status').default('pending').notNull(), // pending|running|done|failed
  // 'trigger' is a SQL keyword — always quoted in DDL/queries.
  trigger: text('trigger').default('manual').notNull(), // scheduled|manual
  engines: jsonb('engines').$type<GeoRunEngines>().default({}).notNull(),
  error: text('error'),
  startedAt: timestamp('started_at', { mode: 'date' }),
  finishedAt: timestamp('finished_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const geoResults = pgTable('geo_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  runId: uuid('run_id')
    .notNull()
    .references(() => geoRuns.id),
  promptId: uuid('prompt_id')
    .notNull()
    .references(() => geoPrompts.id),
  engine: text('engine').notNull(), // perplexity|gemini
  brandMentioned: boolean('brand_mentioned').default(false).notNull(),
  // 1-based position of the first brand mention in the answer; null when absent.
  brandRank: integer('brand_rank'),
  answerExcerpt: text('answer_excerpt'),
  citations: jsonb('citations').$type<GeoCitation[]>().default([]).notNull(),
  competitorMentions: jsonb('competitor_mentions').$type<GeoCompetitorMention[]>().default([]).notNull(),
  sentiment: text('sentiment'), // positive|neutral|negative|null (null when brand absent)
  parseFailed: boolean('parse_failed').default(false).notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
