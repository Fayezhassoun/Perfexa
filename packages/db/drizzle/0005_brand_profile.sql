ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_profile" jsonb DEFAULT '{}';
