# Sayso

**Talk to your marketing team.** Sayso is a voice-first SaaS where small-business
owners direct a team of AI marketing specialists by speaking: *"I need an SEO specialist.
I need my website to be top visible. I need to get leads."* The orchestrator understands
the intent, audits your site, proposes a concrete plan with budgets — and only after your
explicit approval do the agents launch anything. Everything runs in a safe **sandbox** by
default; nothing ever spends money without a recorded approval.

## Quick start (≤5 commands, fully offline)

```bash
pnpm install
cp .env.example .env        # zero-config defaults; mock providers, no keys needed
pnpm dev:services           # terminal 1: embedded Postgres (5433) + Redis (6380)
pnpm db:migrate && pnpm db:seed
pnpm dev                    # terminal 2: web on :3000 + worker
```

Then open <http://localhost:3000>, register, finish the 4-step wizard, and speak (or type)
the reference brief above. Prefer Docker? `docker compose up` runs db + redis + migrate +
web + worker in one shot.

## Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│ apps/web — Next.js 14 App Router                                           │
│  Voice Console (MediaRecorder / Web Speech / TTS) · Dashboard · CRM · …    │
│  tRPC routers (thin: auth + zod)   REST: /api/voice/*, /api/leads/capture  │
└──────────────┬─────────────────────────────────────────────────────────────┘
               │ service calls (typed)
┌──────────────▼─────────────────────────────────────────────────────────────┐
│ packages/agents — the brain                                                │
│  Orchestrator (intents → clarify → Plan) · Specialists (SEO, Google Ads,   │
│  Meta, TikTok, Lead Gen, Analytics) · Budget Guardian · tool registry with │
│  HARD approval gates · audit logger · org memory                           │
└───────┬──────────────────────┬─────────────────────────────────────────────┘
        │                      │
┌───────▼───────────┐  ┌───────▼────────────────────────────────────────────┐
│ packages/llm      │  │ packages/integrations — pure adapters              │
│ mock | openai |   │  │ crawler · PageSpeed · SEO audit · ad adapters      │
│ anthropic         │  │ (MOCK sandbox ↔ LIVE) · GA4/GSC stubs · AES-256    │
│ (function-calling)│  │ crypto · retry · knowledge seed docs · embeddings  │
└───────────────────┘  └───────┬────────────────────────────────────────────┘
                               │
        ┌──────────────────────▼──────────────────┐   ┌─────────────────────┐
        │ packages/db — Drizzle + Postgres        │   │ apps/worker — Hono  │
        │ 20+ tables (CONTRACTS §4), migrations,  │   │ + BullMQ: metric    │
        │ seed, immutable audit_logs              │   │ polling → Guardian  │
        └─────────────────────────────────────────┘   └─────────────────────┘
```

The full integration contract (schemas, tool gate rules, the §12 reference dialog) lives
in [CONTRACTS.md](CONTRACTS.md) — it is the source of truth for every package.

### Beyond ads: the full marketing surface

- **Social media suite** (`/social`) — AI composer (topic → caption), content calendar +
  queue, mock publish adapters for Facebook/Instagram/X/LinkedIn/TikTok with deterministic
  engagement curves, and a **gated publish** step (`social.publish_post` refuses to run
  without a recorded approval). Voice: *"post about our summer discount on Instagram"*.
- **Content studio** (`/content`) — blog posts, ad copy, and captions drafted by the
  Content Specialist, grounded on your site audit keywords, with approve/reject workflow.
- **Competitor intelligence** (`/competitors`) — track rival sites, SEO snapshots vs your
  score, keyword overlap, score history, and counter-move suggestions.
- **Reputation management** (`/reviews`) — mock Google Business review sync, keyword+rating
  sentiment, tone-matched AI reply drafts, and gated public posting (`reviews.post_reply`).

### Safety model (the important part)

- **Approval gates.** Tools that spend, publish, or delete are `gated: true`. `executeTool`
  refuses to run them unless pointed at an `approvals` row that is `approved` **and** whose
  payload hash matches the exact arguments. There is no other code path to adapter writes.
- **Budget Guardian.** Pre-flight `checkSpend` blocks any action whose projected month-end
  spend breaches a cap; the worker's periodic `tick` auto-pauses on spend-velocity
  anomalies and zero-conversion burn. Every enforcement lands in the audit log.
- **Sandbox-first.** Ad adapters are deterministic mocks until you flip an integration to
  LIVE in Settings — which requires a connected account *and* typing `LIVE` to confirm.
- **Immutable audit log.** Every agent action, tool call, approval, and API write is
  recorded (actor, action, sha-256 payload hash) and viewable at `/audit`.

## Testing

```bash
pnpm typecheck   # strict TS across all packages
pnpm test        # 80+ Vitest tests (agents boots a throwaway embedded Postgres)
pnpm e2e         # Playwright: signup→onboarding + the full §12 voice dialog
```

The e2e suite drives the real app with mock STT via the `window.__voxSTT.inject(text)`
test hook: voice brief → audit summary (`58/100`, `3 missing meta descriptions`, `no lead
form`) → typed clarification → proposal card → voice `approve` → live sandbox campaign on
the dashboard, activity feed, and audit log.

## Adding a new agent or tool

1. **Tool** — add an entry to `TOOLS` in `packages/agents/src/tools.ts`:
   `{ name, description, schema (zod), gated, execute(ctx, args) }`. Set `gated: true` if
   it spends, publishes, or deletes — the gate is enforced for you.
2. **Agent** — add the type to `AgentType` (`packages/agents/src/types.ts`), map its tool
   subset in `AGENT_TOOLS` (`tools.ts`), and give it a display name in
   `packages/agents/src/execute-plan.ts`.
3. **Adapter** (if it talks to an external API) — add a pure adapter in
   `packages/integrations/` with a deterministic mock mode, and wire it through
   `getAdAdapter`-style factories. Mock first; live behind OAuth + the Settings switch.
4. **Tests** — unit-test the tool in `packages/agents/test/` (the approval gate and
   Guardian tests show the pattern).

## Going to production

`pnpm build` produces the deployable artifacts (Next.js production build + worker).
Checklist for a real deployment:

1. **Secrets** — set a strong `AUTH_SECRET` and a unique `ENCRYPTION_KEY`
   (`openssl rand -hex 32`; back it up — losing it orphans stored OAuth tokens).
   Set `CRON_SECRET` for the cron endpoint.
2. **URLs** — `NEXT_PUBLIC_APP_URL` / `AUTH_URL` to your public origin (OAuth
   redirect URIs derive from it: `/api/integrations/{platform}/callback`).
3. **LLM** — `LLM_PROVIDER=openai|anthropic` + the matching key. Mock stays the
   fallback for the voice dialog reference flow.
4. **Integrations** (only what you'll offer live): Google OAuth client with the
   Google Ads / Analytics / Search Console APIs enabled + `GOOGLE_ADS_DEVELOPER_TOKEN`;
   Meta app with Marketing API (`META_APP_ID/SECRET`); TikTok for Business app
   (`TIKTOK_APP_ID/SECRET`). Anything unconfigured stays in safe sandbox.
5. **Email** — `RESEND_API_KEY` + `EMAIL_FROM` (verified domain) for weekly reports;
   schedule `POST /api/cron/weekly-report` weekly with `Authorization: Bearer $CRON_SECRET`
   (or run the worker — its `email` queue fires Mondays 09:00).
6. **Services** — Postgres 16+ and Redis 7+. `docker compose up` runs everything;
   otherwise `pnpm db:migrate && pnpm build && pnpm start` (web) plus the worker
   for metric polling / optimization / email queues. The web works without the
   worker; queues just don't tick.

Safety invariants to never relax: gated tools require approved approvals, the
Budget Guardian pre-flights every spend action, every write is audit-logged, and
live mode always requires an OAuth-connected account + typing LIVE.

## Environment variables

Everything works with the defaults from `cp .env.example .env` — no keys, no network.

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5433/sayso` | Postgres (dev-services port 5433; compose 5432) |
| `REDIS_URL` | `redis://localhost:6380` | BullMQ queues |
| `AUTH_SECRET` / `AUTH_URL` | dev secret / `http://localhost:3000` | Auth.js |
| `GOOGLE_CLIENT_ID/SECRET` | empty | optional Google OAuth login; also the OAuth client for google_ads / ga4 / gsc connects |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | empty | Google Ads API developer token (required for google_ads live) |
| `META_APP_ID` / `META_APP_SECRET` | empty | Meta app credentials (required for Meta live) |
| `ENCRYPTION_KEY` | dev key (64 hex) | AES-256-GCM for OAuth tokens at rest |
| `LLM_PROVIDER` | `mock` | `mock` \| `openai` \| `anthropic` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `LLM_MODEL` | empty | live LLM config |
| `STT_PROVIDER` | `mock` | `mock` \| `browser` \| `whisper` \| `deepgram` |
| `DEEPGRAM_API_KEY` | empty | Deepgram STT |
| `TTS_PROVIDER` | `mock` | `mock` \| `browser` \| `openai` \| `elevenlabs` |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | empty / default voice | ElevenLabs TTS |
| `SEO_AUDIT_MODE` | `live` | `live` (falls back to mock) \| `mock` (offline) |
| `PAGESPEED_API_KEY` | empty | optional PSI quota key |
| `RESEND_API_KEY` / `EMAIL_FROM` | empty | weekly report email (phase 3) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | absolute links, hosted lead forms |
| `NEXT_PUBLIC_STT_PROVIDER` / `NEXT_PUBLIC_TTS_PROVIDER` | `mock` | client-side voice mode |
| `DEMO_SEED` | `true` | seed a demo org on migrate |

## Repo layout

```
apps/web            Next.js app: pages, tRPC routers, REST routes, voice UI
apps/worker         Hono health + BullMQ metric-poll / email queues
packages/db         Drizzle schema (CONTRACTS §4), migrations, seed, test utils
packages/llm        provider-agnostic chat + function-calling (mock/openai/anthropic)
packages/agents     orchestrator, specialists, guardian, tools, services
packages/integrations  crawler, PageSpeed, SEO audit, ad adapters, crypto, RAG seeds
e2e                 Playwright suite (embedded pg + dev server, fully offline)
scripts             dev-services (embedded pg+redis), wait-and-migrate
```

## MVP phasing

- **Phase 1 (this repo, done):** auth, onboarding, voice console, orchestrator +
  SEO/Lead-Gen agents, real SEO audit (crawl + PageSpeed with mock fallback), mock ad
  adapters, proposals + approval gates, Budget Guardian, dashboard, mini-CRM, audit log,
  unit + e2e suites.
- **Phase 2 (this repo, done):** real Google Ads / Meta REST adapters behind OAuth
  (connect at `/api/integrations/{platform}/connect`, tokens AES-256-GCM encrypted,
  refreshed on expiry), live-mode switch with LIVE confirm, GA4/GSC live data with
  mock fallback. Without app credentials everything stays in safe sandbox.
- **Phase 3 (this repo, done):** TikTok live adapter + OAuth, the optimization loop
  (hourly metrics → PENDING approvals: trim burners, scale winners, shift budget —
  nothing auto-executes), weekly email reports via Resend (log-only without a key,
  also `POST /api/cron/weekly-report` behind CRON_SECRET), and an expanded RAG
  corpus (23 docs: TikTok objectives/budgets/pixel, RSA, pacing, learning phase,
  special ad categories, billing safety).
- **Phase 4 (this repo, done — publication readiness):** verified production build,
  live LLM providers test-covered (injectable fetch), complete Google campaign
  delivery (geo targeting via geoTargetConstants, RSA ads from the org website,
  negative-keyword starter set), LLM-narrated weekly reports with deterministic
  fallback, and a deployment checklist (above).
- **Phase 5 (ideas):** Meta/TikTok ad-set + creative automation (needs per-org
  page/pixel/asset wiring), Slack/SMS approvals, multi-org agency mode.
