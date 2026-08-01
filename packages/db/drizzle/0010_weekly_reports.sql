CREATE TABLE IF NOT EXISTS "weekly_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "week_start" timestamp NOT NULL,
  "content_json" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weekly_reports_org_week_idx" ON "weekly_reports" ("org_id", "week_start" DESC);
