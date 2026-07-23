# VoxMarketer — CONTRACTS (integration source of truth)

Every package and app MUST conform to this file. If something is ambiguous, follow this
file over any other assumption. Do not rename anything defined here.

## 0. Repo layout & package names

```
voxmarketer/
  package.json               # private root, pnpm workspaces: apps/*, packages/*
  pnpm-workspace.yaml
  turbo.json                 # OPTIONAL; plain pnpm -r scripts are fine
  docker-compose.yml
  Dockerfile.web
  Dockerfile.worker
  .env.example               # every var in §3 documented
  .env                       # gitignored; `cp .env.example .env` works with zero edits
  scripts/dev-services.mjs   # embedded postgres + redis for dockerless dev
  scripts/wait-and-migrate.mjs
  e2e/                       # playwright (own package, @voxmarketer/e2e)
  apps/web/                  # @voxmarketer/web  — Next.js 14 App Router
  apps/worker/               # @voxmarketer/worker — Hono + BullMQ
  packages/db/               # @voxmarketer/db
  packages/llm/              # @voxmarketer/llm
  packages/agents/           # @voxmarketer/agents
  packages/integrations/     # @voxmarketer/integrations
```

TypeScript everywhere, ESM (`"type": "module"`) in packages, strict mode.
Packages are consumed as TS source (no build step): each package.json has
`"main": "src/index.ts"`, `"types": "src/index.ts"`, and consumers use
`transpilePackages` (Next) / `tsx` (worker, vitest). Do NOT add tsup/rollup builds.

## 1. Pinned versions (wave 1 sets these exactly)

- next `14.2.32`, react `18.3.1`, typescript `5.6.x`
- `next-auth@5.0.0-beta.25` + `@auth/drizzle-adapter@1.7.4`
- `@trpc/server@11.4.3`, `@trpc/client@11.4.3`, `@trpc/react-query@11.4.3`, `@tanstack/react-query@5.59.x`
- `drizzle-orm@0.36.x`, `drizzle-kit@0.28.x`, `postgres@3.4.x` (postgres.js driver)
- `zod@3.23.x`, `bullmq@5.34.x`, `ioredis@5.4.x`, `hono@4.6.x`
- `bcryptjs@2.4.3` (NOT native bcrypt), `cheerio@1.0.x`, `recharts@2.15.x`
- `vitest@2.1.x`, `@playwright/test@1.48.x`, `tsx@4.19.x`, `superjson@2.2.x`
- shadcn/ui components copied into `apps/web/components/ui` (radix + tailwindcss-animate); tailwindcss `3.4.x`
- dev-services: `embedded-postgres@18.x` (package name `embedded-postgres`), `redis-memory-server@9.x` (pkg `redis-memory-server`)

## 2. Module boundaries

- `packages/db` — Drizzle schema, migrations, `db` client, seed. NO business logic.
- `packages/llm` — `getLLM(): LLMProvider`; provider-agnostic chat + function-calling types.
- `packages/integrations` — pure adapters + utils. No imports from db/agents except types.
  Exports: `crawlWebsite`, `runPageSpeed`, `runSeoAudit`, `getAdAdapter(platform, mode)`,
  `encrypt/decrypt`, `withRetry`, `knowledge seed docs`, `ga4/gsc stub adapters`.
- `packages/agents` — imports db, llm, integrations. Orchestrator, specialists,
  Budget Guardian, tool registry, approval-gate enforcement, audit helper.
  NO http/next imports. All functions take `ctx: AgentContext`.
- `apps/web` — imports everything. tRPC routers are thin: auth + zod validate → call
  `@voxmarketer/agents` services → return. Business logic NEVER lives in routers.
- `apps/worker` — BullMQ consumers calling `@voxmarketer/agents` services.

## 3. Environment variables (`.env.example` documents ALL of these)

