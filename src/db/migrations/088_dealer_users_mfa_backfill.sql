-- 088_dealer_users_mfa_backfill.sql
--
-- Backfill the MFA columns on dealer_users. Migrations 020_mfa.sql and
-- 035_dealer_users.sql add these, but they never applied to production (the
-- migration chain is broken at 055, so post-055 columns ship out-of-band).
--
-- Impact: the admin login query in src/lib/auth.ts selects mfa_enabled (and the
-- MFA-verify step selects mfa_secret / mfa_backup_codes). With the columns
-- missing, that SELECT throws "column mfa_enabled does not exist" and EVERY
-- real dealer login fails with a generic "Invalid email or password" -- even
-- with a correct password. mfa_enabled DEFAULT false means existing users keep
-- password-only login; nothing is forced into MFA.
--
-- Idempotent: safe to run repeatedly.

ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[];
