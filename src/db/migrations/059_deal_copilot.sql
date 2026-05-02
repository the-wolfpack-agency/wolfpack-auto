-- Migration 059: Live Deal-Desk Copilot
--
-- Adds the persistence layer for the live copilot that runs alongside the
-- desk during active negotiation. Three tables, all dealer-scoped, RLS on,
-- idempotent CREATEs so re-runs are safe. Pattern cloned from 056.
--
--   deal_copilot_sessions          one row per copilot run on a deal
--   deal_copilot_suggestions       N rows per session, one per generator output
--   deal_copilot_outcomes          terminal row per session — drives learning
--   deal_copilot_generator_weights per-(dealer, generator) confidence weights
--
-- The deal_id column is TEXT, not UUID, because there is no canonical `deals`
-- table yet — desking deals live in `deal_desk` (UUID PK), but copilot sessions
-- can also be opened on shadow / unsaved deals identified by a client-supplied
-- string. Keep the door open without binding to a single FK.

-- ============================================================================
-- 1. deal_copilot_sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS deal_copilot_sessions (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id             UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  deal_id               TEXT         NOT NULL,
  opened_by_user_id     TEXT         NOT NULL,
  opened_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  closed_at             TIMESTAMPTZ,
  outcome               TEXT
                          CHECK (outcome IS NULL OR outcome IN ('won', 'lost', 'pending')),
  total_suggestions     INTEGER      NOT NULL DEFAULT 0,
  accepted_suggestions  INTEGER      NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_copilot_sessions_dealer_opened
  ON deal_copilot_sessions (dealer_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_copilot_sessions_deal
  ON deal_copilot_sessions (dealer_id, deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_copilot_sessions_outcome
  ON deal_copilot_sessions (dealer_id, outcome)
  WHERE outcome IS NOT NULL;

ALTER TABLE deal_copilot_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deal_copilot_sessions_tenant ON deal_copilot_sessions;
CREATE POLICY deal_copilot_sessions_tenant ON deal_copilot_sessions
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 2. deal_copilot_suggestions
-- ============================================================================
CREATE TABLE IF NOT EXISTS deal_copilot_suggestions (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID         NOT NULL REFERENCES deal_copilot_sessions(id) ON DELETE CASCADE,
  dealer_id           UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  suggestion_type     TEXT         NOT NULL
                        CHECK (suggestion_type IN (
                          'rate_stack',
                          'payment_shape',
                          'msrp_discount',
                          'fi_product_attach',
                          'lender_swap',
                          'term_change',
                          'down_change'
                        )),
  payload             JSONB        NOT NULL,
  evidence            JSONB        NOT NULL,
  generator           TEXT         NOT NULL,
  confidence          NUMERIC(5,4) NOT NULL DEFAULT 0.5
                        CHECK (confidence >= 0 AND confidence <= 1),
  accepted            BOOLEAN,
  accepted_at         TIMESTAMPTZ,
  accepted_by_user_id TEXT,
  rejection_reason    TEXT,
  suggested_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_copilot_suggestions_session
  ON deal_copilot_suggestions (session_id, suggested_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_copilot_suggestions_dealer_type
  ON deal_copilot_suggestions (dealer_id, suggestion_type);
CREATE INDEX IF NOT EXISTS idx_deal_copilot_suggestions_accepted
  ON deal_copilot_suggestions (dealer_id, accepted)
  WHERE accepted IS NOT NULL;

ALTER TABLE deal_copilot_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deal_copilot_suggestions_tenant ON deal_copilot_suggestions;
CREATE POLICY deal_copilot_suggestions_tenant ON deal_copilot_suggestions
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 3. deal_copilot_outcomes — drives the learning loop
-- ============================================================================
CREATE TABLE IF NOT EXISTS deal_copilot_outcomes (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               UUID         NOT NULL REFERENCES deal_copilot_sessions(id) ON DELETE CASCADE,
  dealer_id                UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  outcome                  TEXT         NOT NULL CHECK (outcome IN ('won', 'lost')),
  close_reason             TEXT,
  gross_profit_cents       BIGINT,
  accepted_suggestion_ids  UUID[]       NOT NULL DEFAULT '{}',
  recorded_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_copilot_outcomes_dealer_recorded
  ON deal_copilot_outcomes (dealer_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_copilot_outcomes_session
  ON deal_copilot_outcomes (session_id);

ALTER TABLE deal_copilot_outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deal_copilot_outcomes_tenant ON deal_copilot_outcomes;
CREATE POLICY deal_copilot_outcomes_tenant ON deal_copilot_outcomes
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 4. deal_copilot_generator_weights — per-(dealer, generator) learning weights
-- One row per generator per dealer. recordOutcome() bumps these up on win,
-- down on loss. Reads are O(1) on (dealer_id, generator).
-- ============================================================================
CREATE TABLE IF NOT EXISTS deal_copilot_generator_weights (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id       UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  generator       TEXT         NOT NULL,
  weight          NUMERIC(5,4) NOT NULL DEFAULT 0.5
                    CHECK (weight >= 0 AND weight <= 1),
  win_count       INTEGER      NOT NULL DEFAULT 0,
  loss_count      INTEGER      NOT NULL DEFAULT 0,
  last_updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (dealer_id, generator)
);

CREATE INDEX IF NOT EXISTS idx_deal_copilot_generator_weights_dealer
  ON deal_copilot_generator_weights (dealer_id);

ALTER TABLE deal_copilot_generator_weights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deal_copilot_generator_weights_tenant ON deal_copilot_generator_weights;
CREATE POLICY deal_copilot_generator_weights_tenant ON deal_copilot_generator_weights
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 5. Final ASSERT — fail loudly if any of the four tables are missing.
-- ============================================================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM (
    SELECT 'deal_copilot_sessions' AS t WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'deal_copilot_sessions'
    )
    UNION ALL SELECT 'deal_copilot_suggestions' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'deal_copilot_suggestions'
    )
    UNION ALL SELECT 'deal_copilot_outcomes' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'deal_copilot_outcomes'
    )
    UNION ALL SELECT 'deal_copilot_generator_weights' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'deal_copilot_generator_weights'
    )
  ) AS missing_tables;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 059 failed — missing tables: %', missing;
  END IF;
END $$;
