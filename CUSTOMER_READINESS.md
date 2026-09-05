# Perfexa customer readiness

Status: Pilot Connection Flow implemented locally. See Verification performed for the current check results. Production deployment and real provider OAuth were not run.

This document describes the supported first-customer path and the evidence required before sharing a result. Demo and sandbox data are test data, not customer evidence. The application remains read-only with respect to connected ad platforms: sync reads campaign data into the local mirror, and live ad mutations remain blocked even after approval.

## Supported workflow

1. Register from the landing page or a plan CTA. The selected `starter`, `growth`, or `agency` plan is carried into the new organization.
2. Complete onboarding: business context, goals, optional sandbox connection, brand voice, and the first insight. The wizard can be resumed after a refresh.
3. Open Settings → Integrations. Each platform reports one explicit state: setup needed, ready to connect, connected in sandbox, connected live, or connection error.
4. Connect a read-only account through the signed OAuth route when the deployment has the required provider configuration. OAuth starts in sandbox. The separate `Connect sandbox (simulated)` action is for UI testing; it cannot pass the real OAuth LIVE gate or perform a live sync.
5. After confirming the account, choose `Go Live` and type `LIVE`. This is the explicit gate for customer evidence. Then use `Sync now`; the button is enabled only when at least one live ad account is connected.
6. Confirm the Dashboard shows `Live account data`, the campaign rows are from the live sync, and the first-customer checklist reflects the live sync.
7. Generate the weekly report. Its prominent source banner records live, sandbox, mixed, demo, or no data. Live metrics use the latest provider snapshot once, with a deterministic account review; rolling snapshots are not summed as daily or weekly spend.
8. Review the report source notice. Share only a report backed by live data. Growth and Agency plans can create an organization-scoped public share link; the link contains report content, not credentials or provider tokens. Print / save PDF is available from the report view.

## Setup requirements

Local development requires the repository dependencies, the configured database services, migrations, and the normal application environment. A real provider connection additionally requires the matching OAuth app credentials and callback URL configuration. Google Ads also requires its developer token. Resend/email configuration is required for email delivery, and the existing authentication, encryption, and cron secrets must be configured in the deployment environment. Do not place any of these values in browser code, reports, screenshots, or this runbook.

Supported integration keys are Google Ads, Meta, TikTok, GA4, and Google Search Console. Settings lists only missing environment variable names, never their values: Google Ads uses GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_ADS_DEVELOPER_TOKEN; GA4/GSC use the first two Google keys; Meta uses META_APP_ID + META_APP_SECRET; TikTok uses TIKTOK_APP_ID + TIKTOK_APP_SECRET. The sandbox path remains available when production OAuth is unavailable.

## Data states

| State | Meaning | Customer-evidence rule |
| --- | --- | --- |
| `none` / Setup needed | No campaign data has been synced for the workspace. | Configure/connect and run a live sync first. |
| `sandbox` | Simulated or sandbox campaign rows. | Testing only; do not share as performance evidence. |
| `live` | Campaign rows loaded by a connected account in live mode. | Eligible for review after checking account identity, period, and totals. |
| `mixed` | Live and sandbox rows are present together. | Review each campaign and clean up the test rows before sharing. |
| `demo` | Explicit demo mode data. | Always test data; never present as a customer result. |
| connection error | The stored account could not be used, commonly because credentials expired/revoked or provider setup is incomplete. | Reconnect or fix configuration; do not infer performance from stale data. |

## Operator steps for the first customer

Use a real pilot account and record the organization, provider, external account identifier, sync time, and report period in the operator log.

