-- Migration 020: TOTP MFA fields for dealer_users
-- Adds mfa_secret (encrypted TOTP base32 secret), mfa_enabled flag,
-- and mfa_backup_codes (array of SHA-256 hashed backup codes).
--
-- Defensive: dealer_users is actually created in migration 035, so on a
-- fresh DB this migration runs BEFORE the table exists. Skip cleanly in
-- that case; migration 035 carries an identical IF NOT EXISTS backfill
-- of the same columns so the schema converges either way.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'dealer_users'
  ) THEN
    ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
    ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[];
  END IF;
END
$$;
