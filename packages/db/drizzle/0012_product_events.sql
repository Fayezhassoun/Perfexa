-- First-party product analytics events (Fox Biz Phase 2 retention metrics).
-- NOTE: deliberately a NEW table, not the IMMUTABLE audit_logs — product
-- telemetry is higher-frequency, includes client-emitted UI events, and must
-- not pollute the user-visible audit trail. Idempotent (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS "product_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_id" uuid,
  "event" text NOT NULL,
  "props" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_events_org_created_idx" ON "product_events" ("org_id", "created_at" DESC);
