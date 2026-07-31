# TASK: Video Generation Studio

You are extending **Sayso**, a pnpm monorepo (Next.js 14 + tRPC + Drizzle/Postgres).
Goal: add a **Video Studio** where marketers generate short marketing videos (social ads,
product demos, UGC-style clips) from a text prompt. Follow Sayso's core rule: **mock-first
offline, live behind an API key, and nothing spends money without a recorded approval.**

## Foundation (the coordinator creates this table BEFORE you start — do NOT add migrations)

A `video_jobs` table will exist in `packages/db/src/schema/app.ts`:
```ts
export const videoJobs = pgTable('video_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  prompt: text('prompt').notNull(),
  style: text('style').default('ugc'),          // ugc|product_demo|cinematic|slideshow
  aspectRatio: text('aspect_ratio').default('9:16'), // 9:16|1:1|16:9
  durationSec: integer('duration_sec').default(15),
  status: text('status').default('queued'),     // queued|processing|completed|failed|needs_approval
  provider: text('provider').default('mock'),   // mock|fal|replicate
  resultUrl: text('result_url'),
  thumbnailUrl: text('thumbnail_url'),
  costCents: integer('cost_cents').default(0),
  error: text('error'),
  approvalId: uuid('approval_id'),
  createdByAgentId: uuid('created_by_agent_id'),
  createdAt, updatedAt,
});
```
It is exported from `@sayso/db`. **If the table is missing when you start, STOP and report it
— do not create the migration yourself (another task owns schema).**

## Repo facts (verified — build on these exactly)

- Adapters live in `packages/integrations/src/` and are PURE with a deterministic mock mode
  (see `ads/mock-adapter.ts` + `ads/live-*.ts` and the `getAdAdapter` factory pattern).
- Services: `packages/agents/src/services/*.ts`, first arg `AgentContext`
  (`{ db, orgId, userId?, llm, audit, now? }`), re-exported via `services/index.ts`.
- Gated tools: `packages/agents/src/tools.ts` has a `TOOLS` array; tools that spend are
  `gated: true` and `executeTool` refuses to run them without an approved `approvals` row
  whose payload hash matches. See `social.publish_post` / `reviews.post_reply` for the pattern.
- tRPC pattern: `apps/web/server/trpc/router/*.ts` using `router`, `orgProcedure`
  (injects `ctx.agentCtx`, `ctx.orgId`). See `competitors.ts`.
- UI: `apps/web/app/(app)/<route>/page.tsx`, `'use client'`, `trpc` from `@/lib/trpc`,
  `@/components/ui/*`, `PageShell`/`PageHeader`. Match `content/page.tsx` styling.
- Tests: `packages/agents/test/global-setup.ts` boots throwaway Postgres + runs all
  migrations. See `expansion.test.ts` for a service-test pattern.
- Run: `pnpm typecheck`, `pnpm --filter @sayso/integrations test`,
  `pnpm --filter @sayso/agents test`. Node 22, pnpm 11.

## What to build

### 1. Video adapter (packages/integrations/src/video.ts) — NEW FILE
- `VideoAdapter` interface: `{ generate(input: { prompt; style; aspectRatio; durationSec }):
  Promise<{ jobId; status; resultUrl?; thumbnailUrl?; costCents; provider }> }`.
- `createMockVideoAdapter()` — deterministic: returns a placeholder `resultUrl`
  (e.g. `https://cdn.sayso.dev/mock/<hash>.mp4` derived from the prompt), a thumbnail, a small
  deterministic `costCents`, `status:'completed'`. No network.
- `createFalVideoAdapter()` — POSTs to fal.ai (`https://fal.run/fal-ai/...`) using
  `FAL_KEY`/`FAL_API_KEY`, injectable `fetch` for tests. Map the response to the interface.
- `getVideoAdapter()` factory: `VIDEO_PROVIDER` env (`mock|fal`, default `mock`) → adapter.
- Export from `packages/integrations/src/index.ts`.

