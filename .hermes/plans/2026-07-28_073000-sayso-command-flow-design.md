# Sayso Command-Flow Design Release Plan

> **For Hermes:** Execute the public-landing slice first; do not redesign authenticated product routes in the same release.

**Goal:** Make Sayso’s differentiator legible in the first viewport: a user speaks a brief, specialists form a plan, and nothing acts without explicit approval.

**Architecture:** Replace the static transcript with a transparent, clearly illustrative command-flow preview built from presentational React components. Keep the existing Liquid Glass tokens and page structure. The preview is not connected to live agents or customer data and must say so.

**Tech stack:** Next.js 14, React Server Components, Tailwind, lucide-react, existing Liquid Glass CSS tokens.

## Current facts
- The landing page is live at `https://sayso.fly.dev` and has a coherent Liquid Glass visual language.
- The hero currently uses a static chat snippet. It proves chat, not Sayso’s operating model.
- Production LLM mode is `mock`; public copy must not imply autonomous campaign launch or live outcomes.
- Customer-facing rebrand is complete. Legacy `voxmarketer` strings remain only in local development scripts/database names.

## Release 1 — public command-flow proof
1. Extract the hero demonstration into a focused `LandingCommandFlow` component.
2. Show four visual stages: voice brief, transcription, specialists form a plan, approval gate.
3. Include motion that is subtle, deterministic, and honors `prefers-reduced-motion`.
4. Label it as an illustrative product preview—not a real-time customer result.
5. Replace outcome-forward copy (“campaigns live”) with truthful approval-first language.
6. Keep the current specialist cards but make their relationship to the flow obvious.
7. Add component-level testable markup/ARIA labels where practical.

## Release 2 — authenticated product consistency
1. Audit dashboard, voice console, proposals, agent views, and settings at desktop/mobile using an authenticated test account.
2. Establish shared page-header, KPI, approval-status, empty-state, and activity-feed patterns.
3. Make the Console’s generated plan and approval boundary visually match the landing command flow.
4. Replace any generic beta/placeholder treatment with truthful product-state labels.
5. Test real conversation flow before changing promise copy.

## Files likely to change in Release 1
- Create: `apps/web/components/landing-command-flow.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify only if needed: `apps/web/app/globals.css`
- Create or update: focused component/page test following repository test conventions

## Validation
- `npm run typecheck`
- `npm run build`
- `git diff --check`
- Playwright screenshot at 1440px and mobile width; check legibility, hierarchy, no overflow, reduced-motion behavior.
- Deploy only after independent visual review; retain previous Fly release as rollback.

## Risks and guardrails
- Do not simulate non-existent ad performance, real customer results, account connections, or active campaign execution.
- Do not broaden into dashboard redesign in this release.
- Do not change auth, database, LLM provider, integrations, or deployment configuration.
- Hero proof must be clearer, not denser. A stranger should understand speak → plan → approve in five seconds.
