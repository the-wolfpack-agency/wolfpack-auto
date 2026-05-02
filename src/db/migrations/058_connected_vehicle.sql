-- Migration 058: Connected-Vehicle Telemetry Intake
--
-- Tier-1 feature: ingest OBD-II / connected-car webhooks from telematics
-- providers, store events as a high-volume time-series, and emit predictive
-- maintenance leads (oil_change/brake/battery/tires/DTC/recall/mileage).
--
-- Tables:
--   connected_vehicles            — VIN + customer + dealer + provider link
--   vehicle_telemetry_events      — high-volume signal events (time-series)
--   predictive_maintenance_leads  — actionable opportunities for the dealer
--   telemetry_provider_credentials — per-dealer per-provider HMAC + signing keys
--   telemetry_ingestion_log       — operational visibility (last event, errors)
--
-- All idempotent (CREATE … IF NOT EXISTS) and RLS-scoped by dealer_id, mirroring
-- migration 055. Webhook ingest sets app.current_dealer_id from the resolved
-- provider credentials, NOT from a JWT.

-- ============================================================================
-- 1. connected_vehicles — VIN + customer + dealer + provider device link
-- ============================================================================
CREATE TABLE IF NOT EXISTS connected_vehicles (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id            UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  customer_id          UUID         NOT NULL,
  vin                  TEXT         NOT NULL,
  provider             TEXT         NOT NULL
                         CHECK (provider IN ('samsara', 'geotab', 'oem_native', 'aftermarket')),
  provider_device_id   TEXT         NOT NULL,
  connected_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_seen_at         TIMESTAMPTZ,
  active               BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_device_id)
);

CREATE INDEX IF NOT EXISTS idx_connected_vehicles_dealer
  ON connected_vehicles (dealer_id, active, connected_at DESC);
CREATE INDEX IF NOT EXISTS idx_connected_vehicles_vin
  ON connected_vehicles (vin);
CREATE INDEX IF NOT EXISTS idx_connected_vehicles_customer
  ON connected_vehicles (dealer_id, customer_id);

