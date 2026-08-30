# GrowthCrew Delivery Ledger

This is the operating record for every GrowthCrew task. New work must be added before implementation and closed only with evidence.

## Product standard

GrowthCrew is a premium, dependable marketing operations SaaS platform. The first durable customer promise is:

```text
read-only account connection → trusted signals → clear decisions → branded weekly report
```

## Ledger rules

- One row/entry per task, including small fixes.
- Never mark `released` from an agent claim alone.
- Attach commit, tests, deployment revision, and live evidence.
- Record external blockers under **Fayez Required** rather than hiding them.
- No silent demo fallback for live customer workflows.

## Current baseline

| ID | Task | Status | Evidence / owner |
|---|---|---|---|
| GC-001 | Authentication and onboarding | verification | Repo tests/build; Fox Command |
| GC-002 | Read-only integration state handling | released | Commit `434b37b`; integration UI tests |
| GC-003 | Customer-readiness hardening and data-source labeling | staged | Commit `ee59b69`; 413 tests, typecheck, build; live deploy verified |
| GC-004 | Real ad-account connection and first weekly report | blocked | Requires real pilot account; Fayez |
| GC-005 | Production weekly sync/report observation | planned | Requires real connected account and scheduled proof |
| GC-006 | Incident/recovery runbook for sync and report failures | staged | `docs/RUNBOOK_SYNC_REPORT.md`; typecheck/tests/build pass; Fox Command + Cline |
| GC-007 | Premium customer support and service-level definition | planned | Fayez decision |

## Task entries

### GC-006 — Incident/recovery runbook for sync and report failures
- Status: staged
- Date opened: 2026-08-30
- Customer outcome: A pilot operator can detect, diagnose, and recover from sync and weekly-report failures without engineering help, and never presents stale or sandbox data as customer evidence after an incident.
- Owner: Fox Command
- Implementation agent: Cline
- Dependencies: GC-003 (customer-readiness hardening, staged); production scheduler/secrets remain Fayez Required for live operation
- Fayez Required: confirm the external scheduler is registered for `/api/cron/sync` and `/api/cron/weekly-report`; confirm `CRON_SECRET` and `RESEND_API_KEY` in the production environment
- Scope/files/routes: `docs/RUNBOOK_SYNC_REPORT.md` (new), `docs/DELIVERY_LEDGER.md` (this entry). No application code changed.
- Data sources and contracts: Verified against `apps/worker/src/index.ts`, `apps/web/app/api/cron/sync/route.ts`, `apps/web/server/cron/weekly-report.ts`, `packages/agents/src/services/sync.ts`, `packages/agents/src/services/reports.ts`, `packages/agents/src/services/connection-health.ts`, `packages/agents/src/live.ts`, `packages/integrations/src/retry.ts`, `fly.toml`, and `CUSTOMER_READINESS.md`.
- Acceptance criteria:
  - [x] Runbook covers: cron sync failure (401/207), per-platform isolation, token expiry/refresh/reconnect, weekly-report skip/error paths, email-provider fallback and its idempotency interaction, worker/Redis degradation, missing external scheduler
  - [x] Every detection signal and recovery step maps to a real code path or configuration verified in the repo
  - [x] Manual recovery commands are idempotent and read-only; no spend/publish/delete path introduced
  - [x] Post-incident customer-evidence rules stated (dataSource banner, last-sync, audit log)
  - [ ] Production scheduler registration confirmed (Fayez, external)
- Failure/degraded behavior: This task is documentation-only; it changes no runtime behavior.
- Security/privacy impact: No secrets, tokens, or account identifiers in the document; runbook instructs operators to use `flyctl secrets` and never place credentials in chat, tickets, or reports.
- Tests and commands: `pnpm typecheck`, `pnpm test`, `pnpm build`, `git diff --check` — results recorded under Evidence.
- Evidence: 2026-08-30 local run — `pnpm typecheck` pass (7 workspace projects); `pnpm test` pass (agents 237/237 across 31 files, web 14/14 across 2 files, integrations/db suites pass); `pnpm build` pass including the Next.js production build; `git diff --check` clean. Documentation-only change; no runtime behavior altered. Runbook claims verified against the source files listed in the entry.
- Commit: `docs: add growthcrew sync/report incident runbook` (the commit containing this entry)
- Deployment/revision: none — documentation only, no deploy
- Rollback/recovery: revert the task commit
- Risks: Documentation drift if sync/report code changes without updating the runbook; mitigated by listing the source files above as the review checklist.
- Next action/owner: Fox Command to review; Fayez to confirm production scheduler + secrets; then move to staged.

## Task entry template

```markdown
### GC-XXX — <task name>
- Status: planned | specified | building | verification | staged | released | blocked | rejected | retired
- Date opened:
- Customer outcome:
- Owner:
- Implementation agent:
- Dependencies:
- Fayez Required:
- Scope/files/routes:
- Data sources and contracts:
- Acceptance criteria:
  - [ ]
- Failure/degraded behavior:
- Security/privacy impact:
- Tests and commands:
- Evidence:
- Commit:
- Deployment/revision:
- Rollback/recovery:
- Risks:
- Next action/owner:
```

## Fayez Required

- [ ] Connect one real read-only ad account.
- [ ] Confirm first design partner.
- [ ] Review dashboard values against the source platform.
- [ ] Review the first customer report before sending it.
- [ ] Confirm pilot pricing, support level, and report promise.
- [ ] Supply secure OAuth/email configuration where required.

## Release gate

GrowthCrew cannot be called customer-ready until GC-004 and GC-005 have real evidence, not just passing tests.
