# TASK: Per-Org Cloud Business Memory + Document Import

You are extending **GrowthCrew**, a pnpm monorepo (Next.js 14 + tRPC + Drizzle/Postgres).
Goal: give each organization a **cloud memory** where clients import their own business
data (files, pasted notes, URLs). Agents ground their advice on this memory via semantic
search. Distinct from the existing GLOBAL `knowledge_documents` best-practice library.

## Foundation already done (do NOT recreate — build on it)

The DB table already exists and the migration is applied & tested. In
`packages/db/src/schema/app.ts`:
```ts
export const orgMemoryDocuments = pgTable('org_memory_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  title: text('title'),
  content: text('content'),
  kind: text('kind').default('note'),        // text|file|url|note
  sourceMeta: jsonb('source_meta').$type<Record<string, unknown>>(), // {filename,mimeType,sizeBytes,url}
  tags: jsonb('tags').$type<string[]>().default([]),
  embedding: jsonb('embedding').$type<number[] | null>(),
  createdAt, updatedAt,
});
```
Migration `packages/db/drizzle/0003_soft_toxin.sql` is committed-ready. It is exported from
`@growthcrew/db` via `export * from './schema/index'`. **Do not add new tables or migrations.**

## Repo facts (verified — build on these exactly)

- Semantic search pattern to copy: `packages/agents/src/services/knowledge.ts` —
  `searchKnowledge(ctx, q)` embeds the query with `embedText` (from `@growthcrew/integrations`),
  loads docs, lazily embeds+persists missing embeddings, ranks by `cosineSimilarity`, returns
  top 5. `embedText`/`cosineSimilarity`/`EMBEDDING_DIM` are exported from `@growthcrew/integrations`
  (`packages/integrations/src/embeddings.ts`).
- Service pattern: services live in `packages/agents/src/services/*.ts`, take an
  `AgentContext` (`{ db, orgId, userId?, llm, audit, now? }`) as first arg, and are
  re-exported via `packages/agents/src/services/index.ts` (then reachable as
  `services.<name>` from `@growthcrew/agents`).
- tRPC router pattern (see `apps/web/server/trpc/router/knowledge.ts`):
  ```ts
  import { z } from 'zod';
  import { services } from '@growthcrew/agents';
  import { router, orgProcedure } from '../trpc';
  export const memoryRouter = router({
    list: orgProcedure.query(({ ctx }) => services.memory.list(ctx.agentCtx)),
  });
  ```
  `orgProcedure` injects `ctx.agentCtx` and `ctx.orgId`.
- UI: pages under `apps/web/app/(app)/<route>/page.tsx`, `'use client'`, use `trpc` from
  `@/lib/trpc`, shadcn-style `@/components/ui/*`, `PageShell`/`PageHeader` from
  `@/components/page-shell`. See `apps/web/app/(app)/knowledge/page.tsx` for the exact look.
- Tests: `packages/agents/test/global-setup.ts` boots throwaway Postgres + runs ALL
  migrations (so `org_memory_documents` is available in tests). See
  `packages/agents/test/knowledge.test.ts` for the service-test pattern.
- Run: `pnpm typecheck`, `pnpm --filter @growthcrew/agents test`. Node 22, pnpm 11.

## What to build

### 1. Memory service (packages/agents/src/services/memory.ts) — NEW FILE
Export (all take `ctx: AgentContext` first):
- `listMemory(ctx, opts?: { kind?: string; tag?: string })` → the org's docs
  (filter `orgId = ctx.orgId`), newest first, limit 200. Never leak other orgs' rows.
- `addMemory(ctx, input: { title?; content; kind?; tags?; sourceMeta? })` → insert a row for
  `ctx.orgId`, eagerly compute+store `embedding = embedText(title + ' ' + content)`. Return it.
- `importText(ctx, { title?; text; tags? })` → convenience wrapper over `addMemory` (kind `note`).
- `importUrl(ctx, { url; tags? })` → fetch the URL server-side (direct `fetch` with a
  User-Agent; NO client CORS proxies), strip HTML to text with a regex
  (`.replace(/<script[\s\S]*?<\/script>/gi,' ')`, `.replace(/<style[\s\S]*?<\/style>/gi,' ')`,
  `.replace(/<[^>]+>/g,' ')`, collapse whitespace), grab `<title>` for the title, store with
  `kind:'url'`, `sourceMeta:{ url }`. Cap stored text at ~20k chars. On fetch failure throw a
  clear Error (the tRPC layer maps it to BAD_REQUEST).
