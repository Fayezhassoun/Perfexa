# Codex Task: Perfexa Gate-1 — Real Ad-Account Pilot Flow

You are working in the Perfexa monorepo (~/sayso, private repo Fayezhassoun/Perfexa, branch main). Perfexa is a read-only performance-marketing operating system. The codebase is TypeScript: Next.js 14 app router in apps/web, tRPC routers in apps/web/server/trpc/router/, agent services in packages/agents/src/services/, integrations in packages/integrations/src/, DB schema in packages/db/src/schema.ts.

## Non-negotiable rails
- Read-only pilot: no external ad-account mutation. Ever. packages/integrations/src/ads/live-adapter.ts already enforces this with PilotReadOnlyViolation — do not weaken it.
- Honesty rail: never present sandbox/demo/mixed data as live. Live state only when a real OAuth-connected account synced real rows.
- No new dependencies, no DB schema changes unless essential (a migration is acceptable if genuinely needed and idempotent).
- No em dashes in user-facing copy.
- Do not weaken or bypass tests; update or add them instead.
- Do not commit anything.

## Current state (verified)
- settings.listIntegrations returns per-platform status with oauthConfigured flag and connectUrl.
- Real OAuth start route exists: GET /api/integrations/[platform]/connect → /callback (apps/web/app/api/integrations/). Callbacks persist connected_accounts rows.
- setIntegrationMode gates sandbox→live behind externalAccountId + confirmText "LIVE".
- syncNow (services.sync.syncOrg) pulls live rows into campaigns_mirror per live-connected platform.
- Dashboard Command Center shows data-state truth (none/sandbox/mixed/live/demo) from campaign mirror provenance.
- All tests + typecheck + web build currently pass on main (post-PR #2).

## What's missing / what to build: "Pilot Connection Flow" (full loop)

The goal: a first customer can complete Gate 1 without touching anything outside the app:

1. **Settings → Integrations hardening** (apps/web/app/(app)/settings + services/settings.ts)
   - When OAuth is NOT configured for a platform, show the honest "setup needed" state with what is missing (e.g. "Google Ads needs GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_ADS_DEVELOPER_TOKEN — not set on this deployment"). Never show a dead Connect button.
   - When configured, Connect opens the real OAuth start route in a new flow; after callback, return the user to settings with a success/error banner sourced from the callback result (add a ?connected= / ?error= param handoff if not present — check the callback route first).
   - Show the externalAccountId, last sync time, and connection status for connected accounts. Show token health via services/connection-health.
   - Sandbox connect button label must stay honest: "Connect sandbox (simulated)".
   - The LIVE switch: require typing LIVE, and when no OAuth account is connected explain why it's blocked. On success, audit-log happens server-side already — verify it.

2. **First-sync workflow** (services/sync.ts + dashboard)
   - After a successful syncNow, the Dashboard Command Center must show: platform, account id, row count, sync timestamp, and data-state "live" without inventing any numbers. If zero campaigns came back, say "The account sync returned no campaigns" — never a fake metric.
   - Add a clear per-platform sync error surface (partial failures must not silently disappear; syncOrg already isolates per-platform — surface its result in settings UI).

3. **Weekly report reconciliation** (packages/agents/src/services/reports.ts + /reports page)
   - The weekly report must carry its data-source banner: live / sandbox / mixed / demo and the sync timestamp it was built from. It likely already does — verify, and make the banner more prominent on the report view.
   - If a report is generated from live data, the report view must show a "Verify against account" block: totals for spend/spendCents per platform and the instruction to compare with the provider UI. Deterministic, no AI needed.

4. **Pilot operator checklist** (CUSTOMER_READINESS.md)
   - Update the "Operator steps" section to match exactly what the new flow actually does (button names, states, error surfaces). Remove any step that no longer exists.

## Verification (run everything, report real output)
1. `corepack pnpm typecheck`
2. `corepack pnpm test` (full workspace)
3. `corepack pnpm --filter @growthcrew/web build`
4. `git diff --check`
5. Add/extend tests in packages/agents/test/ covering: integration list states (oauth-configured vs not), sync-error surfacing, report banner with live sync timestamp.
6. Add apps/web/test/ coverage for the settings integrations card states if a harness exists there (check apps/web/test/ first).

## Report back
- Files changed with one-line purpose each.
- Real command outputs (pass/fail + counts), not claims.
- Anything NOT verified (e.g. real OAuth handshake — requires real provider credentials; state that explicitly).
