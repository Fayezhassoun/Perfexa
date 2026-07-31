# TASK: Competitor Ad-Intelligence Upgrade

You are extending **GrowthCrew**, a pnpm monorepo (Next.js 14 + tRPC + Drizzle/Postgres).
Goal: upgrade the existing competitor surface (currently SEO-snapshot only) into a full
**ad-intelligence** module: track a competitor's Google Ads presence across multiple
countries, build an ad-count matrix by region, and capture ad creative text/angles. This
productizes a proven manual research workflow (Google Ads Transparency Center scanning).
Follow GrowthCrew's rule: **mock-first offline, live behind a real fetch, org-scoped, audited.**

## Foundation (the coordinator creates this table BEFORE you start — do NOT add migrations)

A `competitor_ad_scans` table will exist in `packages/db/src/schema/app.ts`:
```ts
export const competitorAdScans = pgTable('competitor_ad_scans', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').notNull().references(() => organizations.id),
  competitorId: uuid('competitor_id').references(() => competitors.id),
  advertiserId: text('advertiser_id'),   // Google Transparency AR id, e.g. AR15714032992319963137
  advertiserName: text('advertiser_name'),
  region: text('region'),                // SA|AE|KW|MA|DZ|CA|US|...
  adCount: integer('ad_count').default(0),
  // [{ headline, cta, lang, operator, pricingNote, angle }] captured creative text
  creatives: jsonb('creatives').$type<Record<string, unknown>[]>(),
  scannedAt: timestamp('scanned_at', { mode: 'date' }).defaultNow().notNull(),
  raw: jsonb('raw').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});
```
Exported from `@growthcrew/db`. **If the table is missing when you start, STOP and report it —
do not create the migration yourself (another task owns schema).**

## Repo facts (verified — build on these exactly)

- Existing competitor service: `packages/agents/src/services/competitors.ts`
  (`listCompetitors`, `addCompetitor`, `analyzeCompetitor`, `removeCompetitor`). The
  `competitors` table has `snapshot`/`history`/`suggestions` jsonb. SEO analysis runs via the
  `competitor.analyze` tool in `packages/agents/src/tools.ts`.
- Integrations are PURE adapters with a mock mode (see `packages/integrations/src/ads/*` and
  `seo-audit.ts` which has a `SEO_AUDIT_MODE=live|mock` pattern with graceful fallback).
- Services: `packages/agents/src/services/*.ts`, first arg `AgentContext`, re-exported via
  `services/index.ts`. Audit via `ctx.audit.log({ actorType, actorId, action, entityType,
  entityId, payload })`.
- tRPC: `apps/web/server/trpc/router/competitors.ts` already exists (list/add/analyze/remove).
- UI: `apps/web/app/(app)/competitors/page.tsx` already exists. Match its Liquid Glass style.
- Tests: `packages/agents/test/global-setup.ts` boots throwaway Postgres + all migrations.
- Run: `pnpm typecheck`, `pnpm --filter @growthcrew/integrations test`,
  `pnpm --filter @growthcrew/agents test`. Node 22, pnpm 11.

## What to build

### 1. Transparency adapter (packages/integrations/src/ad-intel.ts) — NEW FILE
- `AdIntelAdapter` interface:
  `{ scanRegion(input: { advertiserId; region }): Promise<{ adCount; advertiserName?; creatives: Creative[] }> }`
  where `Creative = { headline?; cta?; lang?; operator?; pricingNote?; angle? }`.
- `createMockAdIntelAdapter()` — deterministic: given `advertiserId + region`, return a stable
  adCount (hash-derived) and 2–4 sample creatives (Arabic + English sample headlines/CTAs so
  the UI is demonstrable offline). No network.
- `createTransparencyAdIntelAdapter()` — live: fetch the Google Ads Transparency Center page
  `https://adstransparency.google.com/advertiser/<advertiserId>?region=<region>` with a
  User-Agent, injectable `fetch` for tests. NOTE: the page is a JS SPA, so a plain fetch may
  return a shell — parse what's available (server-rendered meta / JSON-LD / `__NEXT_DATA__`
  if present) for an ad count and advertiser name; if nothing parseable, return `adCount: 0`
  with a `raw.note` explaining the SPA limitation. Do NOT crash. (Real deep scraping is a
  future browser-based job; this adapter must degrade gracefully.)
