# GrowthCrew Professional Liquid Glass Redesign

Status: build-ready implementation brief  
Repo: `/Users/fox/growthcrew`  
App: `apps/web`  
Target product: GrowthCrew — voice-first AI marketing team SaaS  
Design direction: Professional Liquid Glass, adapted from MVASDaddy `Liquid Ops Pro`, but calmer and more executive.

## 0. Product intent

GrowthCrew should feel like a premium voice-first AI marketing operating system for small business owners and marketing teams.

The user says one clear business need. GrowthCrew turns it into plans, specialists, campaigns, content, leads, reviews, and weekly reporting — with approval gates before spend or public action.

The UI should communicate:

> “Speak naturally. Review clearly. Approve safely. Your AI marketing team executes with control.”

## 1. Visual direction

### Style name

**Liquid Voice Pro**

A professional Liquid Glass cockpit for voice-led marketing work.

### What to keep from the current app

- GrowthCrew brand name.
- Voice-first positioning.
- Mic / waveform motif.
- Approval gate safety message.
- Existing route structure, data fetching, tRPC usage, auth, org switching, and forms.
- Light/dark support.

### What to change

The current visual language is too playful / saturated for the final product:

- It leans too hard on violet/cyan gradient.
- Some glass is decorative instead of structural.
- The app shell is visually interesting but not yet executive-grade.
- Public landing has too much generic “feature card” energy.
- Dashboard pages need more operational density and page-specific hierarchy.
- `apps/web/app/globals.css` appears partially malformed / layered; consolidate it rather than adding another CSS layer.

Upgrade to:

- calm light-first professional glass
- restrained indigo/blue primary accent
- subtle cyan only for voice/audio states
- white/translucent panels with real border/shadow hierarchy
- less animation, more readability
- tighter app shell, stronger page headers, better content lanes
- premium SaaS polish without “AI gradient sludge”

## 2. Surface archetypes

Use these archetypes. Do not give every page the same hero/card grid.

| Surface | Routes | Composition rule |
|---|---|---|
| Decide / Learn | `/`, `/login`, `/register` | clear narrative, one core promise per section, premium product preview |
| Configure | `/onboarding`, `/settings`, `/leads/forms`, `/f/[formId]` | step cards, validation, minimal decoration |
| Command / Inspect | `/console`, `/agents/[id]`, `/proposals/[id]` | voice input, conversation, right-side proposal/inspection panel |
| Monitor | `/dashboard`, `/campaigns`, `/social`, `/reviews`, `/leads`, `/content`, `/competitors`, `/knowledge`, `/audit`, `/admin` | dense headers, KPIs, tables/lists, filters, evidence states |
| Operate | `/proposals`, `/agents` | action queue, approval states, capability cards |

## 3. Design system rules

### Palette

Light mode primary:

```css
--background: 220 40% 98%;
--foreground: 224 32% 8%;
--primary: 224 88% 56%;      /* executive blue */
--voice: 190 82% 46%;        /* cyan only for waveform/listening */
--success: 158 64% 40%;
--warning: 38 92% 48%;
--danger: 350 72% 48%;
```

Dark mode:

```css
--background: 224 32% 5%;
--foreground: 220 24% 96%;
--primary: 220 94% 68%;
--voice: 188 92% 56%;
```

Rules:

- Avoid purple/violet as the dominant product color.
- Use cyan only for microphone, waveform, live listening, voice transcript, or speaking states.
- Use blue for primary actions and selected nav.
- Use green/amber/red only for operational status.
- Keep gradients subtle and radial, not loud rainbow bands.

### Background

Use a soft layered professional backdrop:

- light: `#f7f9fc`, faint blue/cyan radial fields, subtle grid/noise optional
- dark: deep navy/graphite, subdued blue/cyan glows
- no aggressive full-page animated mesh
- respect `prefers-reduced-motion`

### Glass hierarchy

Create/repair these utility classes in `apps/web/app/globals.css`:

