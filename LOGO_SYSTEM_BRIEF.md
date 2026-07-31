# GrowthCrew Logo System Pass

## Goal
Create and apply a distinctive GrowthCrew logo system across the Next.js web app. The current repeated Mic icon is too generic. Build an original identity that can stand on its own.

## Brand direction
- Product: GrowthCrew — voice-first AI marketing team SaaS.
- Style: Professional Liquid Glass / Liquid Voice Pro.
- Identity concept: **Voice Orb / Conversational Waveform** — a mark combining a speech aperture, waveform, and small team/orbit cues.
- Must signal: voice command, clear delegation, marketing team, human approval, calm professional control.
- Avoid: generic mic-only logo, chatbot bubble cliché, purple SaaS slop, MVASDaddy visual language, cartoon/mascot tone.

## Required implementation
1. Add reusable brand components under `apps/web/components/brand-mark.tsx` or equivalent.
2. Component API should support:
   - full lockup: mark + wordmark + optional descriptor
   - mark-only icon
   - compact/mobile sizes
   - accessible labels
3. Replace repeated inline GrowthCrew logos in:
   - `apps/web/app/page.tsx` topbar and footer
   - `apps/web/app/(app)/layout.tsx` sidebar and mobile topbar
   - `apps/web/app/login/page.tsx`
   - `apps/web/app/register/page.tsx`
   - `apps/web/app/onboarding/page.tsx` if it has a brand moment
4. Add CSS in `apps/web/app/globals.css` using existing Liquid Voice Pro tokens.
5. Add/update app metadata icons if practical:
   - create `apps/web/app/icon.svg` or `apps/web/app/icon.tsx` if Next supports it here
   - avoid introducing binary assets unless necessary
6. Keep GrowthCrew branding separate from MVASDaddy. No MVASDaddy copy, colors, or marks.

## Logo design requirements
- Hand-authored SVG, crisp at 16/32/48px.
- Light-first but works in dark mode.
- Blue/cyan voice identity; no leftover violet-heavy visual language.
- Premium, friendly, not playful.

## Verification
Run:
- `pnpm --filter @growthcrew/web typecheck`
- `pnpm --filter @growthcrew/web build`
- `pnpm build`
- `git diff --stat`
- search for accidental MVASDaddy references in GrowthCrew web source

Commit changes with message:
`design: add GrowthCrew voice orb logo system`
