-- Migration 035: dealer_users table for per-dealer admin access
-- Each dealer can have multiple admin users with role-based access.

CREATE TABLE IF NOT EXISTS dealer_users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner','admin','manager','staff')),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_dealer_users_dealer ON dealer_users(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_users_email ON dealer_users(email);

-- Backfill the MFA columns that migration 020 *would* have added if it
-- had run after this one. On a fresh CI/test DB, 020 skips (no table
-- yet) so we add the columns here. On an established DB, 020 already
-- ran and these become idempotent no-ops.
ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[];
