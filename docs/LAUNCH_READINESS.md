# Perfexa launch readiness

Status: launch-readiness improvements prepared for review. This is not production launch approval.

## This change

- First-report guidance is visible on the dashboard. It requires a healthy real OAuth ad connection, live data, and a live latest report. Simulation, demo, mixed data, analytics-only accounts, and failed connections cannot complete the guide.
- Workspace search supports keyboard navigation, Enter, Escape, and Cmd/Ctrl K, using the existing routes and feature visibility.
- Returning users land on the dashboard. Sign-in network failures recover without leaving the form stuck. Signup displays the selected plan and free-beta terms; failure to sign in after account creation routes to login.
- Registration creates the user, organization, and owner membership in one transaction. A failed membership insert rolls back the entire registration.
- Public wording identifies the current snapshot reporting window and the permanent live-write block during this pilot. Internal Gate-1 terminology is removed from the touched public screens.
- Missing pages and route errors offer recovery actions.
- CI now checks web and model tests and the production build as well as existing integration/agent tests and typechecks.

## Validation

- Local production build: passed, 51 static pages generated.
- Web regression suite: passed, 33 tests in 6 files.
- Integration suite: previously passed in this task, 138 tests.
- Model suite: previously passed in this task, 32 tests.
- CI evidence: the first run was green despite the database suite failing to initialize (missing libicuuc.so.60). This is not a passing database result. CI now uses a dedicated PostgreSQL service and rejects missing, empty, or incomplete test reports.
- Database suite: could not run locally because embedded PostgreSQL rejects root and this environment cannot switch user. GitHub CI must validate the database suite, including the new transaction rollback test. A zero process exit from the local harness did not mean those tests ran.
- Browser checks: homepage navigation, pricing FAQ, and Agency plan handoff to signup verified against the self-contained production build. Full authenticated and mobile visual checks remain outstanding.
- Real provider OAuth, customer account reconciliation, scheduled email delivery, and full authenticated browser journey remain unverified.

## Required before accepting launch customers

| Gate | Evidence needed | Owner |
| --- | --- | --- |
| Release quality | Clean CI on the exact commit and completed code review | Engineering |
| First customer journey | Register, complete onboarding, connect, sync, generate and inspect a report, sign out and return successfully | Engineering + founder |
| Provider connection | Real read-only account, approved OAuth configuration and callbacks, token renewal/reconnect exercised | Deployment operator |
| Reporting accuracy | Match account ID, snapshot window, currency, spend and conversions against provider UI; do not describe snapshots as weekly changes | Founder + engineering |
| Sharing | Verify only intended content in a signed-out report link; validate revocation and tenant separation | Engineering |
| Delivery and operations | Successful scheduled report delivery; monitoring, backups/restore and support contact verified | Deployment operator |
| Commercial readiness | Confirm actual billing behavior, terms, privacy information, account recovery and support before paid self-service launch | Founder |

The current report implementation uses provider snapshots, typically about 30 days. True seven-day reporting and comparable prior-period analysis need an explicit implementation and reconciliation pass. Existing currency presentation also needs verification before serving non-USD or mixed-currency accounts.

Live ad mutations stay blocked even after approval. Approval records a team decision; it does not authorize Perfexa to execute live account changes during this release.
