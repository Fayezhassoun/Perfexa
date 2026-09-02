# Perfexa customer readiness

Status: code and local verification complete; production deployment intentionally not run.

This document describes the supported first-customer path and the evidence required before sharing a result. Demo and sandbox data are test data, not customer evidence. The application remains read-only with respect to connected ad platforms: sync reads campaign data into the local mirror, and any proposed marketing action still requires the existing approval workflow.

## Supported workflow

1. Register from the landing page or a plan CTA. The selected `starter`, `growth`, or `agency` plan is carried into the new organization.
2. Complete onboarding: business context, goals, optional sandbox connection, brand voice, and the first insight. The wizard can be resumed after a refresh.
3. Open Settings → Integrations. Each platform reports one explicit state: setup needed, ready to connect, connected in sandbox, connected live, or connection error.
4. Connect a read-only account through the signed OAuth route when the deployment has the required provider configuration. OAuth starts in sandbox. Sandbox connections are useful for testing the UI and sync path.
5. After confirming the account, choose `Go Live` and type `LIVE`. This is the explicit gate for customer evidence. Then use `Sync now`; the button is enabled only when at least one live ad account is connected.
6. Confirm the Dashboard shows `Live account data`, the campaign rows are from the live sync, and the first-customer checklist reflects the live sync.
7. Generate the weekly report. It is built from the stored campaign mirror, alerts, and creative-health data; AI narration is optional and the deterministic report remains available when the LLM is not configured.
8. Review the report source notice. Share only a report backed by live data. Growth and Agency plans can create an organization-scoped public share link; the link contains report content, not credentials or provider tokens. Print / save PDF is available from the report view.

## Setup requirements

Local development requires the repository dependencies, the configured database services, migrations, and the normal application environment. A real provider connection additionally requires the matching OAuth app credentials and callback URL configuration. Google Ads also requires its developer token. Resend/email configuration is required for email delivery, and the existing authentication, encryption, and cron secrets must be configured in the deployment environment. Do not place any of these values in browser code, reports, screenshots, or this runbook.

Supported integration keys are Google Ads, Meta, TikTok, GA4, and Google Search Console. The app explains missing provider configuration in Settings and keeps the sandbox path available when production OAuth is unavailable.

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

1. Create the pilot organization using the intended paid plan, or confirm the organization plan before testing report sharing.
2. Complete onboarding with the customer’s actual business context and goals.
3. In Settings, verify provider setup is reported accurately. If OAuth is unavailable, stop and record the missing configuration; do not claim the live path was tested.
4. Connect the customer’s read-only account. Confirm the returned external account identifier and leave it in sandbox while validating the account selection.
5. Switch that account to live using the explicit `LIVE` confirmation.
6. Click `Sync now`. Confirm the success status, refreshed `last sync`, non-zero campaign mirror rows where expected, and Dashboard `Live account data` notice.
7. Generate a weekly report and check the period, spend, impressions, clicks, conversions, wins/losses, recommendations, and source notice against the customer account.
8. If the report is useful and the plan permits it, create the share link. Open it in a private browser context and confirm it shows only the intended report, no tokens, no account credentials, and the correct source notice.
9. Export/print the report only after the live-data review. Keep sandbox/demo screenshots clearly labeled and separate from customer evidence.

## Verification performed

The following checks are required for this task and were run locally after the implementation:

- `pnpm typecheck` — pass.
- `pnpm test` — pass for all workspace packages.
- `pnpm build` — pass for all buildable workspace packages, including the Next.js production build.
- `pnpm --filter @growthcrew/agents test` — pass after updating coverage for source provenance, report no-data copy, live sync timestamps, and sandbox-to-live mirror promotion.
- `pnpm --filter @growthcrew/web test` — pass, including integration-state and data-source notice coverage.
- `git diff --check` — pass.
- Secret/fake-claim review — no credentials or tokens added; demo/sandbox states remain explicitly labeled; no ad mutation or hidden spend path was added.

`pnpm e2e` was also run because the local Playwright suite is available. One test passed and three onboarding flows failed while waiting for `Your first insight` in the local Next development server. The captured trace’s final DOM reached Step 5 and contained that heading and the `Go to dashboard` action, so this is recorded as a local timing/render blocker rather than a passing E2E result. No production deployment was run.

## Known blockers and boundaries

- A live OAuth test requires real provider credentials, callback registration, and a real read-only pilot account; those external prerequisites were not fabricated or bypassed.
- Public report sharing is intentionally entitlement-gated to Growth and Agency. A Starter organization must be upgraded by the existing plan/admin workflow before sharing.
- Existing reports created before source provenance was stored may not contain `dataSource`; regenerate after a live sync when the source banner is required.
- Scheduled delivery still depends on the configured production email/provider secrets and scheduler. This task does not deploy or provision them.
- The local E2E onboarding timing failure remains an explicit verification blocker; it must be resolved before claiming the complete browser journey is green.

## First-customer acceptance script

**Given** a new organization on the intended plan and a read-only provider account,

1. Register and verify the chosen plan is retained.
2. Finish onboarding and verify the dashboard checklist is visible.
3. Verify Settings identifies provider setup state and never presents a dead OAuth CTA.
4. Connect in sandbox, verify the account identifier, then switch to live with `LIVE`.
5. Run `Sync now` and verify the live success message, refreshed last-sync time, and live dashboard notice.
6. Generate a report and verify its totals against the provider for the selected period.
7. Confirm the report says deterministic or AI narrated accurately, and that unavailable LLM/email configuration is stated rather than implied as complete.
8. Share only if the organization is entitled and the report source is live. Verify the public link from a signed-out browser context and confirm no secret material is present.
9. Record any missing setup, connection error, stale data, mixed source, or mismatch as a blocker; do not convert it into a customer claim.
