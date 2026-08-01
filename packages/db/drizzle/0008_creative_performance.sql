CREATE TABLE IF NOT EXISTS "creative_performance" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "campaign_id" uuid REFERENCES "campaigns_mirror"("id"),
  "creative_id" text NOT NULL,
  "platform" text,
  "headline" text,
  "image_url" text,
  "impressions" integer DEFAULT 0,
  "clicks" integer DEFAULT 0,
  "spend_cents" integer DEFAULT 0,
  "conversions" integer DEFAULT 0,
  "frequency" real DEFAULT 0,
  "ctr" real DEFAULT 0,
  "snapshot_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
