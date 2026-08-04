-- GEO / AI Visibility module (GROWTHCREW_GEO_VISIBILITY.md Phase 1).
-- geo_prompts: tracked questions (cap of 60 active per org enforced in code).
-- geo_runs: one scan run per org; "engines" records which engines were ACTUALLY
--           queried (honesty rail — never show an engine as tracked without one).
-- geo_results: one row per prompt x engine; every metric traces back to these.
-- NOTE: "trigger" is a SQL reserved word — always double-quoted.
CREATE TABLE IF NOT EXISTS "geo_prompts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "text" text NOT NULL,
  "category" text,
  "position" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "status" text DEFAULT 'pending' NOT NULL,
  "trigger" text DEFAULT 'manual' NOT NULL,
  "engines" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error" text,
  "started_at" timestamp,
  "finished_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "geo_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "geo_runs"("id"),
  "prompt_id" uuid NOT NULL REFERENCES "geo_prompts"("id"),
  "engine" text NOT NULL,
  "brand_mentioned" boolean DEFAULT false NOT NULL,
  "brand_rank" integer,
  "answer_excerpt" text,
  "citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "competitor_mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sentiment" text,
  "parse_failed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_prompts_org_idx" ON "geo_prompts" ("org_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_runs_org_created_idx" ON "geo_runs" ("org_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "geo_results_run_prompt_idx" ON "geo_results" ("run_id", "prompt_id");
