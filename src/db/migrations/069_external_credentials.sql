-- Migration 069: BYO external credentials (Carfax/AutoCheck/KBB/vAuto/MMR/Plaid/Edmunds)
--
-- Stream A of the 2026-05-12 parallel feature push. Replaces mocked market-intel
-- data with real per-dealer credentials via a BYO ("bring your own") pattern.
--
--   - dealer_external_credentials : the encrypted credential blob per (dealer, provider, label)
--   - external_credential_audit   : append-only history of add/rotate/revoke actions
--
-- All blobs are AES-256-GCM ciphertext emitted by src/lib/external-credentials/crypto-vault.ts
-- which routes through src/lib/crypto/ (named-algorithm registry per CLAUDE.md). Never store
-- plaintext credential payloads. RLS enabled per migration 055 enforcement pattern.

-- ============================================================================
-- 1. dealer_external_credentials
-- ============================================================================
CREATE TABLE IF NOT EXISTS dealer_external_credentials (
  id                            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id                     UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  provider                      TEXT         NOT NULL
                                  CHECK (provider IN (
                                    'kbb',
                                    'vauto',
                                    'mmr',
                                    'carfax',
                                    'autocheck',
                                    'plaid',
                                    'edmunds'
                                  )),
  label                         TEXT,
  -- AES-256-GCM ciphertext + IV (per src/lib/external-credentials/crypto-vault.ts).
  -- Storing as BYTEA so the column survives binary-safe round-trips.
  credential_blob_encrypted     BYTEA        NOT NULL,
  credential_iv                 BYTEA        NOT NULL,
  status                        TEXT         NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'revoked', 'rotating')),
  created_at                    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  rotated_at                    TIMESTAMPTZ,
  last_used_at                  TIMESTAMPTZ,
  last_error                    TEXT
);

-- Uniqueness: one credential per (dealer, provider, label). Label is NULLABLE; treat
-- NULL as the "default" credential — Postgres unique indexes treat NULLs as distinct so
-- we use COALESCE-based partial uniqueness to enforce a single default per (dealer, provider).
CREATE UNIQUE INDEX IF NOT EXISTS uq_dealer_external_credentials_default
  ON dealer_external_credentials (dealer_id, provider)
  WHERE label IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dealer_external_credentials_labeled
  ON dealer_external_credentials (dealer_id, provider, label)
  WHERE label IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dealer_external_credentials_dealer_provider
  ON dealer_external_credentials (dealer_id, provider, status);

ALTER TABLE dealer_external_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dealer_external_credentials_tenant ON dealer_external_credentials;
CREATE POLICY dealer_external_credentials_tenant ON dealer_external_credentials
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 2. external_credential_audit (append-only history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS external_credential_audit (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id       UUID         NOT NULL REFERENCES dealer_external_credentials(id) ON DELETE CASCADE,
  dealer_id           UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  action              TEXT         NOT NULL
                        CHECK (action IN ('added', 'rotated', 'revoked', 'used', 'use_failed')),
  actor_user_id       TEXT,
  details             JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_credential_audit_credential
  ON external_credential_audit (credential_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_credential_audit_dealer
  ON external_credential_audit (dealer_id, created_at DESC);

ALTER TABLE external_credential_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_credential_audit_tenant ON external_credential_audit;
CREATE POLICY external_credential_audit_tenant ON external_credential_audit
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 3. Final ASSERT — fail loudly if either table is missing.
-- ============================================================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM (
    SELECT 'dealer_external_credentials' AS t WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'dealer_external_credentials'
    )
    UNION ALL SELECT 'external_credential_audit' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'external_credential_audit'
    )
  ) AS missing_tables;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 069 failed -- missing tables: %', missing;
  END IF;
END $$;
