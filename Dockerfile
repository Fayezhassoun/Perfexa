# ── Dockerfile — Sayso ──────────────────────────────────────
# Multi-stage build: install deps → build all packages → slim runtime
#
# Sayso is a pnpm monorepo (Next.js 14 web + Hono worker + shared
# packages). This Dockerfile builds the web app and runs it standalone.

# ── Stage 1: deps ──────────────────────────────────────────────────
FROM node:22-slim AS deps

RUN corepack enable

WORKDIR /app

# Copy lockfile + workspace manifests first for cache
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/llm/package.json packages/llm/
COPY packages/agents/package.json packages/agents/
COPY packages/integrations/package.json packages/integrations/

RUN pnpm install --frozen-lockfile --prod=false \
  --ignore-scripts

# Install esbuild binaries separately (needed for build)
RUN node node_modules/esbuild/install.js 2>/dev/null || true
RUN node node_modules/@esbuild/*/install.js 2>/dev/null || true

# ── Stage 2: build ─────────────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/*/node_modules ./packages/

COPY . .

# Generate encryption key if not set (demo default)
ENV ENCRYPTION_KEY=000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f
ENV AUTH_SECRET=dev-secret-change-me-32-bytes-minimum!!
ENV LLM_PROVIDER=mock
ENV STT_PROVIDER=mock
ENV TTS_PROVIDER=mock
ENV SEO_AUDIT_MODE=mock
ENV NEXT_PUBLIC_STT_PROVIDER=mock
ENV NEXT_PUBLIC_TTS_PROVIDER=mock
ENV NEXT_PUBLIC_APP_URL=https://sayso.fly.dev
ENV DATABASE_URL=postgres://placeholder:placeholder@localhost:5432/sayso
ENV REDIS_URL=redis://localhost:6379

# Create minimal .env before build (Next.js requires it to exist)
RUN touch /app/apps/web/.env

RUN pnpm --filter @sayso/web build

# ── Stage 3: runtime ───────────────────────────────────────────────
FROM node:22-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copy the standalone Next.js output
COPY --from=builder /app/apps/web/.next/standalone ./
# Copy static assets if they exist
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
RUN mkdir -p ./apps/web/public

# Copy package.json for reference
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json

EXPOSE 3000

CMD ["node", "apps/web/server.js"]