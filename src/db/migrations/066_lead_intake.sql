-- Migration 066: Modern lead intake with auto-enrichment
--
-- Adds infrastructure for the modern lead pipeline:
--   1. lead_sources           — webhook / API / email / manual ingest channels
--   2. lead_enrichment        — auto-collected public data per lead
--   3. lead_routing_decisions — chosen rep + decision factors
--
-- All tables additive + idempotent. RLS enabled on every table; policies key
-- on dealer_id (matching migration 055 pattern).

-- ============================================================================
-- 1. lead_sources — dealer-managed ingest channels
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_sources (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id       UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  source_name     TEXT         NOT NULL,
  source_type     TEXT         NOT NULL
                    CHECK (source_type IN ('webhook','api','email','manual')),
  config          JSONB        NOT NULL DEFAULT '{}'::jsonb,
  signing_secret  TEXT,
  active          BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (dealer_id, source_name)
);

CREATE INDEX IF NOT EXISTS idx_lead_sources_dealer_created
  ON lead_sources (dealer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_sources_dealer_active
  ON lead_sources (dealer_id) WHERE active = TRUE;

ALTER TABLE lead_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_sources_tenant ON lead_sources;
CREATE POLICY lead_sources_tenant
  ON lead_sources
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 2. lead_enrichment — auto-collected public data per lead
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_enrichment (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID         NOT NULL,
  dealer_id       UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  enriched_data   JSONB        NOT NULL DEFAULT '{}'::jsonb,
  confidence      NUMERIC(5,2) NOT NULL DEFAULT 0,
  sources         TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  generated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_enrichment_dealer_created
  ON lead_enrichment (dealer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_enrichment_lead
  ON lead_enrichment (lead_id);

ALTER TABLE lead_enrichment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_enrichment_tenant ON lead_enrichment;
CREATE POLICY lead_enrichment_tenant
  ON lead_enrichment
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 3. lead_routing_decisions — auditable record of which rep was picked
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_routing_decisions (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            UUID         NOT NULL,
  dealer_id          UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  candidate_users    UUID[]       NOT NULL DEFAULT ARRAY[]::UUID[],
  chosen_user_id     UUID,
  decision_factors   JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_routing_dealer_created
  ON lead_routing_decisions (dealer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_routing_lead
  ON lead_routing_decisions (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_routing_chosen
  ON lead_routing_decisions (chosen_user_id) WHERE chosen_user_id IS NOT NULL;

ALTER TABLE lead_routing_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_routing_decisions_tenant ON lead_routing_decisions;
CREATE POLICY lead_routing_decisions_tenant
  ON lead_routing_decisions
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 4. updated_at trigger for lead_sources (others are append-only)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_column') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'lead_sources_updated_at') THEN
      CREATE TRIGGER lead_sources_updated_at
        BEFORE UPDATE ON lead_sources
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 5. Row-count / structure assertion guard
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'lead_sources') THEN
    RAISE EXCEPTION 'Migration 066 failed: lead_sources was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'lead_enrichment') THEN
    RAISE EXCEPTION 'Migration 066 failed: lead_enrichment was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'lead_routing_decisions') THEN
    RAISE EXCEPTION 'Migration 066 failed: lead_routing_decisions was not created';
  END IF;
END $$;
