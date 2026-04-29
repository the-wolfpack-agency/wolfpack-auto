-- Migration 056: Durable persistence for shadow-store admin routes
--
-- Closes the migration debt left behind when 11 admin pages were
-- shipped with "shadow store" fallbacks that 200 with `warning` fields
-- when the underlying table didn't exist on the deployed environment.
-- Each shadow response named the missing table; this migration creates
-- the named tables (additive-only) so the durable code paths in those
-- routes light up without code changes for the existing tables, and
-- adds RLS + supporting columns where the route code drifted ahead of
-- the schema (notably contracts.deleted_at).
--
-- Tables addressed (by route → table):
--   /api/admin/engagement-reports → engagement_reports          (NEW)
--   /api/admin/good-faith        → good_faith_gestures         (NEW)
--   /api/admin/error-monitor     → error_monitor_resolutions    (NEW)
--   /api/admin/econtracting      → contracts (existing, +deleted_at, +RLS)
--
-- Already-existing tables (skipped — verified in companion test):
--   data_exports        (052)
--   deal_desk           (047)
--   fi_products         (047)
--   surveys             (052)
--   survey_responses    (052)
--   user_tests          (052)
--   test_recordings     (052) — the route already references this name
--
-- Pattern cloned from 052 + 055:
--   * CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS for safe re-runs.
--   * dealer_id UUID NOT NULL on every new table (matches the rest of the
--     post-046 migrations; pre-046 tables use TEXT — sibling tables in 052
--     use TEXT but new admin tables here all reference dealers(id) UUIDs).
--   * ALTER TABLE … ENABLE ROW LEVEL SECURITY + USING current_setting('app.current_dealer_id', …)
--     identical to 055.
--   * Common (dealer_id, created_at DESC) index for list queries.

-- ============================================================================
-- 1. engagement_reports — customer interaction outcomes
--    Shape mirrors src/app/api/admin/engagement-reports/route.ts:
--      customer_name, employee_name, interaction_type, outcome,
--      competitor_mentioned, objections_raised, notes, rating, created_at
-- ============================================================================
CREATE TABLE IF NOT EXISTS engagement_reports (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id            UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  customer_name        TEXT         NOT NULL,
  employee_name        TEXT         NOT NULL,
  interaction_type     TEXT         NOT NULL
                         CHECK (interaction_type IN ('test_drive', 'purchase', 'service', 'follow_up', 'walk_in')),
  outcome              TEXT         NOT NULL
                         CHECK (outcome IN ('purchased', 'returning', 'lost', 'follow_up_needed')),
  competitor_mentioned TEXT,
  objections_raised    TEXT,
  notes                TEXT,
  rating               INTEGER      NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_reports_dealer_created
  ON engagement_reports (dealer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_reports_outcome
  ON engagement_reports (dealer_id, outcome);

ALTER TABLE engagement_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_reports_tenant ON engagement_reports;
CREATE POLICY engagement_reports_tenant ON engagement_reports
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 2. good_faith_gestures — service credits / reimbursable customer-recovery
--    Shape mirrors src/app/api/admin/good-faith/route.ts:
--      customer_name, customer_email, gesture_type, value_usd, reason,
--      oem_reimbursable, oem_claim_id, status, created_at, updated_at
-- ============================================================================
CREATE TABLE IF NOT EXISTS good_faith_gestures (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id         UUID          NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  customer_name     TEXT          NOT NULL,
  customer_email    TEXT          NOT NULL,
  gesture_type      TEXT          NOT NULL
                      CHECK (gesture_type IN ('service_credit', 'accessory', 'loaner', 'discount', 'apology_gift')),
  value_usd         NUMERIC(12,2) NOT NULL CHECK (value_usd > 0),
  reason            TEXT          NOT NULL,
  oem_reimbursable  BOOLEAN       NOT NULL DEFAULT FALSE,
  oem_claim_id      TEXT,
  status            TEXT          NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'claimed', 'denied')),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_good_faith_gestures_dealer_created
  ON good_faith_gestures (dealer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_good_faith_gestures_status
  ON good_faith_gestures (dealer_id, status);

ALTER TABLE good_faith_gestures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS good_faith_gestures_tenant ON good_faith_gestures;
CREATE POLICY good_faith_gestures_tenant ON good_faith_gestures
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 3. error_monitor_resolutions — durable replacement for the localStorage
--    fingerprint-dismissal shim in /admin/error-monitor.
--
--    Keyed on (dealer_id, error_id) per task spec. error_id is the client-side
--    fingerprint string from client_errors.fingerprint — kept TEXT so it works
--    even when the upstream error never landed in client_errors (shadow demo).
--    Unique constraint guarantees idempotent "resolve again" clicks.
-- ============================================================================
CREATE TABLE IF NOT EXISTS error_monitor_resolutions (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id    UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  error_id     TEXT         NOT NULL,
  resolved_by  TEXT,
  notes        TEXT,
  resolved_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (dealer_id, error_id)
);

CREATE INDEX IF NOT EXISTS idx_error_monitor_resolutions_dealer
  ON error_monitor_resolutions (dealer_id, resolved_at DESC);

ALTER TABLE error_monitor_resolutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS error_monitor_resolutions_tenant ON error_monitor_resolutions;
CREATE POLICY error_monitor_resolutions_tenant ON error_monitor_resolutions
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 4. contracts (existing, 045) — additive hardening
--    Route at src/app/api/admin/econtracting/route.ts queries
--    `WHERE c.deleted_at IS NULL` but the column was never created.
--    Add the column safely + index for the active-only filter.
--    Also add RLS — table was created in 045 before 055 raised the bar.
-- ============================================================================

-- Add deleted_at column if missing — defensive DO block keeps re-runs clean
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contracts' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE contracts ADD COLUMN deleted_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contracts_active
  ON contracts (dealer_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- RLS — clone the 055 pattern. UUID cast because contracts.dealer_id is UUID.
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contracts_tenant ON contracts;
CREATE POLICY contracts_tenant ON contracts
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 5. updated_at triggers — keep the ergonomics consistent with 052
-- ============================================================================
DO $$
BEGIN
  -- set_updated_at_column() was created in migration 052; guard in case the
  -- migration runner ever applies 056 against a partially-migrated env.
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_column') THEN
    -- engagement_reports
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'engagement_reports_updated_at'
    ) THEN
      CREATE TRIGGER engagement_reports_updated_at
        BEFORE UPDATE ON engagement_reports
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
    -- good_faith_gestures
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'good_faith_gestures_updated_at'
    ) THEN
      CREATE TRIGGER good_faith_gestures_updated_at
        BEFORE UPDATE ON good_faith_gestures
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
  END IF;
END $$;
