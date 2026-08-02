CREATE TABLE IF NOT EXISTS "report_shares" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "share_id" text NOT NULL,
  "report_id" uuid NOT NULL REFERENCES "weekly_reports"("id"),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "brand_name" text NOT NULL,
  "brand_color" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp,
  CONSTRAINT "report_shares_share_id_unique" UNIQUE("share_id")
);
