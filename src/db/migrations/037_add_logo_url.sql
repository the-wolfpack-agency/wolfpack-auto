-- Migration 037: Add logo_url column to dealers table
-- Stores base64 data URL for dealer logo (uploaded via Settings > Branding)
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS logo_url TEXT;
