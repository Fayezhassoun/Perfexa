# TASK: Multi-Model LLM Router + Per-Org Model Selection

You are extending **GrowthCrew**, a pnpm monorepo (Next.js 14 + tRPC + Drizzle/Postgres).
Goal: let GrowthCrew use MANY LLM providers (not just one global env var) and let each
organization pick its own model. Everything must stay offline-testable (mock default).

## Repo facts (verified — build on these exactly)

- LLM wrapper: `packages/llm/`. `src/index.ts` exports `getLLM()` which switches on
  `process.env.LLM_PROVIDER` (`mock|openai|anthropic|deepseek`). Providers live in
  `src/providers/{mock,openai,anthropic,deepseek}.ts`. Each exports `create<Name>Provider()`
  returning an `LLMProvider` (`{ name: string; chat(messages, opts?): Promise<LLMResponse> }`).
- `LLMProvider`, `ChatMessage`, `ChatOptions`, `ToolCall`, `LLMResponse`, `ToolSpec` are in
  `packages/llm/src/types.ts`. OpenAI-compatible providers (openai/deepseek) POST to a
  `/chat/completions`-style endpoint with injectable `fetch`/`apiKey`/`baseURL` for tests.
- Agent context: `packages/agents/src/context.ts` → `createAgentContext(opts)` sets
  `llm: opts.llm ?? getLLM()`. `AgentContext` (in `src/types.ts`) has `db, orgId, userId?,
  conversationId?, llm, audit, now?`.
- Org model choice storage: `organizations.settings` is a `jsonb` column
  (`Record<string, unknown>`). Read it the same way `apps/web/lib/business-brain.ts` reads
  `settings.businessBrain` — a defensive `readX(settings)` helper that returns `{}` on junk.
- tRPC: routers in `apps/web/server/trpc/router/`. Pattern (see `knowledge.ts`):
  ```ts
  import { z } from 'zod';
  import { services } from '@growthcrew/agents';
  import { router, orgProcedure } from '../trpc';
  export const xRouter = router({
    foo: orgProcedure.input(z.object({...})).query(({ ctx, input }) => services.x.foo(ctx.agentCtx, input)),
  });
  ```
  `orgProcedure` injects `ctx.agentCtx` (an `AgentContext`) and `ctx.orgId`.
- Tests: Vitest. `packages/llm/test/` has provider tests using injectable `fetch`.
  `packages/agents/test/global-setup.ts` boots a throwaway Postgres + runs all migrations.
- Run: `pnpm typecheck` (all packages), `pnpm --filter @growthcrew/llm test`,
  `pnpm --filter @growthcrew/agents test`. Node 22, pnpm 11.

## What to build