| Var | Default (zero-config `.env`) | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5433/voxmarketer` | pg (dev-services uses port 5433; compose db 5432 internal) |
| `REDIS_URL` | `redis://localhost:6380` | bullmq (dev-services 6380; compose 6379 internal) |
| `AUTH_SECRET` | `dev-secret-change-me-32-bytes-minimum!!` | Auth.js |
| `AUTH_URL` | `http://localhost:3000` | Auth.js |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | empty | optional OAuth login; also the OAuth client for google_ads / ga4 / gsc integration connects |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | empty | Google Ads API developer token — required to connect google_ads live |
| `META_APP_ID` / `META_APP_SECRET` | empty | Meta app credentials — required to connect meta live |
| `TIKTOK_APP_ID` / `TIKTOK_APP_SECRET` | empty | TikTok Marketing API app — required to connect tiktok live |
| `CRON_SECRET` | empty | Bearer secret for `/api/cron/*` (weekly report); empty = cron disabled |
| `ENCRYPTION_KEY` | `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f` | 64 hex chars, AES-256-GCM for tokens |
| `LLM_PROVIDER` | `mock` | `mock`\|`openai`\|`anthropic` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | empty | live LLM |
| `LLM_MODEL` | empty (provider default) | model override |
| `STT_PROVIDER` | `mock` | `mock`\|`browser`\|`whisper`\|`deepgram` (browser handled client-side; mock for tests/dev) |
| `DEEPGRAM_API_KEY` | empty | deepgram STT |
| `TTS_PROVIDER` | `mock` | `mock`\|`browser`\|`openai`\|`elevenlabs` |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | empty / `21m00Tcm4TlvDq8ikWAM` | elevenlabs |
| `SEO_AUDIT_MODE` | `live` | `live` falls back to mock on failure; `mock` never hits network |
| `PAGESPEED_API_KEY` | empty | optional PSI key |
| `RESEND_API_KEY` / `EMAIL_FROM` | empty / `VoxMarketer <reports@voxmarketer.dev>` | weekly email (phase 3 stub) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | absolute links, hosted lead forms |
| `NEXT_PUBLIC_STT_PROVIDER` | `mock` | client picks browser vs mock capture |
| `NEXT_PUBLIC_TTS_PROVIDER` | `mock` | client picks speechSynthesis vs server audio |
| `DEMO_SEED` | `true` | seed demo org on migrate |

Rule: with the defaults above (`cp .env.example .env`, `pnpm dev`), EVERYTHING works
with no external network calls. Anything requiring a key degrades gracefully.

## 4. Database schema (`packages/db/src/schema/*.ts`, drizzle, postgres)

Naming: table names snake_case plural exactly as below; TS exports camelCase.
All ids: `uuid` pk `defaultRandom()`. All tables have `createdAt timestamp defaultNow()`
(`created_at`). Enums are `text` columns with zod unions in code (no pg enums — simpler migrations).

Auth.js v5 tables (via adapter expectations): `users`, `accounts`, `sessions`,
`verificationTokens` exactly per `@auth/drizzle-adapter` pg schema. `users` extended
with `passwordHash text` (credentials provider; nullable).

App tables:
- `organizations`: id, `name text not null`, `websiteUrl text`, `goals jsonb` (string[]: `visibility|leads|sales`),
  `monthlyBudgetCeilingCents integer default 50000`, `onboardingStep text default 'welcome'`
  (`welcome|business|goals|budget|connect|done`), createdAt.
- `orgMembers`: `org_members`: id, `orgId` fk→organizations, `userId` fk→users,
  `role text default 'owner'` (`owner|admin|member`), createdAt. Unique (orgId,userId).
- `connectedAccounts`: `connected_accounts`: id, `orgId`, `platform text`
  (`google_ads|meta|tiktok|ga4|gsc`), `externalAccountId text`, `accessTokenEnc text`,
  `refreshTokenEnc text`, `expiresAt timestamp`, `mode text default 'sandbox'` (`sandbox|live`),
  `scopes jsonb`, `status text default 'connected'` (`connected|expired|revoked`), createdAt, `updatedAt`.
- `websites`: id, `orgId`, `url text not null`, `lastCrawledAt timestamp`,
  `crawl jsonb` (CrawlResult, see §7), createdAt.
- `agents`: id, `orgId`, `type text` (`orchestrator|seo|google_ads|meta_ads|tiktok_ads|lead_gen|analytics|budget_guardian`),
  `name text`, `config jsonb` (per-type, e.g. targetKeywords, geography), `status text default 'active'`
  (`active|paused|archived`), createdAt.
- `agentRuns`: `agent_runs`: id, `agentId` fk, `orgId`, `conversationId` nullable,
  `input text`, `output text`, `toolCalls jsonb` (ToolCallRecord[]: `{name,args,result?,status,gated,approvalId?}`),
  `status text default 'running'` (`running|completed|failed|awaiting_approval`), `error text`,
  createdAt, `completedAt`.
