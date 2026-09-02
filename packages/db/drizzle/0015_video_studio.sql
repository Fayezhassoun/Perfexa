-- Perfexa Video Studio: add edit-mode fields and org-scoped create idempotency.
ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "mode" text DEFAULT 'generate' NOT NULL;
--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "cta_brief" text;
--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "source_url" text;
--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "edit_instructions" text;
--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "trim_start_sec" integer;
--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "trim_end_sec" integer;
--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "overlay_text" text;
--> statement-breakpoint
ALTER TABLE "video_jobs" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_jobs_org_idempotency_unique" ON "video_jobs" ("org_id", "idempotency_key");
