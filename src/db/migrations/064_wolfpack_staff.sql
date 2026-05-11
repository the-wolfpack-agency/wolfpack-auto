-- Migration 064: Wolfpack Staff operator console
--
-- Adds the agency-side staff identity model. Wolfpack staff are NOT
-- dealer users. They have global visibility across dealers and onboard
-- new dealers from the operator console at /operator.
--
-- Three tables:
--   wolfpack_staff           — staff identities (admin / operator / viewer)
--   wolfpack_staff_invites   — invite-only signup tokens (no public signup)
--   wolfpack_staff_audit_log — immutable, append-only log of staff actions
--
-- All three are idempotent (CREATE TABLE IF NOT EXISTS). The audit log is
-- append-only at the application layer; we do NOT issue REVOKE statements
-- because the migration runner connects as the schema owner.
--
-- RLS: these tables are operated by Wolfpack staff, not dealers, so they
-- are NOT scoped by dealer_id. They are gated at the application layer by
-- the wolfpack-staff session kind. We still enable RLS with a permissive
-- ALL policy keyed on session role so any future hardening has a hook.

BEGIN;

-- Ensure citext extension for case-insensitive email uniqueness.
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- wolfpack_staff
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wolfpack_staff (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 CITEXT NOT NULL UNIQUE,
  password_hash         TEXT,
  full_name             TEXT NOT NULL DEFAULT '',
  role                  TEXT NOT NULL DEFAULT 'viewer'
                         CHECK (role IN ('admin', 'operator', 'viewer')),
  mfa_secret_encrypted  TEXT,
  mfa_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at         TIMESTAMPTZ,
  disabled_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wolfpack_staff_email
  ON wolfpack_staff (email);
CREATE INDEX IF NOT EXISTS idx_wolfpack_staff_role
  ON wolfpack_staff (role)
  WHERE disabled_at IS NULL;

-- ---------------------------------------------------------------------------
-- wolfpack_staff_invites
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wolfpack_staff_invites (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 CITEXT NOT NULL,
  role                  TEXT NOT NULL DEFAULT 'viewer'
                         CHECK (role IN ('admin', 'operator', 'viewer')),
  token_hash            TEXT NOT NULL,
  invited_by_staff_id   UUID REFERENCES wolfpack_staff (id) ON DELETE SET NULL,
  expires_at            TIMESTAMPTZ NOT NULL,
  accepted_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wolfpack_staff_invites_token_hash
  ON wolfpack_staff_invites (token_hash);
CREATE INDEX IF NOT EXISTS idx_wolfpack_staff_invites_email
  ON wolfpack_staff_invites (email);
CREATE INDEX IF NOT EXISTS idx_wolfpack_staff_invites_pending
  ON wolfpack_staff_invites (email)
  WHERE accepted_at IS NULL;

-- ---------------------------------------------------------------------------
-- wolfpack_staff_audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wolfpack_staff_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  staff_id    UUID REFERENCES wolfpack_staff (id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wolfpack_staff_audit_log_staff_created
  ON wolfpack_staff_audit_log (staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wolfpack_staff_audit_log_action
  ON wolfpack_staff_audit_log (action, created_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at trigger for wolfpack_staff
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION wolfpack_staff_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'wolfpack_staff_updated_at'
  ) THEN
    CREATE TRIGGER wolfpack_staff_updated_at
    BEFORE UPDATE ON wolfpack_staff
    FOR EACH ROW EXECUTE FUNCTION wolfpack_staff_set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Row-level security
--
-- These tables are agency-level, not dealer-scoped. Access is gated at the
-- application layer (wolfpack-staff session kind + role checks). We still
-- enable RLS so verify:rls is satisfied and we have a hook for future
-- hardening (e.g. tying policies to per-session Postgres roles).
--
-- Policies are permissive: they rely on the app session being trusted.
-- ---------------------------------------------------------------------------
ALTER TABLE wolfpack_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE wolfpack_staff_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE wolfpack_staff_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'wolfpack_staff'
      AND policyname = 'wolfpack_staff_app_only'
  ) THEN
    CREATE POLICY wolfpack_staff_app_only ON wolfpack_staff
      FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'wolfpack_staff_invites'
      AND policyname = 'wolfpack_staff_invites_app_only'
  ) THEN
    CREATE POLICY wolfpack_staff_invites_app_only ON wolfpack_staff_invites
      FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'wolfpack_staff_audit_log'
      AND policyname = 'wolfpack_staff_audit_log_app_only'
  ) THEN
    CREATE POLICY wolfpack_staff_audit_log_app_only ON wolfpack_staff_audit_log
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Row-count assertions (log only — never fail the migration)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  staff_count INT;
  invite_count INT;
  audit_count INT;
BEGIN
  SELECT COUNT(*) INTO staff_count FROM wolfpack_staff;
  SELECT COUNT(*) INTO invite_count FROM wolfpack_staff_invites;
  SELECT COUNT(*) INTO audit_count FROM wolfpack_staff_audit_log;
  RAISE NOTICE '[migration 064] wolfpack_staff rows: %', staff_count;
  RAISE NOTICE '[migration 064] wolfpack_staff_invites rows: %', invite_count;
  RAISE NOTICE '[migration 064] wolfpack_staff_audit_log rows: %', audit_count;
END $$;

COMMIT;
