# VoxMarketer

Voice-first AI marketing team for small businesses: a pnpm monorepo with a Next.js web app
(`apps/web`), a Hono + BullMQ worker (`apps/worker`), and shared packages (`packages/db`,
`packages/llm`, `packages/agents`, `packages/integrations`) built around CONTRACTS.md.
Copy `.env.example` to `.env`, run `pnpm dev:services` in one terminal and `pnpm dev` in
another, and everything works offline with mock providers. (Full README lands in wave 5.)
