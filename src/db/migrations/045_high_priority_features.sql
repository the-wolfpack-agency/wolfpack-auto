-- High-priority feature tables: Syndication, eContracting, Lender Routing, Vehicle History
-- Migration 045 — March 31, 2026

/* ======================================================================== */
/* 1. LISTING SYNDICATION — push inventory to AutoTrader, Cars.com, etc.    */
/* ======================================================================== */

CREATE TABLE IF NOT EXISTS syndication_feeds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id           UUID NOT NULL REFERENCES dealers(id),
  platform            TEXT NOT NULL
                        CHECK (platform IN ('autotrader', 'carscom', 'cargurus', 'facebook', 'craigslist')),
  enabled             BOOLEAN NOT NULL DEFAULT false,
  api_key_encrypted   TEXT,                 -- encrypted at rest, never returned in full
  dealer_identifier   TEXT,                 -- dealer's account ID on the platform
  auto_sync           BOOLEAN NOT NULL DEFAULT true,
  sync_interval_hours INTEGER NOT NULL DEFAULT 6 CHECK (sync_interval_hours BETWEEN 1 AND 72),
  vehicles_synced     INTEGER NOT NULL DEFAULT 0,
  last_sync_at        TIMESTAMPTZ,
  last_sync_status    TEXT DEFAULT 'never'
                        CHECK (last_sync_status IN ('never', 'success', 'partial', 'error')),
  last_sync_errors    INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dealer_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_syndication_feeds_dealer
  ON syndication_feeds(dealer_id);

CREATE TABLE IF NOT EXISTS syndication_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id         UUID NOT NULL REFERENCES syndication_feeds(id),
  dealer_id       UUID NOT NULL REFERENCES dealers(id),
  platform        TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('success', 'partial', 'error')),
  vehicles_synced INTEGER NOT NULL DEFAULT 0,
  errors          INTEGER NOT NULL DEFAULT 0,
  error_details   JSONB DEFAULT '[]'::jsonb,
  duration_ms     INTEGER,
  triggered_by    TEXT NOT NULL DEFAULT 'auto',  -- 'auto' | 'manual'
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_syndication_history_feed
  ON syndication_history(feed_id, synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_syndication_history_dealer
  ON syndication_history(dealer_id, synced_at DESC);

/* ======================================================================== */
/* 2. eCONTRACTING — digital deal packets and signatures                    */
/* ======================================================================== */

CREATE TABLE IF NOT EXISTS contracts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id         UUID NOT NULL REFERENCES dealers(id),
  -- `deals` is a backward-compat VIEW over deal_worksheets (036);
  -- deal_worksheets.id is TEXT, so FK column must be TEXT too.
  deal_id           TEXT REFERENCES deal_worksheets(id),
  customer_name     TEXT NOT NULL,
  customer_email    TEXT NOT NULL,
  vehicle_description TEXT,
  provider          TEXT NOT NULL DEFAULT 'internal'
                      CHECK (provider IN ('docusign', 'hellosign', 'internal')),
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'sent', 'partially_signed', 'completed', 'voided', 'expired')),
  envelope_id       TEXT,                   -- external provider envelope ID
  documents         JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_at           TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_dealer
  ON contracts(dealer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contracts_deal
  ON contracts(deal_id)
  WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_status
  ON contracts(dealer_id, status);

/* ======================================================================== */
/* 3. LENDER ROUTING — credit app submission to RouteOne / DealerTrack      */
/* ======================================================================== */

-- `lender_submissions` already exists from migration 021_fi_deals.sql with a
-- smaller column set. The CREATE TABLE IF NOT EXISTS would no-op on fresh DBs
-- AND on established DBs, then subsequent indexes on dealer_id would fail
-- because 021's version lacks that column. Use ALTER TABLE ADD COLUMN
-- IF NOT EXISTS for every column 045 needs that 021 didn't have.
ALTER TABLE lender_submissions ADD COLUMN IF NOT EXISTS dealer_id UUID REFERENCES dealers(id);
ALTER TABLE lender_submissions ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE lender_submissions ADD COLUMN IF NOT EXISTS ssn_last4 TEXT
  CHECK (ssn_last4 IS NULL OR length(ssn_last4) = 4);
ALTER TABLE lender_submissions ADD COLUMN IF NOT EXISTS platform TEXT
  CHECK (platform IS NULL OR platform IN ('routeone', 'dealertrack', 'direct'));
ALTER TABLE lender_submissions ADD COLUMN IF NOT EXISTS lender_id TEXT;
ALTER TABLE lender_submissions ADD COLUMN IF NOT EXISTS apr_offered NUMERIC(5,2);
ALTER TABLE lender_submissions ADD COLUMN IF NOT EXISTS term_offered INTEGER;
ALTER TABLE lender_submissions ADD COLUMN IF NOT EXISTS amount_approved NUMERIC(12,2);
ALTER TABLE lender_submissions ADD COLUMN IF NOT EXISTS stipulations JSONB DEFAULT '[]'::jsonb;
ALTER TABLE lender_submissions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE lender_submissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE lender_submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_lender_submissions_dealer
  ON lender_submissions(dealer_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_lender_submissions_deal
  ON lender_submissions(deal_id)
  WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lender_submissions_status
  ON lender_submissions(dealer_id, status);

/* ======================================================================== */
/* 4. VEHICLE HISTORY — Carfax / AutoCheck report cache                     */
/* ======================================================================== */

CREATE TABLE IF NOT EXISTS vehicle_history_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id           UUID NOT NULL REFERENCES dealers(id),
  vin                 TEXT NOT NULL CHECK (length(vin) = 17),
  provider            TEXT NOT NULL CHECK (provider IN ('carfax', 'autocheck')),
  vehicle_description TEXT,
  summary             JSONB NOT NULL DEFAULT '{}'::jsonb,
  history_entries     JSONB NOT NULL DEFAULT '[]'::jsonb,
  value_impact        JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_url          TEXT,
  pulled_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_history_vin
  ON vehicle_history_reports(vin, pulled_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_history_dealer
  ON vehicle_history_reports(dealer_id, pulled_at DESC);

-- Unique constraint: one active report per vin+provider (latest wins)
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_history_active
  ON vehicle_history_reports(dealer_id, vin, provider)
  WHERE expires_at > NOW();
