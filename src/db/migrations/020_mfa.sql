-- Migration 020: TOTP MFA fields for dealer_users
-- Adds mfa_secret (encrypted TOTP base32 secret), mfa_enabled flag,
-- and mfa_backup_codes (array of SHA-256 hashed backup codes).

ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[];