- `conversations`: id, `orgId`, `userId`, `title text`, createdAt, `updatedAt`.
- `messages`: id, `conversationId` fk, `role text` (`user|assistant|system`), `content text`,
  `audioUrl text`, `transcript text`, `inputModality text default 'text'` (`voice|text`),
  `metadata jsonb` (e.g. `{proposalId}`, `{ttsPlayed:false}`), createdAt.
- `proposals`: id, `orgId`, `conversationId`, `createdByAgentId`, `plan jsonb` (Plan, §8),
  `status text default 'pending'` (`pending|approved|rejected|changes_requested`),
  `decidedBy uuid`, `decidedVia text` (`voice|click`), createdAt, `decidedAt`.
- `approvals`: id, `orgId`, `proposalId` nullable fk, `agentRunId` nullable fk,
  `action jsonb` (`{type: string, toolName: string, args: any, summary: string}`),
  `status text default 'pending'` (`pending|approved|rejected`), `decidedBy uuid`,
  `decidedVia text`, createdAt, `decidedAt`.
- `campaignsMirror`: `campaigns_mirror`: id, `orgId`, `connectedAccountId` nullable,
  `platform text`, `externalId text`, `name text`, `status text default 'active'`
  (`draft|active|paused|removed`), `budgetDailyCents integer`, `metrics jsonb`
  (`{impressions,clicks,spendCents,conversions,date}` snapshots, latest snapshot at top level
  plus `history` array), `mode text default 'sandbox'`, createdAt, `updatedAt`.
- `budgets`: id, `orgId`, `scope text` (`global` or `platform:google_ads` etc),
  `capCents integer`, `period text` (`daily|monthly`), createdAt. Seed: global monthly = org ceiling.
- `leadForms`: `lead_forms`: id, `orgId`, `name text`, `fields jsonb`
  (`[{key,label,type:text|email|phone|textarea,required}]`), `createdByAgentId` nullable, createdAt.
- `leads`: id, `orgId`, `formId` nullable fk, `sourceCampaignId` nullable,
  `name text`, `email text`, `phone text`, `customFields jsonb`, `score integer default 0`,
  `status text default 'new'` (`new|contacted|won|lost`), `notes text`, createdAt, `updatedAt`.
- `reports`: id, `orgId`, `type text` (`weekly|adhoc`), `content jsonb`
  (`{summary: string, highlights: string[]}`), `periodStart timestamp`, `periodEnd timestamp`, createdAt.
- `knowledgeDocuments`: `knowledge_documents`: id, `source text`
  (`google_ads_help|meta_help|tiktok_help|seo_guide|policy`), `title text`, `content text`,
  `embedding jsonb` (number[] | null — pgvector used in compose, JSONB + JS cosine in embedded dev),
  `metadata jsonb`, createdAt.
- `auditLogs`: `audit_logs`: id, `orgId` nullable, `actorType text` (`user|agent|system`),
  `actorId text`, `action text`, `entityType text`, `entityId text`,
  `payloadHash text` (sha256 of canonical JSON), `metadata jsonb`, createdAt.
  IMMUTABLE: never update/delete; enforced in code (no exported update helpers).

## 5. tRPC surface (`apps/web/server/trpc/router/*`, `appRouter`)

All procedures protected except `auth.register`, `auth.me`(nullable), public lead capture
(REST, not tRPC). Context: `{ db, session, orgId }`; `orgId` resolved from user's first
org membership. `superjson` transformer. Every input zod-validated. Write mutations accept
optional `idempotencyKey: string`; duplicate keys return the original result.

- `auth.register({name,email,password})` → creates user + org shell, returns user.
- `auth.me()` → `{user, org, membership}`.
- `onboarding.get()` → org row. `onboarding.update(partial org fields)` → updated org.
  `onboarding.complete()` → sets `onboardingStep='done'`, creates budgets row from ceiling,
  triggers initial crawl if websiteUrl set (await; crawler must be fast/failable).
- `conversations.list()` → conversations w/ last message. `conversations.get({id})` → with messages.
  `conversations.create({title?})` → row.
  `conversations.sendMessage({conversationId?, content, modality: 'voice'|'text'})` →
  **core entry**: persists user message, runs orchestrator (`@voxmarketer/agents`
  `handleUserMessage`), persists assistant reply, returns `{conversationId, userMessage, assistantMessage, proposal?}`.
  Voice "approve"/"cancel" flows through THIS procedure (content is the transcript).