### 1. New providers (packages/llm/src/providers/)
Add OpenAI-compatible providers, each a thin factory like `deepseek.ts`:
- `gemini.ts` → `createGeminiProvider()` — base URL `https://generativelanguage.googleapis.com/v1beta/openai/` (Gemini exposes an OpenAI-compatible endpoint). Default model `gemini-2.0-flash`.
- `groq.ts` → `createGroqProvider()` — base `https://api.groq.com/openai/v1`. Default `llama-3.3-70b-versatile`.
- `mistral.ts` → `createMistralProvider()` — base `https://api.mistral.ai/v1`. Default `mistral-large-latest`.
- `ollama.ts` → `createOllamaProvider()` — base `http://localhost:11434/v1` (overridable via `OLLAMA_BASE_URL`). Default `llama3.1`. No API key required (send a dummy bearer).
- `qwen.ts` → `createQwenProvider()` — base `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`. Default `qwen-plus`.
Each MUST accept injectable `{ fetch, apiKey, baseURL, model }` options (mirror the existing
`deepseek.ts` / `openai.ts` signatures) so tests run offline with a stub fetch. Read env
(`GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `QWEN_API_KEY`, `OLLAMA_BASE_URL`)
only as defaults.

### 2. Provider registry + config resolver (packages/llm/src/)
- Add `src/registry.ts`: export `LLM_PROVIDERS` — an array of
  `{ id, label, defaultModel, envKey, create }` for all providers incl. existing
  mock/openai/anthropic/deepseek. Export `createProviderById(id, opts?)` that returns the
  right `LLMProvider` (throws a clear Error on unknown id).
- In `src/index.ts`: keep `getLLM()` (env default) working. Add
  `getLLMForConfig(config?: { provider?: string; model?: string }): LLMProvider` that
  resolves a provider by id and overrides the model. Re-export the registry.
- Add an `LLMConfig` type to `types.ts`: `{ provider?: string; model?: string }`.

### 3. Per-org model selection (packages/agents/src/context.ts)
- In `createAgentContext`, if `opts.llm` is not provided, read the org's chosen model from
  `organizations.settings.llm` (shape `{ provider?: string; model?: string }`) and call
  `getLLMForConfig(...)`. Since `createAgentContext` is sync and reading the DB is async,
  add an OPTIONAL async factory `createAgentContextWithOrgLLM(opts)` that loads the org row
  and builds the context with the resolved provider; leave the existing sync
  `createAgentContext` unchanged for backward compat. Export both from the package.
- Do NOT break existing callers. The sync path must still default to `getLLM()`.

### 4. tRPC router (apps/web/server/trpc/router/models.ts) — NEW FILE
- `models.listProviders` (orgProcedure, query) → returns `LLM_PROVIDERS` mapped to
  `{ id, label, defaultModel, configured }` where `configured` = whether the env key is set
  (or provider needs no key: mock/ollama).
- `models.getSelected` (orgProcedure, query) → reads `organizations.settings.llm`, returns
  `{ provider, model } | null`.
- `models.setSelected` (orgProcedure, mutation, input `{ provider: string; model?: string }`)
  → validates provider id against the registry, merges into `organizations.settings.llm`,
  persists via `ctx.agentCtx.db`. Return the saved value.
- Use `services` if you add a `packages/agents/src/services/models.ts`; otherwise query the
  org row directly through `ctx.agentCtx.db`. Prefer a small service for testability.

### 5. Settings UI (apps/web/app/(app)/settings/page.tsx)
- Add a self-contained "AI Model" card: a `<Select>` of providers (from
  `models.listProviders`), a model `<Input>` (prefilled with the provider default), and a
  Save button calling `models.setSelected`. Show which providers are `configured`.
- Keep it consistent with the existing Liquid Glass card styling already on that page.
- If the page is large, extract your card into a NEW component file
  `apps/web/components/model-selector.tsx` and render it from the page. Do not rewrite
  unrelated sections of the page.

### 6. Env + docs
- Append to `.env.example`: `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`,
  `QWEN_API_KEY`, `OLLAMA_BASE_URL` (all empty defaults) and note them in the README table.
- Extend `apps/web/lib/env.ts` ONLY if it validates these keys; otherwise leave it.

### 7. Tests (packages/llm/test/)
- Add `registry.test.ts`: `createProviderById('gemini'|'groq'|'mistral'|'ollama'|'qwen')`
  returns a provider whose `.name` is correct; unknown id throws; each provider's `chat()`
  works against a stub `fetch` returning an OpenAI-shaped completion (assert the request URL
  hits the right base and the parsed content/toolCalls come back).
- Add a test that `getLLMForConfig({ provider: 'groq', model: 'x' })` returns a groq provider.

## STRICT file ownership (do NOT touch anything else)
You own: `packages/llm/**`, `packages/agents/src/context.ts`,
`packages/agents/src/index.ts` (only to export the new async factory if needed),
`apps/web/server/trpc/router/models.ts` (new), `apps/web/components/model-selector.tsx` (new),
`apps/web/app/(app)/settings/page.tsx` (only to mount your card), `.env.example`, `README.md`
(model rows only).
DO NOT edit `apps/web/server/trpc/router/_app.ts` — the coordinator wires your router in.
DO NOT touch `packages/db/**`, `packages/agents/src/services/memory.ts`, the memory router,
or the business-memory page (another agent owns those).

## Definition of done (verify yourself, report real output)
1. `pnpm typecheck` passes (all packages).
2. `pnpm --filter @growthcrew/llm test` passes including your new registry tests.
3. `pnpm --filter @growthcrew/agents test` still passes (you didn't break context).
4. Report: files changed, test counts, and the exact provider ids now available.