- `getAdIntelAdapter()` factory: `AD_INTEL_MODE` env (`mock|live`, default `mock`).
- Export a `REGIONS` constant: `[{ code:'SA',label:'Saudi Arabia'},{code:'AE',label:'UAE'},
  {code:'KW',label:'Kuwait'},{code:'MA',label:'Morocco'},{code:'DZ',label:'Algeria'},
  {code:'CA',label:'Canada'},{code:'US',label:'United States'}]`.
- Export from `packages/integrations/src/index.ts`.

### 2. Ad-intel service (packages/agents/src/services/ad-intel.ts) — NEW FILE
- `scanCompetitor(ctx, { competitorId; advertiserId; advertiserName?; regions?: string[] })`
  → for each region (default all `REGIONS`), call the adapter, upsert a
  `competitor_ad_scans` row (org-scoped), audit-log `adintel.scanned`. Return the rows.
- `matrix(ctx, competitorId)` → return `{ regions: string[], rows: [{ region, adCount,
  scannedAt }] }` for the competitor's latest scan per region.
- `listScans(ctx, opts?: { competitorId? })` → org's scans, newest first.
- `creatives(ctx, scanId)` → the captured creatives for one scan (org-scoped guard).
Register in `services/index.ts` as `adIntel`.

### 3. tRPC (apps/web/server/trpc/router/competitors.ts) — EXTEND EXISTING FILE
Add a nested `adIntel` sub-router (or flat procedures) : `scan` (mutation → scanCompetitor,
input `{ competitorId, advertiserId, advertiserName?, regions? }`), `matrix` (query),
`scans` (query), `creatives` (query). Keep existing list/add/analyze/remove intact.

### 4. UI (apps/web/app/(app)/competitors/page.tsx) — EXTEND
Add an "Ad Intelligence" section below the existing SEO list:
- For a selected competitor, an input for the Google Transparency **advertiser ID** (AR…) +
  a multi-select of regions + a **Scan** button (calls `adIntel.scan`).
- A region × ad-count **matrix** (table or cards) from `adIntel.matrix`, color-intensity by
  count.
- A creatives drawer/list: for a scanned region, show captured headlines/CTAs with lang +
  angle badges.
Keep the existing SEO UI working; add, don't rewrite.

### 5. Tool (packages/agents/src/tools.ts) — ADD ONE ENTRY
Add `competitor.ad_scan` (NOT gated — it's read-only research) with zod schema
`{ competitorId, advertiserId, regions? }`, `execute` → `services.adIntel.scanCompetitor`.
Map it to the competitor agent in `AGENT_TOOLS`. Don't modify unrelated tools.

### 6. Env + docs
Append to `.env.example`: `AD_INTEL_MODE` (default `mock`). Note in README.

### 7. Tests
- `packages/integrations/test/ad-intel.test.ts`: mock adapter returns deterministic counts +
  creatives; live adapter (stub fetch returning an SPA shell) degrades to `adCount:0` with a
  note instead of throwing; `REGIONS` has the 7 expected codes.
- `packages/agents/test/ad-intel.test.ts`: `scanCompetitor` writes org-scoped rows + audit log;
  `matrix` returns one row per region; scans never leak across orgs.

## STRICT file ownership
You own: `packages/integrations/src/ad-intel.ts` (new), `packages/integrations/src/index.ts`
(add export), `packages/agents/src/services/ad-intel.ts` (new),
`packages/agents/src/services/index.ts` (add `adIntel` export only),
`packages/agents/src/services/competitors.ts` (only if you must reuse a helper — prefer not),
`packages/agents/src/tools.ts` (add the ONE `competitor.ad_scan` entry + mapping),
`apps/web/server/trpc/router/competitors.ts` (extend), `apps/web/app/(app)/competitors/page.tsx`
(extend), `.env.example`, README (ad-intel rows), and your two test files.
DO NOT edit `apps/web/server/trpc/router/_app.ts`. DO NOT touch `packages/db/**` (schema
pre-provided), the video router/page/service, or anything the business-memory / multi-model
tasks own.

## Definition of done (verify yourself, report real output)
1. `pnpm typecheck` passes. 2. `pnpm --filter @growthcrew/integrations test` passes.
3. `pnpm --filter @growthcrew/agents test` passes incl. `ad-intel.test.ts`.
4. Report files changed, test counts, and confirm mock mode produces a region matrix offline.
