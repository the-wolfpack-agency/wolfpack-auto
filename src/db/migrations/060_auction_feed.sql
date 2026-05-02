-- Migration 060: Auction Live Feed Integration
--
-- Provides clean abstraction for wholesale auction integrations
-- (Manheim / Adesa / ACV / simulator). Powers:
--   * Wholesale acquisition opportunities for the desk
--   * Trade-in benchmarks (p25/p50/p75) for trade-in valuator
--
-- All tables additive + idempotent. RLS enabled where dealer-scoped.
-- Pattern cloned from migrations 055 / 056.

-- ============================================================================
-- 1. auction_sources — registered auction-house integrations
-- ============================================================================
CREATE TABLE IF NOT EXISTS auction_sources (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT         NOT NULL,
  type                  TEXT         NOT NULL
                          CHECK (type IN ('manheim','adesa','acv','simulator')),
  api_endpoint          TEXT,
  credentials_encrypted JSONB        NOT NULL DEFAULT '{}'::jsonb,
  active                BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (type, name)
);

CREATE INDEX IF NOT EXISTS idx_auction_sources_active
  ON auction_sources (active) WHERE active = TRUE;

-- Seed the simulator source so dev/test environments work without creds.
INSERT INTO auction_sources (name, type, active)
  VALUES ('Simulator', 'simulator', TRUE)
  ON CONFLICT (type, name) DO NOTHING;

-- ============================================================================
-- 2. auction_listings — every upcoming/live/sold/no_sale auction lot
--    UNIQUE (source_id, source_listing_id) so re-syncs are idempotent.
-- ============================================================================
CREATE TABLE IF NOT EXISTS auction_listings (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id           UUID         NOT NULL REFERENCES auction_sources(id) ON DELETE CASCADE,
  source_listing_id   TEXT         NOT NULL,
  vin                 TEXT         NOT NULL,
  year                INTEGER      NOT NULL,
  make                TEXT         NOT NULL,
  model               TEXT         NOT NULL,
  trim                TEXT,
  mileage             INTEGER      NOT NULL DEFAULT 0,
  condition_grade     NUMERIC(3,1) CHECK (condition_grade >= 0 AND condition_grade <= 5),
  reserve_price_cents BIGINT,
  current_bid_cents   BIGINT,
  sale_price_cents    BIGINT,
  location            TEXT,
  sale_at             TIMESTAMPTZ  NOT NULL,
  status              TEXT         NOT NULL DEFAULT 'upcoming'
                        CHECK (status IN ('upcoming','live','sold','no_sale')),
  payload             JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, source_listing_id)
);

CREATE INDEX IF NOT EXISTS idx_auction_listings_vin_sale_at
  ON auction_listings (vin, sale_at DESC);
CREATE INDEX IF NOT EXISTS idx_auction_listings_status_sale_at
  ON auction_listings (status, sale_at DESC);
CREATE INDEX IF NOT EXISTS idx_auction_listings_ymm
  ON auction_listings (year, make, model);

-- ============================================================================
-- 3. auction_acquisition_opportunities — scored buy targets per dealer
-- ============================================================================
CREATE TABLE IF NOT EXISTS auction_acquisition_opportunities (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id                UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  listing_id               UUID         NOT NULL REFERENCES auction_listings(id) ON DELETE CASCADE,
  opportunity_score        NUMERIC(5,2) NOT NULL DEFAULT 0,
  suggested_max_bid_cents  BIGINT       NOT NULL DEFAULT 0,
  predicted_retail_cents   BIGINT       NOT NULL DEFAULT 0,
  predicted_gross_cents    BIGINT       NOT NULL DEFAULT 0,
  evidence                 JSONB        NOT NULL DEFAULT '{}'::jsonb,
  status                   TEXT         NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open','bidding','won','lost','dismissed')),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (dealer_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_auction_opps_dealer_score
  ON auction_acquisition_opportunities (dealer_id, opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_auction_opps_dealer_status
  ON auction_acquisition_opportunities (dealer_id, status);

ALTER TABLE auction_acquisition_opportunities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auction_acquisition_opportunities_tenant
  ON auction_acquisition_opportunities;
CREATE POLICY auction_acquisition_opportunities_tenant
  ON auction_acquisition_opportunities
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 4. auction_trade_benchmarks — rolling p25/p50/p75 by VIN pattern
--    vin_pattern = "year|make|model|trim|mileage_band" canonicalized
-- ============================================================================
CREATE TABLE IF NOT EXISTS auction_trade_benchmarks (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vin_pattern     TEXT         NOT NULL UNIQUE,
  year            INTEGER      NOT NULL,
  make            TEXT         NOT NULL,
  model           TEXT         NOT NULL,
  trim            TEXT,
  mileage_band    TEXT         NOT NULL,
  p25_cents       BIGINT       NOT NULL DEFAULT 0,
  p50_cents       BIGINT       NOT NULL DEFAULT 0,
  p75_cents       BIGINT       NOT NULL DEFAULT 0,
  sample_size     INTEGER      NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auction_trade_benchmarks_ymm
  ON auction_trade_benchmarks (year, make, model);

-- Benchmarks are global (cross-dealer); no RLS needed (intentional — the
-- aggregate p25/p50/p75 of recent auction sales is not tenant-specific).

-- ============================================================================
-- 5. updated_at triggers
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_column') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'auction_sources_updated_at') THEN
      CREATE TRIGGER auction_sources_updated_at
        BEFORE UPDATE ON auction_sources
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'auction_listings_updated_at') THEN
      CREATE TRIGGER auction_listings_updated_at
        BEFORE UPDATE ON auction_listings
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'auction_acquisition_opportunities_updated_at') THEN
      CREATE TRIGGER auction_acquisition_opportunities_updated_at
        BEFORE UPDATE ON auction_acquisition_opportunities
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 6. Row-count assertion guard — confirms table presence post-apply
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'auction_listings') THEN
    RAISE EXCEPTION 'Migration 060 failed: auction_listings was not created';
  END IF;
END $$;
