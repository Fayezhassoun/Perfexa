# GrowthCrew Liquid Glass second-pass assignment

Repo: `/Users/fox/growthcrew`  
Current base commit: `b542b6d design: apply professional liquid glass to GrowthCrew`  
Primary spec: `GROWTHCREW_LIQUID_GLASS_REDESIGN.md`

You are the second coding/design agent. Codex already implemented the first Professional Liquid Glass pass. Your job is not to redo it blindly. Your job is to independently audit, tighten, and finalize the product UI.

## Objective

Make GrowthCrew feel more professional, more premium, and more coherent in the same **Liquid Voice Pro** style:

- calm light-first Liquid Glass
- executive blue as primary
- cyan reserved for voice/listening/audio states
- readable operational dashboards and tables
- strong voice-console hierarchy
- no loud purple/cyan toy gradients
- no decorative blur that reduces clarity

## Required workflow

1. Inspect current git diff / latest commit.
2. Read:
   - `GROWTHCREW_LIQUID_GLASS_REDESIGN.md`
   - `apps/web/app/globals.css`
   - `apps/web/app/page.tsx`
   - `apps/web/app/(app)/layout.tsx`
   - `apps/web/app/(app)/console/page.tsx`
   - `apps/web/app/(app)/dashboard/page.tsx`
   - shared UI components under `apps/web/components/ui/`
3. Run a slop audit against:
   - gradient overload
   - default AI SaaS violet look
   - repeated equal-weight feature grids
   - low-contrast glass
   - busy animation
   - weak page hierarchy
   - too much centered marketing layout inside operational pages
4. Make targeted improvements only where useful.
5. Preserve all auth, org, tRPC, DB, and voice behavior.
6. Do not change API contracts or DB schema.
7. Do not make public/social/ad/campaign external actions.
8. Run verification:
   ```bash
   pnpm --filter @growthcrew/web typecheck
   pnpm --filter @growthcrew/web build
   pnpm build
   ```
9. If checks pass, commit with:
   ```bash
   git add apps/web GROWTHCREW_LIQUID_GLASS_SECOND_PASS_REPORT.md
   git commit -m "design: refine GrowthCrew liquid glass experience"
   ```
10. If blocked, write `GROWTHCREW_LIQUID_GLASS_SECOND_PASS_BLOCKERS.md` with exact command output.

## Expected output file

Create `GROWTHCREW_LIQUID_GLASS_SECOND_PASS_REPORT.md` with:

- summary of improvements
- files changed
- verification command outputs
- remaining concerns
- slop score before / after
- commit hash if committed

## Quality bar

Do not churn files for the sake of activity. The best outcome may be a compact set of high-leverage refinements.

The final UI should pass a 5-second clarity test:

> “GrowthCrew is a voice-first AI marketing team. I can speak a business goal, review a plan, approve safely, and monitor execution.”