- `.glass-panel` — primary cards and large surfaces
- `.glass-elevated` — modals, sidebars, topbars
- `.glass-tile` — nested rows/metric boxes
- `.glass-chip` — pills, filters, badges
- `.glass-input` — input/select/textarea styling
- `.liquid-shell` — full-page background wrapper
- `.liquid-topbar` — sticky translucent bar
- `.liquid-sidebar` — app nav sidebar
- `.voice-orb` — mic control / audio centerpiece
- `.voice-wave` — waveform treatment

Blur discipline:

- Sidebars/topbars: 24–36px blur.
- Cards: 16–24px blur.
- Nested tiles: 8–14px blur.
- Tables: prefer readable tinted rows over heavy blur.

### Typography

Use existing installed fonts:

- Display: `Space Grotesk Variable` or SF Pro Display, but less quirky than current.
- Body: `DM Sans Variable` / system UI.
- Numbers: tabular numerals.

Rules:

- Page h1: 28–36px inside app, 56–72px on landing.
- Labels: uppercase only for small metadata, not everywhere.
- Avoid huge monument stats unless they drive a decision.

### Motion

- Keep waveform / mic states alive.
- Reduce global fade/slide animations.
- Hover lifts should be subtle: `translateY(-1px)` max for operational surfaces.
- Disable non-essential motion under `prefers-reduced-motion`.

## 4. Exact repo targets

### Design/tokens/shared shell

- `apps/web/app/globals.css`
- `apps/web/tailwind.config.ts`
- `apps/web/components/ui/card.tsx`
- `apps/web/components/ui/button.tsx`
- `apps/web/components/ui/input.tsx`
- `apps/web/components/ui/textarea.tsx`
- `apps/web/components/ui/select.tsx`
- `apps/web/components/ui/badge.tsx`
- `apps/web/components/ui/table.tsx`
- `apps/web/app/layout.tsx`
- `apps/web/app/providers.tsx`

### Public and auth surfaces

- `apps/web/app/page.tsx`
- `apps/web/components/landing-command-flow.tsx`
- `apps/web/app/login/page.tsx`
- `apps/web/app/register/page.tsx`
- `apps/web/app/onboarding/page.tsx`
- `apps/web/app/f/[formId]/page.tsx`
- `apps/web/app/f/[formId]/public-form.tsx`

### Authenticated shell and core app

- `apps/web/app/(app)/layout.tsx`
- `apps/web/components/app-nav.tsx`
- `apps/web/components/org-switcher.tsx`
- `apps/web/app/(app)/console/page.tsx`
- `apps/web/components/console/proposal-card.tsx`
- `apps/web/app/(app)/dashboard/page.tsx`
- `apps/web/app/(app)/proposals/page.tsx`
- `apps/web/app/(app)/proposals/[id]/page.tsx`
- `apps/web/app/(app)/agents/page.tsx`
- `apps/web/app/(app)/agents/[id]/page.tsx`

### Operational pages

- `apps/web/app/(app)/campaigns/page.tsx`
- `apps/web/app/(app)/social/page.tsx`
- `apps/web/app/(app)/content/page.tsx`
- `apps/web/app/(app)/competitors/page.tsx`
- `apps/web/app/(app)/reviews/page.tsx`
- `apps/web/app/(app)/leads/page.tsx`
- `apps/web/app/(app)/leads/forms/page.tsx`
- `apps/web/app/(app)/knowledge/page.tsx`
- `apps/web/app/(app)/audit/page.tsx`
- `apps/web/app/(app)/settings/page.tsx`
- `apps/web/app/(app)/admin/page.tsx`

## 5. Implementation order

### Phase 1 — repair/consolidate visual system

1. Read all UI components and `globals.css` before editing.
2. Fix malformed CSS if present. Do not leave broken braces or orphan token declarations.
3. Replace current noisy glass tokens with professional Liquid Voice Pro tokens.
4. Add reusable page shell helpers:
   - `page-shell`
   - `page-header`
   - `section-grid`
   - `metric-card`
   - `data-panel`
   - `status-chip`
5. Ensure Button/Card/Input/Table components use the new tokens without breaking call sites.

Acceptance:

- CSS parses.
- Tailwind build sees all classes.
- Existing pages still render.

