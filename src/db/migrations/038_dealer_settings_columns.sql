-- Migration 038: Add missing settings columns to dealers table
-- Required by PUT /api/admin/settings and the Settings page
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS tagline TEXT;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS primary_color TEXT;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS secondary_color TEXT;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS accent_color TEXT;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS business_hours JSONB;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS social JSONB;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS font_family TEXT;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS title_template TEXT;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS webhook_url TEXT;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS webhook_events JSONB;