ALTER TABLE connected_vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS connected_vehicles_tenant ON connected_vehicles;
CREATE POLICY connected_vehicles_tenant ON connected_vehicles
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 2. vehicle_telemetry_events — high-volume time-series of signals
--
-- Column order is partition-friendly: (dealer_id, recorded_at) leading the
-- table means a future range-partition on recorded_at + sub-partition on
-- dealer_id is a low-impact ALTER. Today this is a plain table; once volume
-- requires it the queries are unchanged.
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_telemetry_events (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id             UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  connected_vehicle_id  UUID         NOT NULL REFERENCES connected_vehicles(id) ON DELETE CASCADE,
  vin                   TEXT         NOT NULL,
  recorded_at           TIMESTAMPTZ  NOT NULL,
  signal_type           TEXT         NOT NULL
                          CHECK (signal_type IN (
                            'odometer','fault_code','fuel_level','tire_pressure',
                            'battery','oil_life','brake_wear','location','other'
                          )),
  value                 NUMERIC,
  value_text            TEXT,
  raw_payload           JSONB        NOT NULL DEFAULT '{}'::jsonb,
  provider              TEXT         NOT NULL,
  provider_event_id     TEXT,
  ingested_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Per-VIN time-series scan (latest-N-by-signal queries used by the rule engine)
CREATE INDEX IF NOT EXISTS idx_telemetry_events_vin_recorded
  ON vehicle_telemetry_events (vin, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_signal_recorded
  ON vehicle_telemetry_events (signal_type, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_dealer_recorded
  ON vehicle_telemetry_events (dealer_id, recorded_at DESC);

-- Idempotency: same (provider, provider_event_id) must dedupe to one row.
-- Partial unique index excludes the NULL case so providers that don't send
-- a stable event id can still insert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_telemetry_events_provider_eventid
  ON vehicle_telemetry_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

ALTER TABLE vehicle_telemetry_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicle_telemetry_events_tenant ON vehicle_telemetry_events;
CREATE POLICY vehicle_telemetry_events_tenant ON vehicle_telemetry_events
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 3. predictive_maintenance_leads — one row per actionable opportunity
-- ============================================================================
CREATE TABLE IF NOT EXISTS predictive_maintenance_leads (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id                UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  vin                      TEXT         NOT NULL,
  customer_id              UUID         NOT NULL,
  lead_type                TEXT         NOT NULL
                             CHECK (lead_type IN (
                               'oil_change','brake_service','tire_replacement',
                               'battery_replacement','recall','general_dtc',
                               'mileage_milestone'
                             )),
  urgency                  TEXT         NOT NULL
                             CHECK (urgency IN ('immediate','soon','scheduled','monitoring')),
  confidence               NUMERIC      NOT NULL DEFAULT 0.5
                             CHECK (confidence >= 0 AND confidence <= 1),
  evidence_event_ids       TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  suggested_action         TEXT         NOT NULL,
  estimated_revenue_cents  BIGINT       NOT NULL DEFAULT 0,
  status                   TEXT         NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open','contacted','scheduled','completed','dismissed')),
  dismissal_reason         TEXT,
  outcome                  TEXT,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  dismissed_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pm_leads_dealer_status
  ON predictive_maintenance_leads (dealer_id, status, urgency, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pm_leads_vin
  ON predictive_maintenance_leads (vin, status, created_at DESC);
-- Dedupe lookup: "open lead of this type+urgency for this VIN in last 30 days"
CREATE INDEX IF NOT EXISTS idx_pm_leads_dedupe
  ON predictive_maintenance_leads (vin, lead_type, urgency, status, created_at DESC);

ALTER TABLE predictive_maintenance_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS predictive_maintenance_leads_tenant ON predictive_maintenance_leads;
CREATE POLICY predictive_maintenance_leads_tenant ON predictive_maintenance_leads
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 4. telemetry_provider_credentials — per-dealer per-provider secrets
--
-- Secrets stored encrypted at rest via the symmetric helpers in
-- src/lib/crypto.ts (the lib does the wrap/unwrap; the column just holds
-- the ciphertext). Mirrors how outbound webhooks store signing keys.
-- ============================================================================
CREATE TABLE IF NOT EXISTS telemetry_provider_credentials (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id                UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  provider                 TEXT         NOT NULL
                             CHECK (provider IN ('samsara','geotab','oem_native','aftermarket')),
  webhook_secret_encrypted TEXT         NOT NULL,
  signing_key_encrypted    TEXT,
  active                   BOOLEAN      NOT NULL DEFAULT TRUE,
  rotated_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (dealer_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_creds_provider_active
  ON telemetry_provider_credentials (provider, active);

ALTER TABLE telemetry_provider_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS telemetry_provider_credentials_tenant ON telemetry_provider_credentials;
CREATE POLICY telemetry_provider_credentials_tenant ON telemetry_provider_credentials
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 5. telemetry_ingestion_log — operational visibility per provider per dealer
-- ============================================================================
CREATE TABLE IF NOT EXISTS telemetry_ingestion_log (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id             UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  provider              TEXT         NOT NULL,
  last_success_at       TIMESTAMPTZ,
  last_success_event_id TEXT,
  error_count_24h       INTEGER      NOT NULL DEFAULT 0,
  total_events          BIGINT       NOT NULL DEFAULT 0,
  last_error_at         TIMESTAMPTZ,
  last_error_text       TEXT,
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (dealer_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_log_dealer
  ON telemetry_ingestion_log (dealer_id, provider);

ALTER TABLE telemetry_ingestion_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS telemetry_ingestion_log_tenant ON telemetry_ingestion_log;
CREATE POLICY telemetry_ingestion_log_tenant ON telemetry_ingestion_log
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 6. updated_at triggers (mirror migration 052/056 pattern)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_column') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'connected_vehicles_updated_at') THEN
      CREATE TRIGGER connected_vehicles_updated_at
        BEFORE UPDATE ON connected_vehicles
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pm_leads_updated_at') THEN
      CREATE TRIGGER pm_leads_updated_at
        BEFORE UPDATE ON predictive_maintenance_leads
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'telemetry_creds_updated_at') THEN
      CREATE TRIGGER telemetry_creds_updated_at
        BEFORE UPDATE ON telemetry_provider_credentials
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'telemetry_log_updated_at') THEN
      CREATE TRIGGER telemetry_log_updated_at
        BEFORE UPDATE ON telemetry_ingestion_log
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 7. Final assertion — every table created, RLS on, every index present.
-- Fails LOUD if a re-run finds the schema partially applied.
-- ============================================================================
DO $$
DECLARE
  missing_tables TEXT[] := ARRAY[]::TEXT[];
  t TEXT;
  required_tables TEXT[] := ARRAY[
    'connected_vehicles',
    'vehicle_telemetry_events',
    'predictive_maintenance_leads',
    'telemetry_provider_credentials',
    'telemetry_ingestion_log'
  ];
BEGIN
  FOREACH t IN ARRAY required_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      missing_tables := array_append(missing_tables, t);
    END IF;
    -- RLS must be enabled on every new table
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relrowsecurity = false
    ) THEN
      RAISE EXCEPTION 'Migration 058 ASSERT failed: table % missing ROW LEVEL SECURITY', t;
    END IF;
  END LOOP;

  IF array_length(missing_tables, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 058 ASSERT failed: missing tables %', missing_tables;
  END IF;
END $$;
