-- Migration 086: Labor Cost Insights (OGIAM Auto cross-tool insight surface)
--
-- Persists the derived labor-efficiency insights that cross two already-live
-- deterministic modules — General Ledger (labor-cost postings) and Payroll
-- (billed hours + overtime + commission concentration) — into dealer-language
-- signals the operator could never assemble by hand.
--
-- One table backs the feature:
--
--   labor_cost_insights — the latest derived insight per (dealer, kind, period).
--                         Upserted on refresh so there is always exactly one
--                         current row per kind per period, mirroring the
--                         vehicle_market_signals model from migration 065.
--
-- All additive + idempotent (CREATE TABLE IF NOT EXISTS, guarded indexes).
-- Dealer-scoped with ENABLE ROW LEVEL SECURITY per the migration 055 bar.
-- Defensive DO blocks guard trigger creation + post-migration assertions.

BEGIN;

-- ============================================================================
-- labor_cost_insights — current derived labor insight per (dealer, kind, period)
-- ============================================================================
CREATE TABLE IF NOT EXISTS labor_cost_insights (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id             UUID         NOT NULL,
  kind                  TEXT         NOT NULL
                          CHECK (kind IN ('commission_concentration', 'labor_cost_vs_margin')),
  period_start          DATE         NOT NULL,
  period_end            DATE         NOT NULL,
  insight_text          TEXT         NOT NULL DEFAULT '',
  category              TEXT         NOT NULL DEFAULT 'labor',
  severity              TEXT         NOT NULL DEFAULT 'info'
                          CHECK (severity IN ('info', 'watch', 'action')),
  confidence            NUMERIC(4,3) NOT NULL DEFAULT 0.0
                          CHECK (confidence >= 0 AND confidence <= 1),
  sample_size           INTEGER      NOT NULL DEFAULT 0 CHECK (sample_size >= 0),
  headcount             INTEGER      NOT NULL DEFAULT 0 CHECK (headcount >= 0),
  labor_cost_cents      BIGINT       NOT NULL DEFAULT 0,
  gross_profit_cents    BIGINT       NOT NULL DEFAULT 0,
  overtime_cost_cents   BIGINT       NOT NULL DEFAULT 0,
  labor_pct             NUMERIC(6,2),
  data                  JSONB        NOT NULL DEFAULT '{}'::jsonb,
  generated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (dealer_id, kind, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_labor_cost_insights_dealer_generated
  ON labor_cost_insights (dealer_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_labor_cost_insights_dealer_kind_period
  ON labor_cost_insights (dealer_id, kind, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_labor_cost_insights_severity
  ON labor_cost_insights (dealer_id, severity, generated_at DESC);

ALTER TABLE labor_cost_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS labor_cost_insights_tenant ON labor_cost_insights;
CREATE POLICY labor_cost_insights_tenant
  ON labor_cost_insights
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- updated_at trigger (only when the shared helper exists)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_column') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'labor_cost_insights_updated_at'
    ) THEN
      CREATE TRIGGER labor_cost_insights_updated_at
        BEFORE UPDATE ON labor_cost_insights
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
  END IF;
END $$;

-- ============================================================================
-- Post-migration assertion guard — fail loud if the table is missing, emit a
-- row-count NOTICE so a botched apply is obvious in psql output. Never RAISE on
-- a count > 0 because re-running over a populated table is intentional.
-- ============================================================================
DO $$
DECLARE
  insight_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'labor_cost_insights') THEN
    RAISE EXCEPTION 'Migration 086 failed: labor_cost_insights was not created';
  END IF;
  SELECT COUNT(*) INTO insight_count FROM labor_cost_insights;
  RAISE NOTICE '[migration 086] labor_cost_insights rows: %', insight_count;
END $$;

COMMIT;