- `proposals.list({status?})`, `proposals.get({id})`,
  `proposals.approve({id, via: 'voice'|'click'})` → executes plan (see §8), returns `{proposal, agentRuns}`.
  `proposals.reject({id, via})`. `proposals.requestChanges({id, comment, via})` →
  orchestrator regenerates plan, NEW proposal version (old → `changes_requested`).
- `approvals.list({status?})`, `approvals.decide({id, approve, via})` — for standalone gates
  (e.g. budget change >20% outside a proposal).
- `agents.list()` → with latest run. `agents.get({id})` → detail + runs + config.
  `agents.setStatus({id, status})`. (Agents are created by the orchestrator only, not by users.)
- `campaigns.list({platform?})`, `campaigns.get({id})`,
  `campaigns.pause({id})` / `campaigns.resume({id})` — gated writes: go through approval
  flow if live mode; in sandbox execute immediately but still audit-logged.
- `dashboard.overview({from, to})` → `{totals: {spendCents,impressions,clicks,ctr,cpcCents,conversions,cplCents,roas}, byPlatform: {...}, series: [{date, spendCents, clicks, conversions}]}`.
  `dashboard.activityFeed({limit?})` → human-readable items from agent_runs + audit_logs.
  `dashboard.seoTracker()` → `{score, history, rankings: [{keyword, position}], cwv: {...}}`.
- `leads.list({status?, q?})`, `leads.update({id, status?, notes?, score?})`,
  `leads.exportCsv()` → `{csv}` (client downloads).
  `leads.forms.list/create/update`, `leads.forms.embedSnippet({id})` → `{snippet, hostedUrl}`.
- `knowledge.list({source?})`, `knowledge.search({q})` → top-5 by cosine similarity (JS impl).
- `audit.list({limit?, cursor?})` → audit rows desc.
- `settings.integrations()` → connected_accounts (tokens redacted) + adapter health +
  per-platform `oauthConfigured` / `connectUrl` (Phase 2 OAuth availability).
  `settings.setMode({platform, mode})` → sandbox→live requires `confirmText: 'LIVE'` +
  OAuth-connected account; else 400. Writes audit log.
  OAuth connect (Phase 2): REST `GET /api/integrations/[platform]/connect` → provider
  redirect (HMAC-signed state, 10-min TTL); `GET /api/integrations/[platform]/callback`
  → `services.oauth.completeOAuthFlow` stores tokens encrypted + audit `integration.connected`;
  the account stays in sandbox until the explicit LIVE-confirm switch.
  `settings.budgets.list/update` — update >20% of current cap → creates `approvals` row
  (pending) instead of applying; approved via approvals.decide.
  `settings.members.list/invite(stub)/remove`. `settings.notifications.update` (jsonb on org config — keep in orgs.goals? NO: add `orgs.settings jsonb default '{}'`).
- `admin.users()` (role owner of FIRST seeded org only if `user.email` endsWith `@voxmarketer.dev`
  OR org role owner — keep simple: any user can view admin page for own org list; platform-admin
  = `ADMIN_EMAILS` env csv match), `admin.health()` → `{db: ok, redis: ok, llm: provider, adapters: [...]}`.

Routers must be thin — all logic in `packages/agents/src/services/*.ts` (auth service may
live in web). Service functions take explicit args, return plain objects.

## 6. REST API routes (apps/web/app/api)

- `api/auth/[...nextauth]/route.ts` — Auth.js handlers.
- `api/trpc/[trpc]/route.ts` — tRPC fetch handler.
- `api/voice/stt/route.ts` — POST multipart audio. Provider switch:
  `whisper` → OpenAI audio transcriptions; `deepgram` → deepgram REST; `mock`/unset →
  `{transcript: ''}` 501-ish `{error:'stt_not_configured', provider}` with 200 + hint
  (client falls back to browser STT or text). Response `{transcript}`.
- `api/voice/tts/route.ts` — POST `{text}` → audio stream. `openai` → speech api (mp3);
  `elevenlabs` → stream; else 200 `{error:'tts_not_configured'}` (client uses speechSynthesis).
- `api/leads/capture/[formId]/route.ts` — PUBLIC POST (no auth): zod-validate against
  form fields, insert lead (score via LeadGenAgent.scoreLead), CORS `*`, audit log.
- `api/webhooks/leads/[platform]/route.ts` — POST receiver for platform lead ads (mock-verified),
  inserts lead with `sourceCampaignId` when resolvable.
- `api/cron/weekly-report/route.ts` — bearer `CRON_SECRET`, phase-3 stub returning 501.

## 7. Integrations contracts (`packages/integrations/src`)

