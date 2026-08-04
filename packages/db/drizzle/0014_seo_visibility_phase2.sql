-- Visibility Phase 2 (GROWTHCREW_VISIBILITY_PHASE2.md).
-- seo_audits: one technical SEO audit run per org/site. "truncated" marks a
--             run that hit the 5-minute cap — stored findings are real but partial.
-- seo_findings: one row per deterministic check outcome (no LLM, no paid APIs);
--             every number in the Site health UI traces back to these rows.
-- content_plans: 30/60/90 calendar closing GEO visibility gaps. Unique
--             (org_id, prompt_id, horizon) makes plan generation idempotent.
CREATE TABLE IF NOT EXISTS "seo_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "site_url" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "truncated" boolean DEFAULT false NOT NULL,
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_findings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "audit_id" uuid NOT NULL REFERENCES "seo_audits"("id"),
  "category" text NOT NULL,
  "severity" text NOT NULL,
  "code" text NOT NULL,
  "message" text NOT NULL,
  "detail" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "horizon" integer NOT NULL,
  "prompt_id" uuid REFERENCES "geo_prompts"("id"),
  "title" text NOT NULL,
  "brief" jsonb,
  "status" text DEFAULT 'idea' NOT NULL,
  "due_date" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_audits_org_created_idx" ON "seo_audits" ("org_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_findings_audit_category_idx" ON "seo_findings" ("audit_id", "category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_plans_org_created_idx" ON "content_plans" ("org_id", "created_at" DESC);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_plans_org_prompt_horizon_unique" ON "content_plans" ("org_id", "prompt_id", "horizon");
