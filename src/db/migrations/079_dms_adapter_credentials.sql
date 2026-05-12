-- Migration 079: DMS adapter credentials
--
-- Per-dealer encrypted credentials for the Wolfpack Assistant DMS adapter
-- framework (src/lib/dms-adapters/). The overlay product reads/writes to
-- whatever DMS the dealer is on; this table holds the credentials per
-- (dealer, provider) so the adapter registry can resolve runtime adapters.
--
-- Encryption: AES-256-GCM via src/lib/external-credentials/crypto-vault.ts
-- (the same vault used by migration 069's dealer_external_credentials).
-- credential_blob_encrypted stores ciphertext || authTag(16); credential_iv
-- stores the 12-byte GCM nonce. Both are BYTEA so round-trips are
-- binary-safe.
--
-- Capability set is stored as JSONB so the dealer-admin UI can render the
-- subset of operations the adapter supports without round-tripping to the
-- adapter binary. The adapter remains the source of truth at execution
-- time, but the JSONB snapshot speeds up dashboard reads.
--
-- RLS enforces tenant isolation at the DB layer (mirrors migration 055).
-- The route layer is the primary gate; RLS is defense-in-depth.
--
-- Idempotent: every CREATE uses IF NOT EXISTS. Re-running this migration
-- is a no-op. Ends with a final ASSERT that fails loudly if the table is
-- missing.

BEGIN;

-- ============================================================================
-- dms_adapter_credentials — encrypted per-dealer adapter credentials
-- ============================================================================
CREATE TABLE IF NOT EXISTS dms_adapter_credentials (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id                   UUID         NOT NULL,
  provider                    TEXT         NOT NULL
                                CHECK (provider IN (
                                  'mock',
                                  'cox_vauto',
                                  'dealersocket',
                                  'cdk',
                                  'reynolds',
                                  'dealertrack',
                                  'dealercenter'
                                )),
  -- AES-256-GCM ciphertext + IV per src/lib/external-credentials/crypto-vault.ts.
  -- Nullable so the dealer-admin UI can pre-register an adapter before
  -- credentials are actually supplied (status='pending').
  credential_blob_encrypted   BYTEA,
  credential_iv               BYTEA,
  status                      TEXT         DEFAULT 'pending'
                                CHECK (status IN (
                                  'pending',
                                  'active',
                                  'failed',
                                  'revoked',
                                  'rotating'
                                )),
  last_used_at                TIMESTAMPTZ,
  last_error                  TEXT,
  -- What the adapter can actually do (read_inventory, write_deals, etc.).
  -- Snapshot of adapter.capabilities at registration time; refreshed when
  -- the adapter is rotated. Used by the UI to render capability badges.
  capability_set              JSONB,
  created_at                  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (dealer_id, provider)
);

-- Indexes mirror the access patterns from src/lib/dms-adapters/adapter-registry.ts.
CREATE INDEX IF NOT EXISTS dms_adapter_credentials_dealer_idx
  ON dms_adapter_credentials (dealer_id);
CREATE INDEX IF NOT EXISTS dms_adapter_credentials_provider_status_idx
  ON dms_adapter_credentials (provider, status);

-- ============================================================================
-- updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION dms_adapter_credentials_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'dms_adapter_credentials_updated_at'
  ) THEN
    CREATE TRIGGER dms_adapter_credentials_updated_at
    BEFORE UPDATE ON dms_adapter_credentials
    FOR EACH ROW EXECUTE FUNCTION dms_adapter_credentials_set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- Row-level security — dealer-scoped, mirrors migration 055 + 069 pattern.
-- ============================================================================
ALTER TABLE dms_adapter_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dms_adapter_credentials_dealer ON dms_adapter_credentials;
CREATE POLICY dms_adapter_credentials_dealer ON dms_adapter_credentials
  USING (dealer_id::text = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- Row-count assertion (log only — never fail the migration).
-- ============================================================================
DO $$
DECLARE
  row_count INT;
BEGIN
  SELECT COUNT(*) INTO row_count FROM dms_adapter_credentials;
  RAISE NOTICE '[migration 079] dms_adapter_credentials rows: %', row_count;
END $$;

-- ============================================================================
-- Final ASSERT — fail loudly if the table is missing.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'dms_adapter_credentials'
  ) THEN
    RAISE EXCEPTION 'Migration 079 failed -- missing table: dms_adapter_credentials';
  END IF;
END $$;

COMMIT;