```ts
// crawler.ts
export interface CrawlResult {
  url: string; finalUrl: string; fetchedAt: string; // ISO
  title: string | null; metaDescription: string | null;
  headings: { h1: string[]; h2: string[] };
  pages: { url: string; title: string | null; metaDescription: string | null }[]; // up to 10 internal pages
  hasLeadForm: boolean;            // <form> with email-ish input OR contact CTA
  hasRobotsTxt: boolean; hasSitemap: boolean;
  missingMetaDescriptions: number; // pages missing meta desc
  technologies: string[];          // naive detection (wordpress, shopify, react...)
  error?: string;                  // set when crawl failed (caller falls back to mock)
}
export async function crawlWebsite(url: string, opts?: {mode?: 'live'|'mock'}): Promise<CrawlResult>

// pagespeed.ts
export interface PageSpeedResult {
  url: string; strategy: 'mobile'|'desktop';
  performanceScore: number;       // 0-100
  cwv: { lcpMs: number|null; cls: number|null; inpMs: number|null; fcpMs: number|null };
  isMock: boolean; error?: string;
}
export async function runPageSpeed(url: string, strategy?: 'mobile'|'desktop', opts?: {mode?: 'live'|'mock'}): Promise<PageSpeedResult>

// seo-audit.ts — combines crawl + PSI into deterministic score
export interface SeoAudit {
  url: string; score: number;              // 0-100 deterministic from checks below
  checks: { id: string; label: string; status: 'pass'|'warn'|'fail'; detail: string }[];
  pagespeed: PageSpeedResult; crawl: CrawlResult;
  keywordSuggestions: { keyword: string; intent: string }[]; // derived from title/headings (min 10)
  isMock: boolean;
}
export async function runSeoAudit(url: string, opts?: {mode?: 'live'|'mock'}): Promise<SeoAudit>
```
Mock mode: deterministic pseudo-random derived from url hash (same url → same numbers).
For `example.com` mock MUST produce: performanceScore 58 (mobile), missingMetaDescriptions 3,
hasLeadForm false — the §12 dialog depends on these exact values.

```ts
// ads/types.ts + mock adapters (stateful, persisted via injected store functions)
export type AdPlatform = 'google_ads'|'meta'|'tiktok';
export interface AdCampaignInput { name: string; objective: string; dailyBudgetCents: number;
  targeting: { geography?: string; keywords?: string[]; audience?: string }; adCopy?: { headline: string; body: string };
  landingUrl?: string /* required by live adapters to attach an ad; campaign shell only without it */ }
export interface AdCampaign { externalId: string; platform: AdPlatform; name: string;
  status: 'draft'|'active'|'paused'|'removed'; budgetDailyCents: number; metrics: CampaignMetrics }
export interface CampaignMetrics { impressions: number; clicks: number; spendCents: number; conversions: number }
export interface AdAdapter {
  platform: AdPlatform; mode: 'sandbox'|'live';
  listCampaigns(): Promise<AdCampaign[]>;
  createCampaign(input: AdCampaignInput): Promise<AdCampaign>;   // SPEND-GATED at tool layer
  pauseCampaign(externalId: string): Promise<void>;
  resumeCampaign(externalId: string): Promise<void>;
  updateBudget(externalId: string, dailyBudgetCents: number): Promise<void>; // SPEND-GATED
  getMetrics(externalId: string): Promise<CampaignMetrics>;
  getKeywordIdeas?(seed: string, geography?: string): Promise<{keyword: string; avgMonthlySearches: number; cpcCents: number}[]>;
  checkAdPolicy?(adCopy: {headline: string; body: string}): Promise<{ok: boolean; violations: string[]}>;
}
export function getAdAdapter(platform: AdPlatform, mode: 'sandbox'|'live', deps: AdapterDeps): AdAdapter
// AdapterDeps = { store: {load(orgId,platform), save(orgId,platform,state)} } so mock state
// persists into campaigns_mirror via the agent layer. Mock metrics evolve deterministically
// (+2..7% impressions/hour seeded by externalId) so dashboards "move" between polls.
// live mode (Phase 2+3): real Google Ads / Meta / TikTok REST adapters driven by
// LiveAdapterDeps (getAccessToken + externalAccountId + injectable fetch; TikTok sends
// the token via `Access-Token` header, others Bearer); tokens come from
// connected_accounts, AES-256-GCM decrypted, refreshed 60s before expiry and persisted
// back encrypted. Without OAuth deps the live adapter throws
// `LiveAdapterNotConnected` — agent layer converts to user-visible status.
// OAuth helpers (buildAuthorizationUrl, exchangeCodeForTokens, refreshAccessToken,
// fetchExternalAccountId, signOAuthState/verifyOAuthState) live in oauth.ts — pure,
// fetch-injected. GA4/GSC ship live adapters too (createGa4LiveAdapter /
// createGscLiveAdapter); agents resolve live-vs-mock per org with mock fallback.
```

