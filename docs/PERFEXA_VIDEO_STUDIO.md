# Perfexa Video Studio: generator + editor

## Goal
Upgrade the existing `/video` route into one coherent Perfexa Video Studio that supports AI video generation and AI-assisted editing while preserving all existing product features, auth, org isolation, approvals, and reporting. Do not create a separate disconnected app.

## Current state
- Web app: `apps/web` in this pnpm monorepo.
- Existing route: `apps/web/app/(app)/video/page.tsx`.
- Existing tRPC router: `apps/web/server/trpc/router/video.ts`.
- Existing service: `packages/agents/src/services/video.ts`.
- Existing adapter: `packages/integrations/src/video.ts`.
- Existing `video_jobs` table and migration already exist.
- Existing implementation is mock-first and generator-only.
- Perfexa rebrand is already committed in `d18f077` and deployed separately.

## Product outcome
Perfexa should present one premium creative workspace with two clear modes:

1. **Generate**: create a new short-form marketing video from a brief.
2. **Edit**: provide a source video URL and natural-language edit brief to create an edit job.

Keep the current Jobs/library view, but make it useful for both generated and edited assets.

## Honest provider behavior
- Preserve provider abstraction. Use the existing FAL integration path for live generation if configured, and extend the adapter interface for edit jobs only when the provider API contract is verified from its official documentation or existing tested code.
- Do not invent a live editor endpoint, response shape, output URL, cost, or completion state.
- If no live provider credential/configuration exists, the UI must say exactly that and offer a clearly labeled offline/demo preview path only if it is already supported. Demo output must never be presented as a real customer asset or real provider result.
- The production app currently has no `FAL_KEY`, `FAL_API_KEY`, `DASHSCOPE_API_KEY`, or `QWEN_API_KEY` secret. Do not add or fabricate secrets. Add configuration/status handling and document the activation requirement.
- Any paid generation/edit action remains approval-gated. Never silently spend money.

## UX requirements

### Studio shell
- Rename the page title to `Video Studio` or `Perfexa Video Studio`.
- Add a compact mode switch: Generate / Edit.
- Keep the existing design system and Perfexa visual language. Do not reintroduce generic gradient-heavy AI UI.
- Show provider state: Demo/offline, Provider not configured, Awaiting approval, Processing, Completed, Failed.
- Make the source of every asset obvious.

### Generate mode
Preserve existing controls:
- Prompt
- Style
- Aspect ratio
- Duration

Add:
- Campaign/use-case field or optional CTA brief if it can be represented without breaking existing API contracts.
- Clear confirmation/approval explanation before any paid provider request.
- Helpful presets for common performance creative briefs, without fake results.

### Edit mode
Add an edit form with:
- Source video URL, validated as an HTTPS URL
- Edit brief/instructions
- Output aspect ratio
- Optional start/end trim values with validation
- Optional caption/overlay text
- Clear statement that source URL upload/storage is not yet supported if that remains the true limitation
- Submit into the same job/approval/library system

If the existing schema needs extension, add a safe idempotent Drizzle migration and update types. Prefer explicit fields (`mode`, `sourceUrl`, `editInstructions`, trim values) over burying everything in an opaque JSON field.

### Library/jobs
- Display both generated and edited jobs.
- Show mode, provider, status, ratio, duration, created time, and source provenance.
- For completed real assets, render a playable `<video controls>` element using the verified result URL.
- For demo/offline assets, use explicit demo labeling and do not imply the URL is a real downloadable customer asset.
- Show clear failed/provider-not-configured errors.
- Do not expose credentials or provider tokens.

## Backend requirements
- Preserve org scoping on every query and mutation.
- Preserve audit logging for create, approval, dispatch, success, and failure.
- Keep idempotency support meaningful; do not accept an idempotency key and then ignore it if the existing contract expects behavior.
- Validate URLs, prompt lengths, duration, ratios, and trim bounds server-side with zod.
- Keep approval state transitions explicit and safe.
- Do not add a client-side provider key or direct paid-provider calls.
- Update the existing adapter only with verified request/response behavior. If editing cannot be wired to a verified provider now, implement the data model and honest unavailable state rather than fake execution.

## Deployment/configuration
- Do not change the Fly app name or deployment URL in this task.
- Do not set or print any secret values.
- If adding non-secret provider config, use `fly.toml`/config defaults only after verifying the provider behavior. Do not add a live provider key.
- Preserve `release_command = "node /app/migrate.cjs"` and ensure any new migration is bundled and applied.

## Verification
Run yourself, not only via an agent:
1. `corepack pnpm typecheck`
2. Relevant package tests, including video service/integration tests.
3. `corepack pnpm --filter @growthcrew/web build`
4. `git diff --check`
5. Start local web server and verify `/video`, `/`, `/pricing`, `/login`, `/register` return expected statuses.
6. Verify unauthenticated protected-route behavior.
7. Inspect the diff for accidental changes to auth, API contracts, data access, secrets, or unrelated untracked files.

## Release gate
- Do not deploy the video feature unless the build, migration, and runtime checks pass.
- A successful UI build is not proof of live AI generation. Final report must distinguish: implemented UI, tested demo/offline path, provider integration status, and live generation/editing status.
- Deployment may use the existing Fly app only after a clean committed worktree and verified revision.
- Never claim the editor is live if provider activation is still missing.

## Final report
Report exact files changed, migrations, supported live/demo states, verification output, deployment revision if deployed, and the one remaining activation step if provider credentials are needed.
