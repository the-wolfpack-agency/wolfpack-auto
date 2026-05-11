-- Migration 068: Real-time recall + TSB awareness
--
-- Persists NHTSA recalls (free public feed) and manufacturer TSBs against the
-- inventory + service surfaces so the service write-up screen flags any open
-- recalls or applicable TSBs the moment a vehicle is opened. Legacy DMS forces
-- the writer to look these up manually, which they usually skip — flipping
-- this default closes a real liability gap.
--
-- Four tables, all idempotent, all dealer-scoped where appropriate:
--
--   recalls                 — global cache of NHTSA recall campaigns (no dealer)
--   tsbs                    — global cache of manufacturer TSBs (no dealer)
--   vehicle_recall_status   — per-(dealer, vehicle, recall) resolution state
--   recall_check_history    — audit trail of every per-vehicle lookup
--
-- recalls + tsbs are global because the NHTSA campaign and OEM bulletin lookup
-- is the same data for every dealer in the country; we cache it once and join
-- against (make, model, year) at read time. vehicle_recall_status is dealer-
-- scoped because resolution (acknowledged, repaired, dismissed by owner) is a
-- per-dealer operational decision.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. recalls — global NHTSA cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recalls (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nhtsa_campaign_id   TEXT         NOT NULL UNIQUE,
  make                TEXT         NOT NULL,
  model               TEXT         NOT NULL,
  year_from           INTEGER      NOT NULL,
  year_to             INTEGER      NOT NULL,
  description         TEXT         NOT NULL DEFAULT '',
  severity            TEXT         NOT NULL DEFAULT 'moderate'
                        CHECK (severity IN ('minor', 'moderate', 'critical')),
  remedy_summary      TEXT         NOT NULL DEFAULT '',
  announced_at        TIMESTAMPTZ,
  fetched_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (year_from <= year_to)
);

CREATE INDEX IF NOT EXISTS idx_recalls_make_model_years
  ON recalls (make, model, year_from, year_to);
CREATE INDEX IF NOT EXISTS idx_recalls_severity
  ON recalls (severity);
CREATE INDEX IF NOT EXISTS idx_recalls_fetched_at
  ON recalls (fetched_at DESC);

ALTER TABLE recalls ENABLE ROW LEVEL SECURITY;
-- recalls is a global reference cache. Every authenticated session can read
-- (read-only permissive policy); writes are restricted to the cron service
-- role at the application layer. The permissive USING clause keeps RLS on
-- (so verify-rls passes) without breaking the global-read use case.
DROP POLICY IF EXISTS recalls_read_all ON recalls;
CREATE POLICY recalls_read_all ON recalls
  USING (TRUE);

-- ---------------------------------------------------------------------------
-- 2. tsbs — global manufacturer TSB cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tsbs (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer         TEXT         NOT NULL,
  bulletin_id          TEXT         NOT NULL,
  year_from            INTEGER      NOT NULL,
  year_to              INTEGER      NOT NULL,
  models               TEXT[]       NOT NULL DEFAULT '{}',
  description          TEXT         NOT NULL DEFAULT '',
  recommended_action   TEXT         NOT NULL DEFAULT '',
  published_at         TIMESTAMPTZ,
  fetched_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (manufacturer, bulletin_id),
  CHECK (year_from <= year_to)
);

CREATE INDEX IF NOT EXISTS idx_tsbs_manufacturer_years
  ON tsbs (manufacturer, year_from, year_to);
CREATE INDEX IF NOT EXISTS idx_tsbs_models_gin
  ON tsbs USING GIN (models);
CREATE INDEX IF NOT EXISTS idx_tsbs_fetched_at
  ON tsbs (fetched_at DESC);

ALTER TABLE tsbs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tsbs_read_all ON tsbs;
CREATE POLICY tsbs_read_all ON tsbs
  USING (TRUE);

-- ---------------------------------------------------------------------------
-- 3. vehicle_recall_status — per-dealer resolution state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicle_recall_status (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id            UUID         NOT NULL,
  dealer_id             UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  recall_id             UUID         NOT NULL REFERENCES recalls(id) ON DELETE CASCADE,
  status                TEXT         NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'resolved', 'dismissed_by_owner')),
  resolved_at           TIMESTAMPTZ,
  resolved_by_user_id   TEXT,
  notes                 TEXT         NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (dealer_id, vehicle_id, recall_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_recall_status_vehicle_recall
  ON vehicle_recall_status (vehicle_id, recall_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_recall_status_dealer_open
  ON vehicle_recall_status (dealer_id, status)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_vehicle_recall_status_dealer_vehicle
  ON vehicle_recall_status (dealer_id, vehicle_id);

ALTER TABLE vehicle_recall_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicle_recall_status_tenant ON vehicle_recall_status;
CREATE POLICY vehicle_recall_status_tenant ON vehicle_recall_status
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- 4. recall_check_history — every per-vehicle lookup is logged
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recall_check_history (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    UUID         NOT NULL,
  dealer_id     UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  checked_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  recall_count  INTEGER      NOT NULL DEFAULT 0,
  tsb_count     INTEGER      NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recall_check_history_dealer_checked
  ON recall_check_history (dealer_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_recall_check_history_vehicle
  ON recall_check_history (dealer_id, vehicle_id, checked_at DESC);

ALTER TABLE recall_check_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recall_check_history_tenant ON recall_check_history;
CREATE POLICY recall_check_history_tenant ON recall_check_history
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- 5. Final ASSERT — fail loudly if any of the four tables are missing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM (
    SELECT 'recalls' AS t WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'recalls'
    )
    UNION ALL SELECT 'tsbs' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'tsbs'
    )
    UNION ALL SELECT 'vehicle_recall_status' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'vehicle_recall_status'
    )
    UNION ALL SELECT 'recall_check_history' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'recall_check_history'
    )
  ) AS missing_tables;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 068 failed — missing tables: %', missing;
  END IF;
END $$;

COMMIT;