```ts
// crypto.ts — AES-256-GCM
export function encrypt(plaintext: string, keyHex?: string): string   // "iv.tag.ciphertext" base64
export function decrypt(payload: string, keyHex?: string): string
// retry.ts
export async function withRetry<T>(fn: () => Promise<T>, opts?: {retries?: number; baseMs?: number}): Promise<T>
// ga4.ts / gsc.ts — stubs: same shape as real, return deterministic mock series.
// knowledge-docs.ts — export const KNOWLEDGE_SEED_DOCS: {source,title,content}[] (~12 distilled docs)
```

## 8. Agents contracts (`packages/agents/src`)

```ts
export interface AgentContext {
  db: Db; orgId: string; userId?: string; conversationId?: string;
  llm: LLMProvider; audit: AuditLogger; now?: Date; // now injectable for tests
}
```

### Tool layer (`tools/`)
Each tool: `{ name, description, schema: ZodType, gated: boolean, execute(ctx, args) }`.
Registry: `getToolsForAgent(type: AgentType): ToolDef[]`, `executeTool(ctx, toolName, args)`.
**GATED tools** (spend/publish/delete/budget>20%): `ads.create_campaign`, `ads.update_budget`,
`ads.resume_campaign`(spend), `campaigns.delete`, `budgets.raise_cap`.
Gate rule (HARD, unit-tested): `executeTool` on a gated tool REQUIRES
`args.__approvalId` pointing to an `approvals` row with `status='approved'` for the same
`toolName`+payload hash. Otherwise it throws `ApprovalRequired` (orchestrator catches →
creates pending approval + tells the user). NO other code path may call adapter write
methods (adapters are only exported through the tool layer for writes).
Non-gated examples: `seo.run_audit`, `seo.crawl`, `ads.list_campaigns`, `ads.get_metrics`,
`ads.get_keyword_ideas`, `ads.check_ad_policy`, `leads.create_form`, `leads.score`,
`analytics.get_overview`, `memory.remember`/`memory.recall`.

### Budget Guardian (`guardian.ts`)
```ts
export interface GuardianVerdict { ok: boolean; reason?: string; autoPaused?: string[] }
export async function checkSpend(ctx, platform: string, additionalDailyCents: number): Promise<GuardianVerdict>
export async function tick(ctx): Promise<GuardianVerdict>  // called by worker poll
```
Enforces: global + per-platform daily/monthly caps from `budgets` (default = org ceiling);
spend velocity anomaly (projected month-end > cap → auto-pause platform campaigns, verdict
`autoPaused`); zero-conversion burn (spendCents > 3× target CPL with 0 conversions → pause).
ALL enforcement actions audit-logged. `checkSpend` is invoked inside every gated ads tool.

### Orchestrator (`orchestrator.ts`)
```ts
export interface OrchestratorResult {
  assistantMessage: string; proposal?: Plan; needsClarification?: Question[];
  agentRuns?: string[]; // ids
}
export async function handleUserMessage(ctx: AgentContext, message: string, modality: 'voice'|'text'): Promise<OrchestratorResult>
```
Flow (both mock + LLM providers MUST implement):
1. Persist nothing (caller persists). Load conversation history + org memory.
2. If pending proposal exists and message matches `/^\s*(approve|yes approve|approved)\b/i` →
   return `{proposal: existing, assistantMessage: confirmation}` and CALLER routes to
   `proposals.approve(via: modality)`. `/^\s*(cancel|reject)\b/i` → reject. This deterministic
   check runs BEFORE any LLM call.
3. Intent detection (`intents.ts`, exported + unit-tested):
   keyword sets → `seo` (seo, search rank, organic, top visible, google ranking),
   `visibility` (visible, visibility, traffic, more visitors), `leads` (lead, leads,
   get customers, contact form, sign ups), `ads_google`, `ads_meta`, `ads_tiktok`, `analytics`
   (how did we do, report, performance), `budget_change`, `pause <platform>`.
