# GrowthCrew Runbook — Sync & Weekly Report Incidents

**Ledger:** GC-006 · **Audience:** pilot operator / on-call founder · **Scope:** live data sync and weekly report generation/delivery. Every statement below was verified against the repository source on 2026-08-30; the authoritative files are listed in [§8](#8-source-files-reviewed).

GrowthCrew is read-only toward ad platforms. No incident in this runbook can spend, publish, or delete anything on a connected account; the worst case is **stale or missing data presented to a customer**, which is why the evidence rules in [§6](#6-customer-evidence-rules-after-an-incident) are mandatory.

## 1. System map (verified)

| Component | What it does | Failure posture |
| --- | --- | --- |
| `POST /api/cron/sync` | Pulls live campaigns from every org's live-connected ad platforms into `campaigns_mirror` (the table reports, alerts, anomaly detection, and creative fatigue read). Intended schedule: every 6h via external scheduler (`fly.toml`). | 401 if `CRON_SECRET` missing/mismatched (run never happens). 200 clean, **207 with `errors[]`** on partial failure. Per-org/per-platform failures are isolated — one bad account cannot abort the run. Idempotent upsert: re-running is always safe. |
| `POST /api/cron/weekly-report` | Builds the weekly report for every org and emails org owners/admins. Intended schedule: Mondays 08:00 UTC via external scheduler. | 401 without secret. 200 clean, 207 with `errors[]` on per-org failures. **Idempotent per ISO week** via a `weekly_report.emailed` audit entry keyed by `weekStart`. `?force=1` bypasses the guard for deliberate operator resends. |
| Worker (`apps/worker`) | BullMQ queues: `metrics-poll` (5 min), `optimize` (hourly), `email` (weekly Mon 09:00), `geo-scan` (weekly Mon 07:00). | Boots even when Redis is down — queues are skipped with `[worker] redis unavailable` and the **web app keeps working**. Job failures are logged as `[worker] <queue> failed:` and do not crash the process. |
| Manual sync | Settings → **Sync now** (tRPC `settings.syncNow` → `services.sync.syncOrg`). Enabled only when at least one live ad account is connected. | Per-platform results returned to the UI; failures surface as errors, not mock data. |
| Token lifecycle | `loadLiveDeps` decrypts stored tokens (AES-256-GCM) and refreshes them 60s before expiry when a refresh token exists, persisting refreshed tokens back encrypted. | Without a refresh token, the stale token is used and the provider's 401 becomes the reconnect signal. Reconnect in Settings replaces tokens and **preserves the sandbox/live mode**. |

## 2. Detection signals

Check these in order when something looks wrong:

1. **Cron HTTP response.** The scheduler's output is the primary signal. `errors[]` entries are formatted `orgId:platform: message` (sync) or `orgId: message` (weekly report). A 207 means *partial* success — not a full outage.
2. **Connection health** (Settings → Integrations, backed by `getConnectionHealth`). Surfaces `needsReconnect` and warnings: *"connection was lost"*, *"access expired"*, *"access expires soon"* (live token within 1h of expiry).
3. **Audit log** (immutable, source of truth). Successful syncs write `sync.platform` entries; successful email sends write `weekly_report.emailed` with `weekStart`, recipient count, and provider. **Gaps** in these entries are how you detect a run that never fired.
4. **Worker logs.** `[worker] redis unavailable` (queues disabled, web unaffected) and `[worker] <queue> failed:` lines.

> **Known detection gap (verified):** a failed sync does **not** set `connected_accounts.status` to `error` — the status is only written on success. `lastSyncAt` is `connected_accounts.updatedAt`, which also moves on token refresh. Detect failed syncs via the cron `errors[]` response and audit-log gaps, not via status alone.

## 3. Incident catalog

### I1 — Cron endpoint returns 401
- **Cause:** `CRON_SECRET` is unset in the web environment, or the scheduler sends a mismatched bearer token. The endpoint is deliberately inert — **the run never executed**.
- **Recover:** set/verify the secret (`flyctl secrets set CRON_SECRET=<random>` — never in chat or tickets), fix the scheduler header, then trigger the run manually ([§4](#4-manual-recovery-commands)). Safe: sync is an idempotent upsert; the weekly report is idempotent per ISO week.

### I2 — Sync run reports errors (HTTP 207)
- **Cause:** per-platform isolation is working; read `errors[]`. Common entries:
  - Provider 4xx (expired/revoked permission): **not retried** by design (`withRetry` rethrows 4xx immediately). Customer action: reconnect in Settings.
  - Transient provider/network failure: already retried with exponential backoff (3 retries, 250ms base, jitter) before surfacing.
  - `not-connected` skips are **not** errors — they mean the platform has no live connection or OAuth env config is missing (`loadLiveDeps` returned null).
- **Recover:** reconnect the failing platform (I3), or simply re-run the sync — unaffected platforms and orgs already succeeded.

### I3 — Token expired / connection lost
- **Detect:** connection-health warning, or sync errors naming the platform.
- **Recover:** Settings → Integrations → reconnect the platform. Reconnect replaces tokens and keeps the existing sandbox/live mode; going live still requires the explicit `LIVE` confirmation. Then run **Sync now** and confirm the audit log shows `sync.platform` and the dashboard shows `Live account data`.
- **Note:** Google tokens auto-refresh when a refresh token is stored; Meta refreshes via its long-lived-token exchange. If refresh fails, the provider 401 is the reconnect signal — do not script around it.

### I4 — Weekly report not emailed
Read the cron response `details[]` per org before assuming a bug:
- `skipped / already-sent` — idempotency guard; the report was already emailed this ISO week. **Expected**, not an incident.
- `skipped / no-recipient` — the org has no owner/admin with an email address. Fix membership, then force-resend.
- `errors[]` — per-org failure (e.g. database or template error); other orgs were unaffected.
- **Console fallback trap (verified):** when `RESEND_API_KEY` is unset, the email provider falls back to console output — the report is generated and the `weekly_report.emailed` audit entry **is still written**. A later non-forced run that week will skip the org. After configuring Resend, resend with `?force=1`.
- **Recover:** `POST /api/cron/weekly-report?force=1` with the cron secret ([§4](#4-manual-recovery-commands)).

### I5 — Report generated but data looks wrong or empty
- Check the report's `dataSource`: `none` / `sandbox` / `mixed` / `demo` are **never** customer evidence. `live` is reviewable after checking account identity, period, and totals.
- Stale mirror: run **Sync now** (or the cron endpoint), then regenerate the report. Reports read `campaigns_mirror`; they do not fetch from providers at render time.
- LLM narration failures are **not** incidents: the two-stage build always produces the deterministic brief and any LLM failure, mock provider, or exhausted budget degrades to it, with the report labeled `deterministic`.

### I6 — Worker down or Redis unavailable
- **Impact:** none on the web app (by design). Scheduled `metrics-poll` / `optimize` / `email` / `geo-scan` queues pause.
- **Important:** production sync and weekly-report schedules run through the **HTTP cron endpoints**, not the worker, so a worker outage does not stop them. GEO/SEO has its own endpoint, `POST /api/cron/geo` (same `CRON_SECRET` guard).
- **Recover:** restore Redis / restart the worker; queues re-register on boot. No data is lost — jobs are repeat-scheduled, not queued-and-droppable.

### I7 — Nothing ran at all (no audit entries, stale `lastSyncAt` everywhere)
- **Cause:** Fly has no declarative HTTP-cron field; if the external scheduler was never registered, endpoints simply never get called. This is a **Fayez Required** gate in the delivery ledger.
- **Recover:** trigger both endpoints manually to backfill, then register the schedules per `fly.toml` (`flyctl machine run --schedule "0 */6 * * *"` for sync, `"0 8 * * 1"` for the weekly report). Backfill is safe due to idempotency.

## 4. Manual recovery commands

All commands are read-only toward ad platforms and idempotent toward GrowthCrew data. Never place real secret values in chat, tickets, or screenshots.

```bash
# Backfill live sync (safe to run any time, any number of times)
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://growthcrew.fly.dev/api/cron/sync

# Weekly report for all orgs (skips orgs already emailed this ISO week)
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://growthcrew.fly.dev/api/cron/weekly-report

# Force resend after fixing configuration (e.g. I4 console-fallback trap)
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://growthcrew.fly.dev/api/cron/weekly-report?force=1"
```

In-product equivalents: Settings → Integrations → reconnect a platform; Settings → **Sync now** for a single-org manual sync.

## 5. Post-recovery verification checklist

1. Cron endpoint returned 200 (or 207 with an explained, resolved `errors[]`).
2. Audit log shows fresh `sync.platform` entries per live platform and, for report incidents, `weekly_report.emailed` with the expected provider (not `console`).
3. Settings → Integrations shows no `needsReconnect` warnings.
4. Dashboard shows `Live account data` with a refreshed last-sync time.
5. Regenerated report shows `dataSource: live` and totals that match the source platform for the period.

## 6. Customer-evidence rules after an incident

- Never share a report or dashboard screenshot produced during or before a known sync gap without re-verifying against the source platform.
- `sandbox`, `demo`, `mixed`, and `none` outputs are test data. After cleanup of test rows, regenerate the report before sharing.
- If a customer received a report backed by stale data, correct it proactively with the regenerated report and the incident window. The audit log is the source of truth for what was sent and when.

## 7. Escalation

- Operator handles: reconnects, manual syncs, force resends, scheduler re-registration.
- Escalate to engineering (Fox Command) when: errors persist after reconnect, `207` errors name no recognizable cause, audit log is missing entries for runs that returned 200, or any response suggests cross-organization data (stop sharing immediately).
- Fayez Required (external, cannot be fixed in code): production scheduler registration, `CRON_SECRET` / `RESEND_API_KEY` / OAuth provider credentials, and the verified sender domain for outbound email.

## 8. Source files reviewed

`apps/worker/src/index.ts` · `apps/web/app/api/cron/sync/route.ts` · `apps/web/server/cron/weekly-report.ts` · `packages/agents/src/cron.ts` · `packages/agents/src/services/sync.ts` · `packages/agents/src/services/reports.ts` · `packages/agents/src/services/connection-health.ts` · `packages/agents/src/services/oauth.ts` · `packages/agents/src/live.ts` · `packages/integrations/src/retry.ts` · `packages/integrations/src/errors.ts` · `fly.toml` · `CUSTOMER_READINESS.md`

If any of these files change, re-verify this runbook in the same review.