- `importFile(ctx, { filename; mimeType; text; tags? })` → store extracted text with
  `kind:'file'`, `sourceMeta:{ filename, mimeType, sizeBytes: text.length }`. (Text extraction
  from binary is OUT OF SCOPE — the UI passes already-extracted text for .txt/.md/.csv; for
  other types the UI shows "paste the text".)
- `searchMemory(ctx, q)` → same algorithm as `searchKnowledge` but scoped to the org's rows.
  Return top 5 `{ id, title, content, kind, tags, score }`.
- `deleteMemory(ctx, id)` → delete only if the row's `orgId === ctx.orgId` (guard against
  cross-org delete). Return `{ deleted: boolean }`.
Register the module in `packages/agents/src/services/index.ts` as `memory`.

### 2. tRPC router (apps/web/server/trpc/router/memory.ts) — NEW FILE
Expose: `list`, `add` (importText), `importUrl`, `importFile`, `search`, `remove`.
Inputs validated with zod. `importUrl`/`importFile` are mutations. Keep it thin — all logic
in the service.

### 3. UI page (apps/web/app/(app)/memory/page.tsx) — NEW FILE
A "Business Memory" page (Liquid Glass style, match `knowledge/page.tsx`):
- Header: "Business Memory" / eyebrow "Intelligence" / description "Your business data that
  the agents ground their advice on. Private to your workspace."
- An import bar with three tabs/buttons: **Paste note** (textarea + title), **From URL**
  (url input), **Upload file** (a `<input type="file" accept=".txt,.md,.csv,.json">` that
  reads the file client-side with `FileReader.readAsText` and calls `importFile`).
- A tag filter + a search box (calls `search`, shows ranked hits with score badges).
- A list of existing memories (title, kind badge, tags, created date) each with a Delete
  button calling `remove`.
- Use `trpc.useUtils()` to invalidate `memory.list` after mutations.
Add a nav link to `/memory` wherever the existing nav lists `/knowledge` (find it with
`grep -rn "knowledge" apps/web/components apps/web/app | grep -i nav`). If nav is data-driven
(array of links), add one entry; do not restructure the nav.

### 4. Ground the agents on memory (packages/agents/src/orchestrator.ts) — MINIMAL
Find where the orchestrator builds its system/context prompt (search for `searchKnowledge`
or where knowledge hits are injected). Add a parallel call to `searchMemory(ctx, <user
intent>)` and append the top hits to the grounding context the same way knowledge is used.
Keep the change surgical and behind the existing pattern — do NOT refactor the orchestrator.
If knowledge isn't injected there, add memory grounding at the same place knowledge WOULD go
and note it in your report.

### 5. Tests (packages/agents/test/memory.test.ts) — NEW FILE
Mirror `knowledge.test.ts`:
- `addMemory` stores a row scoped to the org with a non-null embedding.
- `searchMemory` ranks a relevant doc above an irrelevant one.
- `listMemory` for org A never returns org B's rows (create two orgs).
- `deleteMemory` refuses/ignores a cross-org id.
- `importUrl` against a stubbed global `fetch` stores stripped text + title (no HTML tags).

## STRICT file ownership (do NOT touch anything else)
You own: `packages/agents/src/services/memory.ts` (new),
`packages/agents/src/services/index.ts` (add the `memory` export only),
`apps/web/server/trpc/router/memory.ts` (new),
`apps/web/app/(app)/memory/page.tsx` (new), the nav link addition,
`packages/agents/test/memory.test.ts` (new), and a surgical edit to
`packages/agents/src/orchestrator.ts` (memory grounding only).
DO NOT edit `apps/web/server/trpc/router/_app.ts` — the coordinator wires your router in.
DO NOT touch `packages/db/**` (table+migration already done), `packages/llm/**`,
`context.ts`, the models router, or the settings page (another agent owns those).

## Definition of done (verify yourself, report real output)
1. `pnpm typecheck` passes (all packages).
2. `pnpm --filter @growthcrew/agents test` passes including your new `memory.test.ts`.
3. Report: files changed, test counts, and confirmation that memory is org-scoped.