### Phase 2 — public landing page

Surface: Decide / Learn.

Rewrite `/` as premium but simple:

1. Floating glass nav.
2. Split hero: left copy, right live voice/product preview.
3. Hero message:
   - “Your AI marketing team, one sentence away.”
   - Explain speak → plan → approve → execute.
4. Product preview must show real product mechanics:
   - voice brief capture
   - specialist plan proposed
   - approval gate
   - budget guardian
5. Replace generic 4-card specialist grid with a more composed “team bench” or command-flow board.
6. Add trust/safety band: approval before spend, audit log, sandbox mode.
7. Keep CTAs: `/register`, `/login`.

Acceptance:

- 5-second clarity test: visitor understands voice-first AI marketing team.
- Not too flashy. Looks credible enough for a business owner to trust.

### Phase 3 — authenticated app shell

Surface: Monitor / Command.

Update:

- sidebar: narrower, cleaner, grouped nav if needed
- topbar: org context, search/command affordance if existing patterns allow
- nav active state: blue liquid pill, no distracting dot-only indicator
- content area: max readable width on detail pages, full width on dashboards
- mobile: no regressions

Acceptance:

- App feels like one coherent product, not pages inside a decorative backdrop.

### Phase 4 — voice console

Surface: Command / Inspect.

This is the product heart. Redesign carefully.

Composition:

- left: conversation history / threads
- center: chat + voice input
- right or inline: pending proposal cards / approval queue when available
- empty state: voice orb + example command, not generic hero

Rules:

- Voice mic state should feel premium, tactile, safe.
- Proposal cards must make approval/rejection obvious.
- Keep text input parity. No mic-only dependence.
- Preserve all tRPC behavior and voice hooks.

Acceptance:

- User can immediately understand where to speak/type and where to approve.

### Phase 5 — dashboards and operational routes

Surface: Monitor / Operate.

For these pages, do not make them marketing pages. Make them work surfaces.

Patterns:

- consistent page header: title, subtitle, actions
- KPI cards with compact labels
- glass data panels for charts/tables
- cards become evidence/action modules, not decorative tiles
- empty states explain next action clearly
- tables readable over glass: high contrast rows, no overblur

Apply to routes listed in section 4.

### Phase 6 — auth/onboarding/forms

Surface: Configure.

- login/register: premium centered glass panel, no clutter
- onboarding: stepper/wizard feel, progress clear
- public lead form: trustworthy minimal form, mobile-first, no heavy effects

### Phase 7 — verification and commit

Run:

```bash
pnpm --filter @growthcrew/web typecheck
pnpm --filter @growthcrew/web build
pnpm build
```

If full monorepo build fails because of pre-existing service/env/database requirements, still run the web build and document exact blocker in `GROWTHCREW_LIQUID_GLASS_BLOCKERS.md`.

If verification passes:

```bash
git status --short
git diff --stat
git commit -am "design: apply professional liquid glass to GrowthCrew"
```

If new files are created, add them explicitly.

## 6. Hard constraints

- Do not remove auth/session/org-switching logic.
- Do not change API contracts or DB schema for a design-only task.
- Do not make public posting, ad spend, or live campaign changes.
- Do not introduce new paid dependencies unless absolutely necessary.
- Do not hide broken pages behind a polished landing page.
- Do not use fake claims/testimonials.
- Do not use MVASDaddy copy/branding inside GrowthCrew.
- Do not make the design a loud purple/cyan toy. It must be professional.

## 7. Slop audit before final

Score the final UI against these tells:

1. tech gradient overload
2. default violet SaaS look
3. equal-weight feature-tile grid everywhere
4. colored accent rails pretending to organize content
5. unearned blur
6. fake monument stats
7. icon topper repetition
8. centered stack everywhere
9. default typography with no hierarchy
10. wrong surface composition

Target score: 2/10 or lower.

If score is above 2, fix before committing.

## 8. Final report expected from coding agent

Return:

- files changed
- build/typecheck output
- any routes not redesigned and why
- slop score
- commit hash if committed
- blockers if any
