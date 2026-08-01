# SPEC: Brand DNA / Voice Memory

## Goal
Every organization gets a structured brand profile that the AI orchestrator uses to ground ALL responses, copy generation, and campaign proposals. This replaces generic marketing advice with on-brand, context-aware output.

## Schema Change
Add to `packages/db/src/schema/app.ts` (or wherever organizations table is defined):

```sql
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_profile jsonb DEFAULT '{}';
```

The `brand_profile` JSON shape:
```typescript
interface BrandProfile {
  companyName?: string;
  tagline?: string;
  industry?: string;
  targetAudience?: string;        // "SMB owners in MENA, 25-45"
  voiceTone?: string;             // "Professional but warm, never salesy"
  brandColors?: string[];         // ["#1a73e8", "#ffffff"]
  doList?: string[];              // ["Use data-driven language", "Reference ROI"]
  dontList?: string[];            // ["Never use exclamation marks", "No jargon"]
  competitors?: string[];         // ["Madgicx", "AdAmigo"]
  usp?: string;                   // "Only AI team that handles ads + content + reporting"
  website?: string;
  products?: string[];            // key products/services
  pastWins?: string[];            // "3x ROAS for ecom client in Q1"
}
```

## Drizzle Migration
Create `packages/db/drizzle/0005_brand_profile.sql`:
```sql
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_profile" jsonb DEFAULT '{}';
```

## Service Layer
In `packages/agents/src/services/` create `brand.ts`:

```typescript
export async function getBrandProfile(ctx: AgentContext): Promise<BrandProfile>
export async function updateBrandProfile(ctx: AgentContext, profile: Partial<BrandProfile>): Promise<BrandProfile>
```

## Orchestrator Integration
In `packages/agents/src/orchestrator.ts`, before building the LLM call:
1. Load `org.brand_profile`
2. Inject into system prompt as a `## Brand Context` section
3. Format: "You are the AI marketing team for {companyName}. Their brand voice is {voiceTone}. They target {targetAudience}. Never: {dontList}. Always: {doList}."

This means EVERY conversation response is grounded in the brand.

## tRPC Router
Add to `apps/web/server/trpc/router/settings.ts` (or create `brand.ts` router):

```typescript
brand: {
  get: orgProcedure.query(...)
  update: orgProcedure.input(z.object({...partial brand profile...})).mutation(...)
}
```

## UI (minimal for now)
Add a "Brand Profile" section to the settings page:
- Company name, tagline, industry
- Target audience (textarea)
- Voice & tone (textarea)
- Do / Don't lists (tag inputs)
- USP (textarea)
- Save button → calls `settings.brand.update`

## Tests
- Unit test: orchestrator includes brand context in system prompt when profile exists
- Unit test: orchestrator works normally when profile is empty (backward compat)
- Integration test: update brand profile via tRPC, verify next conversation uses it

## Acceptance Criteria
- [ ] Migration runs cleanly
- [ ] `brand_profile` column exists on organizations
- [ ] tRPC get/update works
- [ ] Orchestrator system prompt includes brand context
- [ ] Empty profile = no change to existing behavior
- [ ] Settings UI renders and saves
