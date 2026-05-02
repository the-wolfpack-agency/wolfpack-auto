-- Migration 057: Cryptographically-signed vehicle history (Carfax-killer)
--
-- Three append-only tables build a tamper-evident provenance ledger per VIN:
--
--   vehicle_provenance_events       Hash-chained per-VIN log. Every row is
--                                   signed; SHA-256 of (prev_hash || canonical
--                                   payload || occurred_at) is the leaf hash.
--                                   Optimistic-lock-aware via prev_hash —
--                                   two writers cannot extend the chain
--                                   simultaneously without one losing.
--
--   vehicle_provenance_anchors      Periodic merkle roots over a contiguous
--                                   range of leaves [range_start_id, range_end_id].
--                                   Anchored root is signed; verifies in O(log n)
--                                   any subset proof for the buyer / 3rd party.
--
--   vehicle_provenance_attestations Signed attestations from external parties
--                                   (mechanic, body shop, OEM dealer) bound to
--                                   a specific event.
--
-- All tables are dealer-scoped + RLS-enforced (clones the 055/056 pattern).
-- Idempotent: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, DO blocks.

-- ============================================================================
-- 1. vehicle_provenance_events  — append-only hash-chained event log per VIN
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_provenance_events (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id             UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  vin                   TEXT         NOT NULL,
  event_type            TEXT         NOT NULL
                          CHECK (event_type IN (
                            'title_transfer',
                            'odometer_reading',
                            'service',
                            'damage',
                            'recall',
                            'inspection'
                          )),
  occurred_at           TIMESTAMPTZ  NOT NULL,
  payload               JSONB        NOT NULL DEFAULT '{}'::jsonb,
  recorded_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  recorded_by_user_id   TEXT,

  -- Hash chain: prev_hash is the this_hash of the previous row for this VIN
  -- (NULL for the genesis row). this_hash is computed in application code as
  -- SHA-256(prev_hash || canonical_json(payload) || occurred_at_iso).
  -- Both stored as lowercase hex strings, 64 chars (256 bits).
  prev_hash             TEXT,
  this_hash             TEXT         NOT NULL,

  -- Detached signature over this_hash. signature_alg is an AlgorithmId from
  -- src/lib/crypto/algorithms.ts (hs256|rs256|es256|ml-dsa-65-hybrid). The
  -- signature is base64url-encoded so it round-trips cleanly through JSON.
  signature_alg         TEXT         NOT NULL,
  signature_b64         TEXT         NOT NULL,
  verifying_key_id      TEXT,

  CONSTRAINT vehicle_provenance_events_this_hash_unique UNIQUE (this_hash),
  CONSTRAINT vehicle_provenance_events_vin_prev_unique  UNIQUE (vin, prev_hash)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_provenance_events_vin_recorded
  ON vehicle_provenance_events (vin, recorded_at);
CREATE INDEX IF NOT EXISTS idx_vehicle_provenance_events_dealer_recorded
  ON vehicle_provenance_events (dealer_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_provenance_events_event_type
  ON vehicle_provenance_events (dealer_id, event_type);

ALTER TABLE vehicle_provenance_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicle_provenance_events_tenant ON vehicle_provenance_events;
CREATE POLICY vehicle_provenance_events_tenant ON vehicle_provenance_events
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 2. vehicle_provenance_anchors  — periodic merkle roots
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_provenance_anchors (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id         UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  vin               TEXT         NOT NULL,
  root_hash         TEXT         NOT NULL,
  range_start_id    UUID         NOT NULL REFERENCES vehicle_provenance_events(id) ON DELETE RESTRICT,
  range_end_id      UUID         NOT NULL REFERENCES vehicle_provenance_events(id) ON DELETE RESTRICT,
  range_count       INTEGER      NOT NULL CHECK (range_count > 0),
  anchored_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  anchor_alg        TEXT         NOT NULL,
  anchor_signature  TEXT         NOT NULL,
  verifying_key_id  TEXT
);

CREATE INDEX IF NOT EXISTS idx_vehicle_provenance_anchors_vin_anchored
  ON vehicle_provenance_anchors (vin, anchored_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_provenance_anchors_dealer_anchored
  ON vehicle_provenance_anchors (dealer_id, anchored_at DESC);

ALTER TABLE vehicle_provenance_anchors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicle_provenance_anchors_tenant ON vehicle_provenance_anchors;
CREATE POLICY vehicle_provenance_anchors_tenant ON vehicle_provenance_anchors
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 3. vehicle_provenance_attestations — signed third-party attestations
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_provenance_attestations (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id           UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  event_id            UUID         NOT NULL REFERENCES vehicle_provenance_events(id) ON DELETE CASCADE,
  vin                 TEXT         NOT NULL,
  attestor_kind       TEXT         NOT NULL
                        CHECK (attestor_kind IN ('mechanic', 'body_shop', 'oem_dealer', 'inspector', 'other')),
  attestor_name       TEXT         NOT NULL,
  attestor_id         TEXT,
  payload             JSONB        NOT NULL DEFAULT '{}'::jsonb,
  attested_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  attestation_alg     TEXT         NOT NULL,
  attestation_sig_b64 TEXT         NOT NULL,
  verifying_key_id    TEXT
);

CREATE INDEX IF NOT EXISTS idx_vehicle_provenance_attestations_event
  ON vehicle_provenance_attestations (event_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_provenance_attestations_vin
  ON vehicle_provenance_attestations (vin, attested_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_provenance_attestations_dealer
  ON vehicle_provenance_attestations (dealer_id, attested_at DESC);

ALTER TABLE vehicle_provenance_attestations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicle_provenance_attestations_tenant ON vehicle_provenance_attestations;
CREATE POLICY vehicle_provenance_attestations_tenant ON vehicle_provenance_attestations
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 4. Final ASSERT — validate column shapes so partial migrations fail loudly
-- ============================================================================
DO $$
BEGIN
  -- vehicle_provenance_events
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_provenance_events' AND column_name = 'this_hash'
  ) THEN
    RAISE EXCEPTION 'Migration 057 invariant: vehicle_provenance_events.this_hash missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_provenance_events' AND column_name = 'signature_b64'
  ) THEN
    RAISE EXCEPTION 'Migration 057 invariant: vehicle_provenance_events.signature_b64 missing';
  END IF;
  -- vehicle_provenance_anchors
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_provenance_anchors' AND column_name = 'root_hash'
  ) THEN
    RAISE EXCEPTION 'Migration 057 invariant: vehicle_provenance_anchors.root_hash missing';
  END IF;
  -- vehicle_provenance_attestations
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vehicle_provenance_attestations' AND column_name = 'attestation_sig_b64'
  ) THEN
    RAISE EXCEPTION 'Migration 057 invariant: vehicle_provenance_attestations.attestation_sig_b64 missing';
  END IF;
END $$;
