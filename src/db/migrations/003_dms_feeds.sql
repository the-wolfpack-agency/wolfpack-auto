-- Wolfpack Auto — DMS Feed Configuration and Logging
-- Migration: 003_dms_feeds

BEGIN;

-- =============================================================================
-- DMS Feed Configurations (per-dealer provider settings)
-- =============================================================================

CREATE TABLE dms_feed_configs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id             UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL DEFAULT 'CDK',
  endpoint_url          TEXT,
  api_key               TEXT,
  webhook_secret        TEXT,
  poll_interval_minutes INTEGER NOT NULL DEFAULT 60,
  last_sync             TIMESTAMPTZ,
  status                TEXT NOT NULL DEFAULT 'pending_setup',
  column_mapping        JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_provider CHECK (
    provider IN ('CDK', 'REYNOLDS', 'DEALERTRACK', 'TEKION', 'GENERIC_CSV', 'GENERIC_XML')
  ),
  CONSTRAINT valid_status CHECK (
    status IN ('active', 'paused', 'error', 'pending_setup')
  ),
  -- One active config per provider per dealer
  UNIQUE (dealer_id, provider)
);

-- =============================================================================
-- DMS Feed Logs (sync history / audit trail)
-- =============================================================================

CREATE TABLE dms_feed_logs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id          UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL,
  sync_type          TEXT NOT NULL DEFAULT 'full',
  vehicles_received  INTEGER NOT NULL DEFAULT 0,
  vehicles_added     INTEGER NOT NULL DEFAULT 0,
  vehicles_updated   INTEGER NOT NULL DEFAULT 0,
  vehicles_removed   INTEGER NOT NULL DEFAULT 0,
  vehicles_skipped   INTEGER NOT NULL DEFAULT 0,
  error_count        INTEGER NOT NULL DEFAULT 0,
  duration_ms        INTEGER NOT NULL DEFAULT 0,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_sync_type CHECK (
    sync_type IN ('full', 'incremental', 'upload')
  )
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_dms_feed_configs_dealer
  ON dms_feed_configs (dealer_id);

CREATE INDEX idx_dms_feed_configs_dealer_status
  ON dms_feed_configs (dealer_id, status);

CREATE INDEX idx_dms_feed_logs_dealer
  ON dms_feed_logs (dealer_id);

CREATE INDEX idx_dms_feed_logs_dealer_synced
  ON dms_feed_logs (dealer_id, synced_at DESC);

CREATE INDEX idx_dms_feed_logs_provider
  ON dms_feed_logs (provider, synced_at DESC);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE dms_feed_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dms_feed_logs    ENABLE ROW LEVEL SECURITY;

-- DMS Feed Configs
CREATE POLICY dms_feed_configs_tenant_isolation ON dms_feed_configs
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

CREATE POLICY dms_feed_configs_tenant_insert ON dms_feed_configs
  FOR INSERT
  WITH CHECK (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- DMS Feed Logs
CREATE POLICY dms_feed_logs_tenant_isolation ON dms_feed_logs
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

CREATE POLICY dms_feed_logs_tenant_insert ON dms_feed_logs
  FOR INSERT
  WITH CHECK (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Updated-at trigger for dms_feed_configs
-- =============================================================================

CREATE TRIGGER trg_dms_feed_configs_updated_at
  BEFORE UPDATE ON dms_feed_configs
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

COMMIT;
