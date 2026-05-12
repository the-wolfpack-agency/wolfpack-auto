-- Migration 081: Touchpoint events + registrations
--
-- Vertical-agnostic physical-world scan handler framework. Records every
-- QR / NFC / RFID / iBeacon / webhook scan event, plus the per-tenant
-- mapping from a touchpoint identifier to an assistant action.
--
-- Year-1 use case (automotive): a dealer prints a QR code on the
-- windshield of every vehicle. A customer scans the QR, an event lands
-- here, and the assistant fires the registered action
-- (e.g. inventory.feature_vehicle for that VIN). Year-2 retail mirrors
-- the same shape: BBB prints a QR on a receipt -> customer scan -> a
-- feedback-survey action fires.
--
-- RLS keys on tenant_id (the renamed dealer_id), mirroring migration 055.
-- The route layer is the primary gate; RLS is defense-in-depth.
--
-- Idempotent: every CREATE uses IF NOT EXISTS / IF NOT EXISTS. Re-running
-- this migration is a no-op. Ends with a final ASSERT that fails loudly
-- if either table is missing.

BEGIN;

-- ============================================================================
-- touchpoint_events -- scan events recorded by the dispatcher
-- ============================================================================
CREATE TABLE IF NOT EXISTS touchpoint_events (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID         NOT NULL,
  touchpoint_type        TEXT         NOT NULL
                            CHECK (touchpoint_type IN ('qr','nfc','rfid','beacon','webhook')),
  touchpoint_id          TEXT         NOT NULL,
  -- Decoded payload -- shape is touchpoint-type-specific. Validated by the
  -- handler before insert.
  payload                JSONB,
  -- Populated when the scanner is a logged-in customer; null for anonymous.
  customer_id            UUID,
  -- Coarse fingerprint (ip + ua hash) so dup-suppression can still match
  -- anonymous scans without exposing raw IP.
  device_fingerprint     TEXT,
  scanned_at             TIMESTAMPTZ  DEFAULT NOW(),
  action_triggered_slug  TEXT,
  outcome                TEXT
                            CHECK (outcome IN (
                              'action_triggered',
                              'no_match',
                              'duplicate_suppressed',
                              'rate_limited',
                              'error'
                            )),
  outcome_detail         TEXT,
  ip_address             INET,
  user_agent             TEXT
);

CREATE INDEX IF NOT EXISTS touchpoint_events_tenant_idx
  ON touchpoint_events (tenant_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS touchpoint_events_touchpoint_idx
  ON touchpoint_events (touchpoint_type, touchpoint_id);
CREATE INDEX IF NOT EXISTS touchpoint_events_customer_idx
  ON touchpoint_events (customer_id)
  WHERE customer_id IS NOT NULL;

ALTER TABLE touchpoint_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS touchpoint_events_tenant ON touchpoint_events;
CREATE POLICY touchpoint_events_tenant ON touchpoint_events
  USING (tenant_id::text = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- touchpoint_registrations -- maps a touchpoint to an assistant action
-- ============================================================================
-- Tenants register their physical touchpoints ahead of time. Example:
-- a dealer prints a QR labelled "vehicle-walkaround-VIN123" and registers
-- it to trigger inventory.feature_vehicle with action_parameters
-- {"vin":"VIN123"}. When the QR is scanned, the dispatcher looks up the
-- (tenant, type, id) tuple and returns the action slug + params for the
-- assistant layer to execute.
CREATE TABLE IF NOT EXISTS touchpoint_registrations (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID         NOT NULL,
  touchpoint_type     TEXT         NOT NULL
                          CHECK (touchpoint_type IN ('qr','nfc','rfid','beacon','webhook')),
  touchpoint_id       TEXT         NOT NULL,
  action_slug         TEXT,
  action_parameters   JSONB,
  label               TEXT,
  active              BOOLEAN      DEFAULT TRUE,
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (tenant_id, touchpoint_type, touchpoint_id)
);

CREATE INDEX IF NOT EXISTS touchpoint_registrations_tenant_idx
  ON touchpoint_registrations (tenant_id);
CREATE INDEX IF NOT EXISTS touchpoint_registrations_lookup_idx
  ON touchpoint_registrations (tenant_id, touchpoint_type, touchpoint_id)
  WHERE active = TRUE;

ALTER TABLE touchpoint_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS touchpoint_registrations_tenant ON touchpoint_registrations;
CREATE POLICY touchpoint_registrations_tenant ON touchpoint_registrations
  USING (tenant_id::text = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- Row-count assertion (log only -- never fail the migration).
-- ============================================================================
DO $$
DECLARE
  events_count        INT;
  registrations_count INT;
BEGIN
  SELECT COUNT(*) INTO events_count FROM touchpoint_events;
  SELECT COUNT(*) INTO registrations_count FROM touchpoint_registrations;
  RAISE NOTICE '[migration 081] touchpoint_events rows: %, touchpoint_registrations rows: %',
    events_count, registrations_count;
END $$;

-- ============================================================================
-- Final ASSERT -- fail loudly if either table is missing.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'touchpoint_events'
  ) THEN
    RAISE EXCEPTION 'Migration 081 failed -- missing table: touchpoint_events';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'touchpoint_registrations'
  ) THEN
    RAISE EXCEPTION 'Migration 081 failed -- missing table: touchpoint_registrations';
  END IF;
END $$;

COMMIT;
