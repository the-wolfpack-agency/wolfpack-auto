-- Migration 067: Customer-facing pre-qualification flow
--
-- The customer self-serves on `/pre-qual` (public, no auth) and walks through:
--   1. identity capture (name, email, phone, vehicle interest)
--   2. soft credit pull              -> tier + score range
--   3. income verification           -> manual now, Plaid later
--   4. lender quote engine           -> N pre-approval offers
--
-- Four dealer-scoped tables, all RLS-enabled, all idempotent. Encrypted columns
-- ('raw_response_encrypted', 'access_token_encrypted') hold AES-256-GCM ciphertext
-- emitted by src/lib/crypto.ts (named-algorithm registry per CLAUDE.md). Never store
-- plaintext bureau payloads or Plaid access tokens.
--
-- Pattern cloned from 059_deal_copilot.sql + 056_admin_shadow_durable_tables.sql.

-- ============================================================================
-- 1. prequal_sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS prequal_sessions (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id               UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  customer_name           TEXT         NOT NULL,
  -- Email + phone are stored encrypted at rest via src/lib/crypto.ts. Schema
  -- type is TEXT (not CITEXT) because the value is ciphertext, not a plain
  -- email. Dedup happens at the application layer on a normalized hash.
  customer_email          TEXT         NOT NULL,
  customer_phone          TEXT,
  vehicle_interest_text   TEXT         NOT NULL,
  status                  TEXT         NOT NULL DEFAULT 'started'
                            CHECK (status IN (
                              'started',
                              'credit_pulled',
                              'income_verified',
                              'offers_returned',
                              'completed',
                              'abandoned'
                            )),
  started_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at            TIMESTAMPTZ,
  ip_address              TEXT,
  user_agent              TEXT,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prequal_sessions_dealer_started
  ON prequal_sessions (dealer_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_prequal_sessions_dealer_status
  ON prequal_sessions (dealer_id, status);

ALTER TABLE prequal_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prequal_sessions_tenant ON prequal_sessions;
CREATE POLICY prequal_sessions_tenant ON prequal_sessions
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 2. soft_credit_pulls
-- ============================================================================
CREATE TABLE IF NOT EXISTS soft_credit_pulls (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               UUID         NOT NULL REFERENCES prequal_sessions(id) ON DELETE CASCADE,
  dealer_id                UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  bureau_used              TEXT         NOT NULL
                             CHECK (bureau_used IN (
                               'mock',
                               'experian',
                               'equifax',
                               'transunion'
                             )),
  score_range_min          INTEGER      NOT NULL CHECK (score_range_min BETWEEN 300 AND 850),
  score_range_max          INTEGER      NOT NULL CHECK (score_range_max BETWEEN 300 AND 850),
  tier                     TEXT         NOT NULL
                             CHECK (tier IN (
                               'super_prime',
                               'prime',
                               'near_prime',
                               'subprime',
                               'deep_subprime'
                             )),
  credit_pulled_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- Encrypted via src/lib/crypto.ts (AES-256-GCM). Never write plaintext.
  raw_response_encrypted   TEXT,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (score_range_max >= score_range_min)
);

CREATE INDEX IF NOT EXISTS idx_soft_credit_pulls_session
  ON soft_credit_pulls (session_id);
CREATE INDEX IF NOT EXISTS idx_soft_credit_pulls_dealer_pulled
  ON soft_credit_pulls (dealer_id, credit_pulled_at DESC);

ALTER TABLE soft_credit_pulls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS soft_credit_pulls_tenant ON soft_credit_pulls;
CREATE POLICY soft_credit_pulls_tenant ON soft_credit_pulls
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 3. plaid_links
-- ============================================================================
CREATE TABLE IF NOT EXISTS plaid_links (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                UUID         NOT NULL REFERENCES prequal_sessions(id) ON DELETE CASCADE,
  dealer_id                 UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  plaid_item_id             TEXT,
  -- Encrypted via src/lib/crypto.ts (AES-256-GCM). Plaid access tokens are
  -- bearer credentials; storing plaintext = credential theft on any DB leak.
  access_token_encrypted    TEXT,
  income_monthly_cents      BIGINT       NOT NULL CHECK (income_monthly_cents >= 0),
  income_confidence         TEXT         NOT NULL
                              CHECK (income_confidence IN (
                                'self_reported',
                                'mock',
                                'plaid_low',
                                'plaid_medium',
                                'plaid_high'
                              )),
  linked_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plaid_links_session
  ON plaid_links (session_id);
CREATE INDEX IF NOT EXISTS idx_plaid_links_dealer_linked
  ON plaid_links (dealer_id, linked_at DESC);

ALTER TABLE plaid_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plaid_links_tenant ON plaid_links;
CREATE POLICY plaid_links_tenant ON plaid_links
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 4. prequal_offers
-- ============================================================================
CREATE TABLE IF NOT EXISTS prequal_offers (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID         NOT NULL REFERENCES prequal_sessions(id) ON DELETE CASCADE,
  dealer_id           UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  lender_id           TEXT         NOT NULL,
  lender_name         TEXT         NOT NULL,
  max_amount_cents    BIGINT       NOT NULL CHECK (max_amount_cents >= 0),
  apr_bps             INTEGER      NOT NULL CHECK (apr_bps >= 0 AND apr_bps <= 5000),
  term_months         INTEGER      NOT NULL CHECK (term_months > 0 AND term_months <= 96),
  conditions          JSONB        NOT NULL DEFAULT '{}'::jsonb,
  expires_at          TIMESTAMPTZ  NOT NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prequal_offers_session
  ON prequal_offers (session_id, apr_bps ASC);
CREATE INDEX IF NOT EXISTS idx_prequal_offers_dealer_created
  ON prequal_offers (dealer_id, created_at DESC);
-- Plain index on expires_at — cannot use partial predicate
-- `WHERE expires_at > NOW()` because NOW() is STABLE, not IMMUTABLE,
-- and Postgres rejects volatile functions in index predicates.
-- "Active offers" filter happens at the application layer.
CREATE INDEX IF NOT EXISTS idx_prequal_offers_expires
  ON prequal_offers (expires_at);

ALTER TABLE prequal_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prequal_offers_tenant ON prequal_offers;
CREATE POLICY prequal_offers_tenant ON prequal_offers
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 5. updated_at trigger for prequal_sessions
-- ============================================================================
CREATE OR REPLACE FUNCTION prequal_sessions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prequal_sessions_updated_at ON prequal_sessions;
CREATE TRIGGER prequal_sessions_updated_at
  BEFORE UPDATE ON prequal_sessions
  FOR EACH ROW
  EXECUTE FUNCTION prequal_sessions_set_updated_at();

-- ============================================================================
-- 6. Final ASSERT — fail loudly if any of the four tables are missing.
-- ============================================================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM (
    SELECT 'prequal_sessions' AS t WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'prequal_sessions'
    )
    UNION ALL SELECT 'soft_credit_pulls' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'soft_credit_pulls'
    )
    UNION ALL SELECT 'plaid_links' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'plaid_links'
    )
    UNION ALL SELECT 'prequal_offers' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'prequal_offers'
    )
  ) AS missing_tables;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 067 failed -- missing tables: %', missing;
  END IF;
END $$;
