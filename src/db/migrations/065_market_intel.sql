-- Migration 065: Live Inventory Valuation + Market Intelligence
--
-- Every vehicle in inventory accrues market intelligence over time. Three
-- tables back the feature:
--
--   market_value_snapshots     — point-in-time valuations per provider (NHTSA,
--                                mock-default, KBB partnership when live)
--   vehicle_market_signals     — derived recommendation (HOLD, REPRICE_DOWN,
--                                REPRICE_UP, MOVE_TO_LOT_FRONT, MOVE_TO_BACK_LOT)
--   market_comparable_listings — comparable inventory observed for the same
--                                year/make/model within a configurable radius
--
-- All additive + idempotent (CREATE TABLE IF NOT EXISTS). Every table is
-- dealer-scoped and ENABLE ROW LEVEL SECURITY per the migration 055 bar.
-- Defensive DO blocks guard trigger creation + post-migration assertions.

BEGIN;

-- ============================================================================
-- 1. market_value_snapshots — append-only point-in-time valuations
-- ============================================================================
CREATE TABLE IF NOT EXISTS market_value_snapshots (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id          UUID         NOT NULL,
  dealer_id           UUID         NOT NULL,
  source              TEXT         NOT NULL
                        CHECK (source IN ('mock', 'kbb', 'nhtsa', 'manual', 'comp_median')),
  market_value_cents  BIGINT       NOT NULL CHECK (market_value_cents >= 0),
  condition_grade     TEXT         NOT NULL DEFAULT 'good'
                        CHECK (condition_grade IN ('excellent', 'good', 'fair', 'rough')),
  miles               INTEGER,
  zip_code            TEXT,
  captured_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  raw_payload         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_value_snapshots_vehicle_captured
  ON market_value_snapshots (vehicle_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_value_snapshots_dealer_captured
  ON market_value_snapshots (dealer_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_value_snapshots_source
  ON market_value_snapshots (source, captured_at DESC);

ALTER TABLE market_value_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS market_value_snapshots_tenant ON market_value_snapshots;
CREATE POLICY market_value_snapshots_tenant
  ON market_value_snapshots
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 2. vehicle_market_signals — current recommendation per vehicle
--    Upserted on every refresh. UNIQUE on vehicle_id so the latest row is
--    always the source of truth for the dashboard.
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_market_signals (
  id                            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id                    UUID         NOT NULL UNIQUE,
  dealer_id                     UUID         NOT NULL,
  days_on_lot                   INTEGER      NOT NULL DEFAULT 0 CHECK (days_on_lot >= 0),
  market_velocity_days_median   INTEGER,
  our_price_cents               BIGINT       NOT NULL DEFAULT 0,
  market_value_cents            BIGINT       NOT NULL DEFAULT 0,
  price_delta_cents             BIGINT       NOT NULL DEFAULT 0,
  recommendation                TEXT         NOT NULL DEFAULT 'HOLD'
                                  CHECK (recommendation IN (
                                    'HOLD',
                                    'REPRICE_DOWN',
                                    'REPRICE_UP',
                                    'MOVE_TO_LOT_FRONT',
                                    'MOVE_TO_BACK_LOT'
                                  )),
  confidence                    NUMERIC(4,3) NOT NULL DEFAULT 0.0
                                  CHECK (confidence >= 0 AND confidence <= 1),
  rationale                     TEXT         NOT NULL DEFAULT '',
  comparables_count             INTEGER      NOT NULL DEFAULT 0,
  generated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at                    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_market_signals_vehicle_generated
  ON vehicle_market_signals (vehicle_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_market_signals_dealer_generated
  ON vehicle_market_signals (dealer_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_market_signals_recommendation
  ON vehicle_market_signals (dealer_id, recommendation, generated_at DESC);

ALTER TABLE vehicle_market_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicle_market_signals_tenant ON vehicle_market_signals;
CREATE POLICY vehicle_market_signals_tenant
  ON vehicle_market_signals
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 3. market_comparable_listings — observed comparable listings (mock-default;
--    swap to Cars.com / AutoTrader feed when partnership lands)
-- ============================================================================
CREATE TABLE IF NOT EXISTS market_comparable_listings (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id            UUID         NOT NULL,
  dealer_id             UUID         NOT NULL,
  comp_source           TEXT         NOT NULL
                          CHECK (comp_source IN ('mock', 'cars_com', 'autotrader', 'cargurus', 'manual')),
  comp_vin_or_id        TEXT         NOT NULL,
  comp_year             INTEGER,
  comp_make             TEXT,
  comp_model            TEXT,
  comp_trim             TEXT,
  comp_price_cents      BIGINT       NOT NULL CHECK (comp_price_cents >= 0),
  comp_miles            INTEGER,
  comp_distance_miles   INTEGER,
  comp_dealer_name      TEXT,
  comp_url              TEXT,
  captured_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  raw_payload           JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_comparable_listings_vehicle_captured
  ON market_comparable_listings (vehicle_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_comparable_listings_dealer_captured
  ON market_comparable_listings (dealer_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_comparable_listings_source
  ON market_comparable_listings (comp_source);

ALTER TABLE market_comparable_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS market_comparable_listings_tenant ON market_comparable_listings;
CREATE POLICY market_comparable_listings_tenant
  ON market_comparable_listings
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 4. updated_at trigger on vehicle_market_signals
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_column') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'vehicle_market_signals_updated_at'
    ) THEN
      CREATE TRIGGER vehicle_market_signals_updated_at
        BEFORE UPDATE ON vehicle_market_signals
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 5. Row-count assertion guard — emit notice with current counts so a botched
--    apply is obvious in psql output. Never RAISE EXCEPTION on a count > 0
--    because re-running over an already-populated table is intentional.
-- ============================================================================
DO $$
DECLARE
  snap_count INT;
  sig_count INT;
  comp_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'market_value_snapshots') THEN
    RAISE EXCEPTION 'Migration 065 failed: market_value_snapshots was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'vehicle_market_signals') THEN
    RAISE EXCEPTION 'Migration 065 failed: vehicle_market_signals was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'market_comparable_listings') THEN
    RAISE EXCEPTION 'Migration 065 failed: market_comparable_listings was not created';
  END IF;
  SELECT COUNT(*) INTO snap_count FROM market_value_snapshots;
  SELECT COUNT(*) INTO sig_count FROM vehicle_market_signals;
  SELECT COUNT(*) INTO comp_count FROM market_comparable_listings;
  RAISE NOTICE '[migration 065] market_value_snapshots rows: %', snap_count;
  RAISE NOTICE '[migration 065] vehicle_market_signals rows: %', sig_count;
  RAISE NOTICE '[migration 065] market_comparable_listings rows: %', comp_count;
END $$;

COMMIT;
