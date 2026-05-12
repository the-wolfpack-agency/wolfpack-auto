-- Migration 070: Pre-qualification real lender routing + BYO Plaid plumbing.
--
-- Migration 067 introduced the customer-facing /pre-qual wizard with synthetic
-- offers from `prequal_offers`. The synthetic offers are a great demo surface
-- but they don't get the customer in front of a real lender. This migration
-- converts the prequal output into a dealer-routed lender packet:
--
--   dealer_lender_routes      -- the dealer's own lender contact list
--                                (lender name + email + sort order + type).
--                                Manually maintained by the dealer; one row per
--                                lender contact, dealer-scoped, RLS enforced.
--
--   prequal_lender_dispatches -- one row every time the prequal is routed to
--                                a lender. Tracks status (queued/sent/failed/
--                                viewed), failure reason, and the URL of the
--                                generated packet PDF (or text fallback).
--
-- Plaid BYO credentials live on `dealer_external_credentials` (migration 069,
-- Stream A). This migration depends on that table existing at deploy time.
-- Migrations 069+070 run in order; if you run 070 alone you MUST run 069 first.
--
-- All tables additive + idempotent; RLS policies key on dealer_id per
-- migration 055's enforcement.
--
-- Pattern cloned from 064_wolfpack_staff.sql + 067_prequalification.sql.

-- ============================================================================
-- 1. dealer_lender_routes -- one row per lender contact the dealer routes to
-- ============================================================================
CREATE TABLE IF NOT EXISTS dealer_lender_routes (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id       UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  lender_name     TEXT         NOT NULL,
  contact_email   TEXT         NOT NULL,
  contact_name    TEXT,
  sort_order      INTEGER      NOT NULL DEFAULT 0,
  active          BOOLEAN      NOT NULL DEFAULT TRUE,
  lender_type     TEXT         NOT NULL DEFAULT 'other'
                    CHECK (lender_type IN (
                      'prime',
                      'sub_prime',
                      'captive',
                      'credit_union',
                      'other'
                    )),
  notes           TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dealer_lender_routes_dealer_active
  ON dealer_lender_routes (dealer_id, active, sort_order);

CREATE INDEX IF NOT EXISTS idx_dealer_lender_routes_dealer_type
  ON dealer_lender_routes (dealer_id, lender_type)
  WHERE active = TRUE;

ALTER TABLE dealer_lender_routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dealer_lender_routes_tenant ON dealer_lender_routes;
CREATE POLICY dealer_lender_routes_tenant ON dealer_lender_routes
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 2. prequal_lender_dispatches -- audit row per (prequal, lender_route) send
-- ============================================================================
--
-- We deliberately reference `prequalifications(id)` rather than
-- `prequal_sessions(id)` for the foreign key because the spec calls out
-- "prequalifications". Both are valid prequal tables: 067 created
-- `prequal_sessions`; some sibling code paths refer to `prequalifications`.
-- We probe the catalog and pick whichever exists. If neither exists we skip
-- the FK and rely on application-layer validation (still safe -- the row
-- carries dealer_id which is the RLS gate).
DO $$
DECLARE
  prequal_table TEXT;
  fk_clause     TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'prequalifications'
  ) THEN
    prequal_table := 'prequalifications';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'prequal_sessions'
  ) THEN
    prequal_table := 'prequal_sessions';
  ELSE
    prequal_table := NULL;
  END IF;

  IF prequal_table IS NULL THEN
    fk_clause := '';
  ELSE
    fk_clause := format(
      'REFERENCES %I(id) ON DELETE CASCADE',
      prequal_table
    );
  END IF;

  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS prequal_lender_dispatches (
      id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      prequal_id              UUID         NOT NULL %s,
      dealer_id               UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
      lender_route_id         UUID         NOT NULL REFERENCES dealer_lender_routes(id) ON DELETE RESTRICT,
      packet_url              TEXT,
      packet_format           TEXT         NOT NULL DEFAULT 'text'
                                CHECK (packet_format IN ('text','pdf','html')),
      sent_at                 TIMESTAMPTZ,
      status                  TEXT         NOT NULL DEFAULT 'queued'
                                CHECK (status IN ('queued','sent','failed','viewed')),
      failure_reason          TEXT,
      viewed_at               TIMESTAMPTZ,
      response_received_at    TIMESTAMPTZ,
      created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  $f$, fk_clause);
END $$;

CREATE INDEX IF NOT EXISTS idx_prequal_lender_dispatches_prequal
  ON prequal_lender_dispatches (prequal_id);
CREATE INDEX IF NOT EXISTS idx_prequal_lender_dispatches_dealer_created
  ON prequal_lender_dispatches (dealer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prequal_lender_dispatches_status
  ON prequal_lender_dispatches (dealer_id, status, created_at DESC);

ALTER TABLE prequal_lender_dispatches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prequal_lender_dispatches_tenant ON prequal_lender_dispatches;
CREATE POLICY prequal_lender_dispatches_tenant ON prequal_lender_dispatches
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 3. updated_at trigger for dealer_lender_routes
-- ============================================================================
CREATE OR REPLACE FUNCTION dealer_lender_routes_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dealer_lender_routes_updated_at ON dealer_lender_routes;
CREATE TRIGGER dealer_lender_routes_updated_at
  BEFORE UPDATE ON dealer_lender_routes
  FOR EACH ROW
  EXECUTE FUNCTION dealer_lender_routes_set_updated_at();

-- ============================================================================
-- 4. Final ASSERT -- fail loudly if either table is missing.
-- ============================================================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM (
    SELECT 'dealer_lender_routes' AS t WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'dealer_lender_routes'
    )
    UNION ALL SELECT 'prequal_lender_dispatches' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'prequal_lender_dispatches'
    )
  ) AS missing_tables;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 070 failed -- missing tables: %', missing;
  END IF;
END $$;