### 2. Video service (packages/agents/src/services/video.ts) — NEW FILE
- `listJobs(ctx)` → org's jobs, newest first, limit 50.
- `createJob(ctx, { prompt; style?; aspectRatio?; durationSec? })` → insert a `queued` job.
  In **mock** mode: call the mock adapter, mark `completed` with result, audit-log
  `video.generated`. In **live** mode: set `status:'needs_approval'` and create a PENDING
  approval (do NOT call the live adapter yet) — return the job + the approval id.
- `dispatchApproved(ctx, jobId)` → given an APPROVED approval matching the job, call the live
  adapter, store result, mark `completed`, audit-log. Refuse if approval isn't approved.
- `getJob(ctx, id)` → one job (org-scoped).
Register in `services/index.ts` as `video`.

### 3. Gated tool (packages/agents/src/tools.ts) — ADD ONE ENTRY
Add `video.generate` to `TOOLS` with `gated: true`, a zod schema
(`{ prompt: string, style?, aspectRatio?, durationSec? }`), and `execute` calling
`services.video.createJob`. Map it to an agent in `AGENT_TOOLS` (the content specialist is the
natural owner — add it there). Do not modify unrelated tools.

### 4. tRPC router (apps/web/server/trpc/router/video.ts) — NEW FILE
`list`, `create` (mutation → createJob), `get`, `dispatch` (mutation → dispatchApproved,
input `{ jobId, approvalId }`). Thin; logic in the service.

### 5. UI page (apps/web/app/(app)/video/page.tsx) — NEW FILE
"Video Studio" (Liquid Glass, match `content/page.tsx`):
- A composer: prompt `<Textarea>`, style `<Select>` (ugc/product_demo/cinematic/slideshow),
  aspect-ratio `<Select>` (9:16/1:1/16:9), duration `<Input type=number>`, **Generate** button.
- A grid/list of jobs: status badge, prompt, aspect ratio, cost, and a `<video controls>`
  player when `resultUrl` exists (mock URLs won't play — show a poster/placeholder frame with
  the prompt overlaid so the UI is demonstrable offline). For `needs_approval` jobs show an
  "Approve to render" affordance linking to `/proposals` or the approval flow.
- Invalidate `video.list` after mutations.
Add a nav link to `/video` next to `/content` (find nav with
`grep -rn "content" apps/web/components apps/web/app | grep -i nav`); add one entry, don't
restructure.

### 6. Env + docs
Append to `.env.example`: `VIDEO_PROVIDER` (default `mock`), `FAL_KEY` (empty). Note in README.

### 7. Tests
- `packages/integrations/test/video.test.ts`: mock adapter returns a deterministic completed
  job; fal adapter (stub fetch) maps a response correctly and hits the right URL.
- `packages/agents/test/video.test.ts`: mock-mode `createJob` → `completed` + audit log;
  live-mode (set `VIDEO_PROVIDER=fal`) `createJob` → `needs_approval` + a pending approval,
  and `dispatchApproved` refuses without an approved approval. Jobs are org-scoped.

## STRICT file ownership
You own: `packages/integrations/src/video.ts` (new), `packages/integrations/src/index.ts`
(add export), `packages/agents/src/services/video.ts` (new),
`packages/agents/src/services/index.ts` (add `video` export only),
`packages/agents/src/tools.ts` (add the ONE `video.generate` entry + AGENT_TOOLS mapping),
`apps/web/server/trpc/router/video.ts` (new), `apps/web/app/(app)/video/page.tsx` (new),
the nav link, `.env.example`, README (video rows), and your two test files.
DO NOT edit `apps/web/server/trpc/router/_app.ts` (coordinator wires it). DO NOT touch
`packages/db/**` (schema pre-provided), the competitors router/page/service, or anything the
business-memory / multi-model tasks own.

## Definition of done (verify yourself, report real output)
1. `pnpm typecheck` passes. 2. `pnpm --filter @sayso/integrations test` passes.
3. `pnpm --filter @sayso/agents test` passes incl. `video.test.ts`.
4. Report files changed, test counts, and confirm mock mode renders a completed job offline.
