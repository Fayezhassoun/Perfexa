# Perfexa Command OS rebuild

## Goal
Turn Perfexa from a feature inventory into a premium performance-marketing operating system. This is a structural product-surface rebuild, not another recolor. Preserve every existing feature, route, API, auth flow, database contract, and approval boundary.

## Evidence from audit
- Public promise is abstract and lacks a concrete product artifact.
- Authenticated nav exposes roughly 24 equal-weight destinations.
- Dashboard stacks too many competing narratives and cards.
- Demo, sandbox, mixed, live, and unavailable states are truthful but fragmented.
- Glass/card treatment is global and flattens hierarchy.
- Console already contains the strongest command workflow but is not the product home.
- Alerts and creative health diagnose issues without routing them into a unified decision queue.

## Product model
Center the experience on:

**Connect → Diagnose → Decide → Approve → Report**

Primary surfaces:

1. **Command** — the home operating view: current truth state, top risk, top opportunity, next approval, latest evidence/report, and a single next action.
2. **Signals** — consolidated alerts, campaign health, creative fatigue, competitors, reviews, and AI visibility, ranked by decision priority.
3. **Studio** — content, social, video, inspiration, and other creative artifacts under one creation surface. Video remains available, but does not look like a separate product pillar.
4. **Evidence** — reports, client portal, source provenance, and audit trail.
5. **Context** — one business context/brand context area, eliminating duplicate mental models where possible without changing backend schemas.
6. **Settings** — integrations, budgets, team, notifications, billing, model/usage, and advanced configuration.

Existing routes must remain reachable through grouped navigation, secondary menus, tabs, drawers, or contextual links. Do not delete routes or features.

## Scope of implementation

### A. Authenticated information architecture
- Refactor `apps/web/components/app-nav.tsx` into grouped workflow navigation with 5-6 primary destinations.
- Refactor `apps/web/components/mobile-nav.tsx` to use the same groups and a compact More sheet.
- Keep low-frequency routes such as Admin, Audit log, Agents, Knowledge, Memory, and advanced settings accessible but secondary.
- Make `/dashboard` the Command Center. If the existing console is the stronger command experience, connect the Command Center to it clearly without breaking either route.
- Do not alter route handlers or tRPC router names.

### B. Command Center
Refactor `apps/web/app/(app)/dashboard/page.tsx` presentation and composition so the first viewport answers:

- Is the workspace using demo, sandbox, mixed, or live data?
- What is the most important risk right now?
- What is the best opportunity or next move?
- Is anything waiting for approval?
- What evidence/report was produced most recently?

Use existing queries and data. Do not invent metrics. Keep real empty/demo states explicit. Secondary summaries can remain below the fold or link to Signals, Studio, and Evidence.

Add/reuse semantic presentation components where useful:
- `SystemTruthBar`
- `DecisionQueue`
- `SignalSummary`
- `ApprovalQueue`
- `EvidenceCard`
- `EmptyState`

Every recommendation must remain read-only or approval-gated exactly as before.

### C. Signals and decision closure
- Preserve `/alerts`, `/creatives`, `/campaigns`, `/competitors`, `/reviews`, and `/visibility`.
- Add contextual links/actions that route a diagnosis into the appropriate existing proposal, console, studio, or approval path.
- Do not execute spend, publishing, pausing, or other external actions automatically.
- If a true action cannot be wired safely, label it as review-only and route to the existing safe surface.

### D. Studio consolidation
- Keep `/video`, `/content`, `/social`, and `/inspiration` working.
- Present them as Studio sub-surfaces in navigation and cross-links.
- Preserve the current honest provider states for Video Studio. Do not claim live AI generation/editing while the provider is unconfigured.

### E. Public proof and positioning
Update `apps/web/app/page.tsx`, pricing, metadata, and relevant shared marketing components so the public promise is concrete:

> Connect read-only ad accounts. Get an approval-ready performance report every week.

Add an honest, clearly labeled sample artifact above or near the fold:
- sample weekly report excerpt
- source/provenance label such as `Sample data · not customer evidence`
- example approval row or signal-to-decision sequence

Do not add fake testimonials, logos, metrics, customer names, or claims of live results. Resolve the free-beta versus planned pricing ambiguity visibly.

### F. Design system
- Consolidate `apps/web/app/globals.css` into semantic Perfexa roles.
- Introduce solid semantic surfaces for core data. Glass/blur may remain for navigation chrome and transient overlays, but must not be the default `Card` treatment.
- Update `apps/web/components/ui/card.tsx` and shared components carefully so tables, forms, reports, and dashboards gain hierarchy rather than a global visual break.
- Reduce global hover transforms, shimmer, glow, and decorative motion.
- Define a small typography scale. Use uppercase eyebrows sparingly.
- Preserve accessible focus states, contrast, reduced-motion behavior, and mobile usability.
- Rename internal CSS/DOM brand classes from `growthcrew-*` to `perfexa-*` only where safe; do not rename API fields or package imports in this pass.

### G. Accessibility and quality
- Fix label/input associations on touched forms.
- Improve custom tabs/switches only where touched; do not introduce dependencies.
- Ensure navigation has clear active state and accessible names.
- At phone width, preserve access to all primary workflows without a wall of 24 links.

## Hard constraints
- No backend, DB, auth, provider, or API contract changes.
- No dependency additions.
- No fake/demo data presented as live evidence.
- No public campaign or social actions.
- No deployment from a dirty worktree.
- Do not touch unrelated untracked planning files.
- Do not commit during implementation; coordinator will inspect and commit.
- No em dashes in new user-facing copy.

## Verification
Run and report real output:
1. `corepack pnpm typecheck`
2. Relevant web and agent tests
3. `corepack pnpm --filter @growthcrew/web build`
4. `git diff --check`
5. Local runtime checks for `/`, `/pricing`, `/login`, `/register`, `/dashboard`, `/console`, `/alerts`, `/reports`, `/video`.
6. Verify unauthenticated protected-route redirects.
7. Static scan confirms no new fake proof, no customer-facing stale GrowthCrew text, and no changed tRPC/API identifiers.

## Definition of done
- The first authenticated viewport is a prioritized operating view, not a feature dump.
- Navigation is workflow-driven while every old route remains reachable.
- Public page proves the product with a labeled artifact, not decorative cards.
- Core data surfaces are semantic and readable; glass is not universal.
- Tests/build pass and runtime routes behave correctly.
- Final report separates implemented/reverified behavior from any unverified provider capability.