1. Create the pilot organization on the intended plan and complete onboarding with the customer's business context and goals.
2. Open Settings → Integrations. `Setup needed` lists missing provider configuration names and offers `Connect sandbox (simulated)` without a dead OAuth link. Record missing configuration and have the deployment operator configure it before attempting real OAuth.
3. When `Ready to connect` appears, use `Connect account`. A simulated sandbox connection also offers `Connect account` once OAuth is configured; simulation alone cannot go live.
4. Complete the provider authorization. The callback returns to the Integrations tab with a connected or error banner. Verify the card's external account identifier, sandbox mode, and connection/token health. `Last successful sync` must say `not synced yet` until a real sync succeeds. OAuth and token-refresh timestamps are not sync timestamps.
5. Use `Go Live`, type exactly `LIVE`, and select `Confirm live mode`. This enables read-only reporting; all live campaign mutations stay blocked. Missing OAuth tokens, broken connection status, or missing provider configuration block the change. Success and rejection are audit-logged server-side.
6. Select `Sync now`, enabled for a configured live ad account (Google Ads, Meta, or TikTok). Read every platform result: successful row count and sync timestamp, `Sync failed` with its error, or `Skipped` with its reason. One platform's failure does not hide another platform's result. An empty success says `The account sync returned no campaigns`; zero returned rows are not evidence of live campaign performance.
7. Open Command Center. Verify each successful sync's platform, account identifier, row count, and timestamp. With live campaign rows, check `Live account data`; sandbox and live together must remain `Mixed data sources`. A newer empty sync excludes superseded live rows from this view. Failed refreshes retain the last successful data and timestamp.
8. Open Weekly Reports and select `Generate this week`. Inspect `Report data source`, source sync timestamps, and `Verify against account`. Compare platform `Spend` and integer `spendCents` against the provider UI using the shown account and metric window. Google uses LAST_30_DAYS; Meta uses last_30d; TikTok requests the sync day minus 30 days through the sync day. These are provider snapshots, not a true seven-day live report. Check provider currency before comparing or combining spend.
9. Review the deterministic live snapshot report. Daily live breakdowns and comparable prior-period totals are unavailable, so the report does not infer weekly changes. Resolve mixed sources, stale syncs, missing timestamps, unexpected empty results, or mismatched totals before using it as customer evidence.
10. If the report is useful and the plan permits, create its share link. Verify the signed-out view shows the intended report and source label without credentials. Use `Print / save PDF` only after reconciliation. Existing reports keep their recorded source evidence until explicitly regenerated.

## Verification performed

Current local verification is recorded in the accompanying Pilot Connection Flow completion report, including exact command outputs and test counts:

- `corepack pnpm typecheck`: pass for all six typechecked packages.
- `corepack pnpm test` (full workspace): 448 tests passed in 52 test files.
- `corepack pnpm --filter @growthcrew/web build`: pass, including 51/51 generated static pages.
- `git diff --check`: pass, no output.

Regression coverage includes configured/missing integration states, simulated-account rejection, LIVE confirmation and audit logging, callback handoff, per-platform sync errors, empty reads, stale-snapshot exclusion, source-history isolation, report timestamps, and deterministic spend reconciliation. Provider requests in tests use injected fixtures.

The live landing page returned HTTP 200 during this task. This is an availability check only. Real provider OAuth, production sync/reconciliation, and the authenticated browser journey were not verified. No production deployment was run.

## Known blockers and boundaries

- A live OAuth test requires real provider credentials, callback registration, and a real read-only pilot account; those external prerequisites were not fabricated or bypassed.
- Public report sharing is intentionally entitlement-gated to Growth and Agency. A Starter organization must be upgraded by the existing plan/admin workflow before sharing.
- Existing reports may lack `dataSource` or source timestamps. The report view states missing provenance; regenerate after a live sync to capture evidence.
- Scheduled delivery still depends on the configured production email/provider secrets and scheduler. This task does not deploy or provision them.
- A prior local E2E onboarding timing failure is historical and was not rerun in this task. Do not claim the complete authenticated browser journey is verified from component or callback tests.

## First-customer acceptance script

**Given** a new organization on the intended plan and a read-only provider account,

1. Register and verify the chosen plan is retained.
2. Finish onboarding and verify the dashboard checklist is visible.
3. Verify Settings identifies provider setup state and never presents a dead OAuth CTA.
4. Connect in sandbox, verify the account identifier, then switch to live with `LIVE`.
5. Run `Sync now` and verify the live success message, refreshed last-sync time, and live dashboard notice.
6. Generate a report and verify its per-platform spend totals against the provider snapshot window and currency shown in the report, not an assumed seven-day period.
7. Confirm the report says deterministic or AI narrated accurately, and that unavailable LLM/email configuration is stated rather than implied as complete.
8. Share only if the organization is entitled and the report source is live. Verify the public link from a signed-out browser context and confirm no secret material is present.
9. Record any missing setup, connection error, stale data, mixed source, or mismatch as a blocker; do not convert it into a customer claim.