4. If intents ⊆ {seo, visibility, leads, ads_*} and no prior plan in conversation →
   run `seo.run_audit` on org website (real), build **Plan** (below), ask max 2–4
   clarifying questions UNLESS answers already present (geography from message, budget
   from org ceiling). For the §12 reference input the mock orchestrator returns the
   audit summary FIRST with questions, and only emits the proposal after the user's
   next reply (clarification round-trip). Mock implements a tiny per-conversation
   state machine keyed on message count + stored draft in `conversations.metadata`.
5. Commands on existing state ("pause tiktok", "move budget to google") →
   builds a single-action proposal or executes non-gated immediately with confirmation.

```ts
export interface Plan {
  title: string; summary: string;
  businessGoal: 'visibility'|'leads'|'sales';
  geography?: string; monthlyBudgetCents: number;
  budgetSplit: { platform: 'google_ads'|'meta'|'tiktok'|'reserve'; cents: number }[];
  agents: { type: AgentType; name: string; rationale: string; tasks: string[] }[];
  actions: { toolName: string; args: any; summary: string; gated: true }[]; // each → approvals row
  timeline: string; // e.g. "First ads live within 24h; SEO fixes in week 1"
  expectedOutcomes: string[];
}
```

### Plan execution (`execute-plan.ts`)
`approveProposal(ctx, proposalId, via)`:
1. proposal must be `pending` → set approved (decidedBy/Via/At), audit.
2. Create `agents` rows (idempotent by orgId+type), audit.
3. For each `plan.actions`: insert `approvals` row ALREADY approved (decidedBy=proposal.decidedBy,
   decidedVia=via, payloadHash), then `executeTool` with `__approvalId` → adapter write →
   upsert `campaigns_mirror`. Failures → agent_run failed, user-visible error, never partial-silent.
4. Record `agentRuns` (toolCalls jsonb), audit each tool call.
5. Return `{proposal, agentRuns}`.

### Memory (`memory.ts`)
Org memory = `agents.config` + `organizations.settings.memory jsonb` (facts like geography,
approved budgets, preferences). `remember(ctx, key, value)`, `recall(ctx, key?)`.
Agents MUST recall before asking duplicate clarifying questions.

### Audit (`audit.ts`)
```ts
export interface AuditLogger { log(entry: {actorType, actorId, action, entityType, entityId, payload?, metadata?}): Promise<void> }
export function createAuditLogger(db: Db, orgId?: string): AuditLogger
export function payloadHash(payload: unknown): string  // sha256 canonical-json
```

## 9. §12 reference dialog — REQUIRED exact behavior (mock LLM)

Given org website `https://example.com` (or any url in mock mode with the §7 example.com
fixture), ceiling $500:

1. User: *"I need an SEO specialist. I need my website to be top visible. I need to get leads."*
   → intents [seo, visibility, leads]. Orchestrator runs crawl+PSI (mock fixture) then replies
   containing ALL of: mobile speed `58/100`, `3 missing meta descriptions`, `no lead form`,
   offer of 3 agents (SEO / Google Ads / Lead Gen), `$500/mo` with `60%` Google / `40%` reserve,
   and 2 questions: geography (city/area) + budget OK. (Playwright asserts these substrings.)
2. User: *"Chicago area, yes $500 is fine."* → orchestrator emits proposal (Plan:
   google_ads $300/mo, reserve $200, geography Chicago, actions=[ads.create_campaign]).
   Assistant message includes voice summary:
   *"Launch a $300/month Google Search campaign targeting Chicago — say approve or cancel."*
   Playwright asserts proposal card renders + this string present.
3. User: *"approve"* → proposals.approve(via voice) → agents created (seo, google_ads,
   lead_gen), approvals row(s) approved, mock campaign in `campaigns_mirror`
   (status active, platform google_ads, budget $300/mo ⇒ daily $10), audit entries exist.
   Assistant confirms what's live. Dashboard non-empty afterwards.

LLM providers (openai/anthropic) get a system prompt encoding the same flow; mock is the
deterministic reference implementation and the default.

## 10. Frontend routes (apps/web/app)

- `/` landing (marketing, CTA → /register).
- `/login`, `/register` (credentials; Google button only if oauth env present).
- `/onboarding` — wizard steps: business (name+website) → goals → budget → connect (skippable)
  → done → redirect /console.
