CREATE TABLE IF NOT EXISTS "portal_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "config" jsonb DEFAULT '{}'::jsonb,
  "enabled" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "portal_configs_org_id_unique" UNIQUE("org_id")
);

CREATE TABLE IF NOT EXISTS "portal_share_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "token" text NOT NULL,
  "label" text,
  "scopes" jsonb DEFAULT '["dashboard"]'::jsonb,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "portal_share_links_token_unique" UNIQUE("token")
);
