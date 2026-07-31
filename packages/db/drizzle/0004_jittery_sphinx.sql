CREATE TABLE IF NOT EXISTS "competitor_ad_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"competitor_id" uuid,
	"advertiser_id" text,
	"advertiser_name" text,
	"region" text,
	"ad_count" integer DEFAULT 0,
	"creatives" jsonb DEFAULT '[]'::jsonb,
	"scanned_at" timestamp DEFAULT now() NOT NULL,
	"raw" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"style" text DEFAULT 'ugc',
	"aspect_ratio" text DEFAULT '9:16',
	"duration_sec" integer DEFAULT 15,
	"status" text DEFAULT 'queued',
	"provider" text DEFAULT 'mock',
	"result_url" text,
	"thumbnail_url" text,
	"cost_cents" integer DEFAULT 0,
	"error" text,
	"approval_id" uuid,
	"created_by_agent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "competitor_ad_scans" ADD CONSTRAINT "competitor_ad_scans_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "competitor_ad_scans" ADD CONSTRAINT "competitor_ad_scans_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "video_jobs" ADD CONSTRAINT "video_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