- `/console` — **home**. Voice Console (see below) + conversation sidebar.
- `/proposals`, `/proposals/[id]` — review cards (Approve / Edit / Reject; voice hint).
- `/agents`, `/agents/[id]` — detail: config, tools list, memory, run history.
- `/campaigns` — grouped by platform, status, budget, metrics; pause/resume buttons.
- `/dashboard` — date-range picker, KPI cards (spend, impr, clicks, CTR, CPC, conv, CPL, ROAS),
  Recharts trend, by-platform breakdown, activity feed, SEO tracker widget.
- `/leads` — table (source, score, status dropdown, notes), CSV export; `/leads/forms`
  builder + embed snippet + hosted link.
- `/knowledge` — doc list + search.
- `/audit` — immutable log table.
- `/settings` — integrations (sandbox/live switch w/ LIVE confirm), budgets, team,
  notifications, billing placeholder tab.
- `/admin` — users table + health panel (guarded).
- `/f/[formId]` — public hosted lead form.

Voice Console (`/console`) requirements: big mic button (push-to-talk + hands-free toggle),
waveform animation (WebAudio analyser on MediaRecorder stream), live partial transcript
(Web Speech API when `NEXT_PUBLIC_STT_PROVIDER=browser`; mock mode = hidden test hook
`window.__voxSTT.inject(text)` used by Playwright + a visible "type instead" box),
chat panel with full text parity, TTS playback with mute toggle + barge-in (new user
speech stops playback), voice-approval summary read aloud when proposal pending,
mic-denied → text mode + hint banner. All state via tRPC `conversations.sendMessage`.

## 11. Worker (apps/worker)

Hono `/health` + BullMQ queues on REDIS_URL:
- `metrics-poll` (repeatable 5 min): for each sandbox campaign → adapter.getMetrics →
  update campaigns_mirror → `guardian.tick` → audit on enforcement.
- `optimize` (repeatable 1 h, Phase 3): per org → `services.optimize.generateOptimizationApprovals`
  — deterministic rules (trim burner / scale winner / shift budget) create PENDING
  approvals only; nothing auto-executes, idempotent via payloadHash dedupe.
- `email` queue (weekly, Mon 09:00, Phase 3): `services.reports.runWeeklyReportsForAllOrgs`
  — builds the `reports` row per org and emails owners via Resend when RESEND_API_KEY
  is set (log-only otherwise). Same runner backs `POST /api/cron/weekly-report`.
Worker must not be required for web to function; web has an inline "simulate" fallback
button on dashboard (dev only) that calls the same service directly.

## 12. Testing contracts

- Vitest projects: `packages/agents`, `packages/integrations`, `packages/llm`, `apps/web` (services).
  Coverage targets: orchestrator intents + §12 state machine, guardian (overspend block,
  velocity pause, zero-conversion pause), approval gate (gated tool without approval throws;
  with approved row succeeds), crypto round-trip, mock adapter determinism, audit hash,
  budget-change>20% approval creation, CSV export, knowledge cosine search,
  OAuth state/exchange/discovery, live adapter request mapping (Google/Meta/TikTok/GA4/GSC),
  token refresh persistence, optimization approval rules, weekly report + email,
  LLM provider request mapping (OpenAI/Anthropic).
  DB tests use embedded postgres (helpers in `packages/db/src/test-utils.ts`) or a shared
  dev-services instance via env `DATABASE_URL`.
- Playwright (`e2e/`): starts dev-services + web (global setup), seeds fresh db per run.
  Specs: `auth-onboarding.spec.ts` (register → wizard → console),
  `voice-dialog.spec.ts` (THE §12 flow with `window.__voxSTT.inject` + text fallback
  assertions: audit substrings → clarify → proposal card → inject "approve" → launched
  state → dashboard populated), `guardian.spec.ts` optional UI-level.
  All external network mocked; no real mic (Playwright fake device flags allowed but not required).

## 13. Conventions

- Money: integer cents everywhere (`*Cents` suffix).
- Dates: ISO strings over the wire (superjson handles Date).
- Errors: tRPC `TRPCError` with user-safe message; adapters throw typed errors
  (`AdapterError`, `LiveAdapterNotConnected`, `ApprovalRequired`, `BudgetCapExceeded`)
  defined in `packages/agents/src/errors.ts` (re-exported by integrations where needed —
  NO, keep errors in `packages/integrations/src/errors.ts` to avoid cycles; agents re-export).
- Every agent action + API write → auditLogs row (actor, action, payloadHash).
- UI tone: simple, reassuring, jargon-free. No marketing-speak in code comments.
- Commit hygiene: not applicable (no git mutations unless asked).
