-- Migration 082: E-commerce adapter credentials
--
-- Per-tenant encrypted credentials for the Wolfpack Assistant Platform's
-- e-commerce adapter framework (src/lib/ecommerce-adapters/). Year-2 retail
-- vertical foundation per docs/wolfpack-platform-multivertical-2026-05-12.md.
-- The overlay product reads/writes to whatever e-commerce stack the tenant
-- is on (Shopify, BigCommerce, Adobe Commerce, Klaviyo, Attentive, Meta Ads,
-- Google Ads); this table holds the credentials per (tenant, provider) so
-- the adapter registry can resolve runtime adapters.
--
-- Mirrors migration 079 (DMS adapter credentials) exactly. Same shape,
-- e-commerce providers instead of DMS providers, tenant_id instead of
-- dealer_id (vertical-agnostic naming for retail tenants).
--
-- Encryption: AES-256-GCM via src/lib/external-credentials/crypto-vault.ts
-- (the same vault used by migrations 069 + 079). Single auditable cipher
-- surface across DMS + e-commerce + BYO credentials.
--
-- Capability set is stored as JSONB so the tenant-admin UI can render the
-- subset of operations the adapter supports without round-tripping to the
-- adapter binary. The adapter remains the source of truth at execution
-- time, but the JSONB snapshot speeds up dashboard reads.
--
-- RLS enforces tenant isolation at the DB layer (mirrors migrations 055 + 079).
-- The route layer is the primary gate; RLS is defense-in-depth. The policy
-- keys on `app.current_dealer_id` (legacy GUC name reused for vertical-
-- agnostic tenancy — same context variable, retail callers set it to their
-- tenant_id).
--
-- Idempotent: every CREATE uses IF NOT EXISTS. Re-running this migration
-- is a no-op. Ends with a final ASSERT that fails loudly if the table is
-- missing.

BEGIN;

-- ============================================================================
-- ecommerce_adapter_credentials — encrypted per-tenant adapter credentials
-- ============================================================================
CREATE TABLE IF NOT EXISTS ecommerce_adapter_credentials (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID         NOT NULL,
  provider                    TEXT         NOT NULL
                                CHECK (provider IN (
                                  'mock_shop',
                                  'shopify',
                                  'bigcommerce',
                                  'adobe_commerce',
                                  'klaviyo',
                                  'attentive',
                                  'meta_ads',
                                  'google_ads'
                                )),
  -- AES-256-GCM ciphertext + IV per src/lib/external-credentials/crypto-vault.ts.
  -- Nullable so the tenant-admin UI can pre-register an adapter before
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
  -- What the adapter can actually do (read_products, write_campaign_draft, etc.).
  -- Snapshot of adapter.capabilities at registration time; refreshed when
  -- the adapter is rotated. Used by the UI to render capability badges.
  capability_set              JSONB,
  created_at                  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (tenant_id, provider)
);

-- Indexes mirror the access patterns from
-- src/lib/ecommerce-adapters/adapter-registry.ts.
CREATE INDEX IF NOT EXISTS ecommerce_adapter_credentials_tenant_idx
  ON ecommerce_adapter_credentials (tenant_id);
CREATE INDEX IF NOT EXISTS ecommerce_adapter_credentials_provider_status_idx
  ON ecommerce_adapter_credentials (provider, status);

-- ============================================================================
-- updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION ecommerce_adapter_credentials_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'ecommerce_adapter_credentials_updated_at'
  ) THEN
    CREATE TRIGGER ecommerce_adapter_credentials_updated_at
    BEFORE UPDATE ON ecommerce_adapter_credentials
    FOR EACH ROW EXECUTE FUNCTION ecommerce_adapter_credentials_set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- Row-level security — tenant-scoped, mirrors migration 055 + 069 + 079 pattern.
-- The GUC name `app.current_dealer_id` is reused as a vertical-agnostic tenant
-- context (set by tenant-resolver.ts on every request).
-- ============================================================================
ALTER TABLE ecommerce_adapter_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ecommerce_adapter_credentials_tenant ON ecommerce_adapter_credentials;
CREATE POLICY ecommerce_adapter_credentials_tenant ON ecommerce_adapter_credentials
  USING (tenant_id::text = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- Row-count assertion (log only — never fail the migration).
-- ============================================================================
DO $$
DECLARE
  row_count INT;
BEGIN
  SELECT COUNT(*) INTO row_count FROM ecommerce_adapter_credentials;
  RAISE NOTICE '[migration 082] ecommerce_adapter_credentials rows: %', row_count;
END $$;

-- ============================================================================
-- Final ASSERT — fail loudly if the table is missing.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'ecommerce_adapter_credentials'
  ) THEN
    RAISE EXCEPTION 'Migration 082 failed -- missing table: ecommerce_adapter_credentials';
  END IF;
END $$;

COMMIT;
