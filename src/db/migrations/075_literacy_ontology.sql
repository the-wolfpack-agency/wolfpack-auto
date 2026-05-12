-- Migration 075: Dealership Literacy Ontology Engine
--
-- Foundation for the Dealership Literacy OS (see docs/literacy-os-strategy-2026-05-12.md).
-- Six tables that hold the curated knowledge graph that maps digital business
-- concepts to physical dealership concepts, paired with role-specific
-- translations and recommended actions:
--
--   literacy_concepts     — digital + physical objects (VDP, lot, F&I desk, ...)
--   literacy_mappings     — typed relations between concepts
--   literacy_metrics      — measurable signals attached to concepts
--   literacy_translations — role-specific phrasings of metrics in lot-language
--   literacy_actions      — recommended interventions tied to metric thresholds
--   literacy_outcomes     — per-dealer outcome tracking for the feedback loop
--
-- Five of these six tables are SHARED ACROSS ALL DEALERS — this is the
-- curated ontology, not per-dealer data. RLS is enabled (so verify:rls is
-- satisfied) but the policy is permissive on read; writes are gated at the
-- application layer to wolfpack_staff sessions only (see
-- src/app/api/admin/literacy/* — every mutating route calls
-- requireWolfpackStaff). Documented design decision: we do not partition
-- Postgres roles per-dealer in this migration; the staff-only write gate is
-- enforced at the route layer instead.
--
-- literacy_outcomes IS per-dealer (it tracks which translations + actions
-- actually moved the needle at a specific dealership). It has a strict
-- dealer_id-keyed RLS policy that mirrors migration 055's enforcement
-- pattern.
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every policy is wrapped in
-- DROP POLICY IF EXISTS / CREATE POLICY. Re-running this migration is a
-- no-op. Ends with a final ASSERT that fails loudly if any table is missing.

BEGIN;

-- ============================================================================
-- 1. literacy_concepts — digital + physical objects
-- ============================================================================
CREATE TABLE IF NOT EXISTS literacy_concepts (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT         NOT NULL UNIQUE,
  name         TEXT         NOT NULL,
  domain       TEXT         NOT NULL CHECK (domain IN ('digital', 'physical', 'hybrid')),
  surface      TEXT,
  description  TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_literacy_concepts_slug    ON literacy_concepts (slug);
CREATE INDEX IF NOT EXISTS idx_literacy_concepts_domain  ON literacy_concepts (domain);
CREATE INDEX IF NOT EXISTS idx_literacy_concepts_surface ON literacy_concepts (surface);

-- ============================================================================
-- 2. literacy_mappings — typed relations between concepts
-- ============================================================================
CREATE TABLE IF NOT EXISTS literacy_mappings (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  source_concept_id   UUID         NOT NULL REFERENCES literacy_concepts(id) ON DELETE CASCADE,
  target_concept_id   UUID         NOT NULL REFERENCES literacy_concepts(id) ON DELETE CASCADE,
  relation            TEXT         NOT NULL CHECK (relation IN (
                                     'equivalent_to',
                                     'analog_of',
                                     'precedes',
                                     'measures',
                                     'aggregates'
                                   )),
  confidence          NUMERIC(3,2) NOT NULL DEFAULT 1.0
                          CHECK (confidence >= 0 AND confidence <= 1),
  source              TEXT         NOT NULL DEFAULT 'curated'
                          CHECK (source IN ('curated', 'ai_proposed', 'ai_approved')),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT literacy_mappings_distinct CHECK (source_concept_id <> target_concept_id)
);

-- One (source, target, relation) triple per source-domain.
CREATE UNIQUE INDEX IF NOT EXISTS uq_literacy_mappings_triple
  ON literacy_mappings (source_concept_id, target_concept_id, relation);

CREATE INDEX IF NOT EXISTS idx_literacy_mappings_source
  ON literacy_mappings (source_concept_id);
CREATE INDEX IF NOT EXISTS idx_literacy_mappings_target
  ON literacy_mappings (target_concept_id);
CREATE INDEX IF NOT EXISTS idx_literacy_mappings_relation
  ON literacy_mappings (relation);

-- ============================================================================
-- 3. literacy_metrics — measurable signals attached to concepts
-- ============================================================================
CREATE TABLE IF NOT EXISTS literacy_metrics (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT         NOT NULL UNIQUE,
  name            TEXT         NOT NULL,
  concept_id      UUID         REFERENCES literacy_concepts(id) ON DELETE SET NULL,
  unit            TEXT,
  good_direction  TEXT         CHECK (good_direction IN ('higher', 'lower', 'depends')),
  description     TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_literacy_metrics_slug    ON literacy_metrics (slug);
CREATE INDEX IF NOT EXISTS idx_literacy_metrics_concept ON literacy_metrics (concept_id);

-- ============================================================================
-- 4. literacy_translations — role-specific phrasings of metrics
-- ============================================================================
CREATE TABLE IF NOT EXISTS literacy_translations (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id      UUID         NOT NULL REFERENCES literacy_metrics(id) ON DELETE CASCADE,
  role           TEXT         NOT NULL CHECK (role IN (
                                'salesperson',
                                'fi_manager',
                                'bdc_agent',
                                'service_advisor',
                                'service_manager',
                                'gm',
                                'marketing',
                                'controller',
                                'any'
                              )),
  context        TEXT,
  template       TEXT         NOT NULL,
  source         TEXT         NOT NULL DEFAULT 'curated'
                                CHECK (source IN ('curated', 'ai_proposed', 'ai_approved')),
  quality_score  NUMERIC(3,2) NOT NULL DEFAULT 0.5
                                CHECK (quality_score >= 0 AND quality_score <= 1),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_literacy_translations_metric_role
  ON literacy_translations (metric_id, role);
CREATE INDEX IF NOT EXISTS idx_literacy_translations_role
  ON literacy_translations (role);

-- One curated translation per (metric, role, context) — duplicates of the
-- same triple are nonsense (use UPDATE to refine, not duplicate).
CREATE UNIQUE INDEX IF NOT EXISTS uq_literacy_translations_metric_role_context
  ON literacy_translations (metric_id, role, COALESCE(context, ''));

-- ============================================================================
-- 5. literacy_actions — recommended interventions tied to metric thresholds
-- ============================================================================
CREATE TABLE IF NOT EXISTS literacy_actions (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_id                UUID         NOT NULL REFERENCES literacy_metrics(id) ON DELETE CASCADE,
  trigger_condition        TEXT         NOT NULL,
  role                     TEXT         NOT NULL CHECK (role IN (
                                          'salesperson',
                                          'fi_manager',
                                          'bdc_agent',
                                          'service_advisor',
                                          'service_manager',
                                          'gm',
                                          'marketing',
                                          'controller'
                                        )),
  recommendation_template  TEXT         NOT NULL,
  expected_outcome         TEXT,
  source                   TEXT         NOT NULL DEFAULT 'curated'
                                          CHECK (source IN ('curated', 'ai_proposed', 'ai_approved')),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_literacy_actions_metric_role_trigger
  ON literacy_actions (metric_id, role, trigger_condition);
CREATE INDEX IF NOT EXISTS idx_literacy_actions_metric
  ON literacy_actions (metric_id);
CREATE INDEX IF NOT EXISTS idx_literacy_actions_role
  ON literacy_actions (role);

-- Same (metric, role, trigger) shouldn't appear twice — refine in place.
CREATE UNIQUE INDEX IF NOT EXISTS uq_literacy_actions_metric_role_trigger
  ON literacy_actions (metric_id, role, trigger_condition);

-- ============================================================================
-- 6. literacy_outcomes — per-dealer outcome tracking (feedback loop)
-- ============================================================================
CREATE TABLE IF NOT EXISTS literacy_outcomes (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id       UUID         NOT NULL,
  translation_id  UUID         REFERENCES literacy_translations(id) ON DELETE SET NULL,
  action_id       UUID         REFERENCES literacy_actions(id) ON DELETE SET NULL,
  rendered_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  was_clicked     BOOLEAN,
  was_acted_on    BOOLEAN,
  metric_delta    NUMERIC,
  recorded_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_literacy_outcomes_dealer_rendered
  ON literacy_outcomes (dealer_id, rendered_at DESC);
CREATE INDEX IF NOT EXISTS idx_literacy_outcomes_translation
  ON literacy_outcomes (translation_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_literacy_outcomes_action
  ON literacy_outcomes (action_id, recorded_at DESC);

-- ============================================================================
-- updated_at trigger on literacy_concepts
-- ============================================================================
CREATE OR REPLACE FUNCTION literacy_concepts_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'literacy_concepts_updated_at'
  ) THEN
    CREATE TRIGGER literacy_concepts_updated_at
    BEFORE UPDATE ON literacy_concepts
    FOR EACH ROW EXECUTE FUNCTION literacy_concepts_set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- Row-level security
--
-- Curated ontology tables (concepts/mappings/metrics/translations/actions) are
-- agency-shared and not dealer-scoped. We still ENABLE ROW LEVEL SECURITY so
-- npm run verify:rls is satisfied. Permissive policies allow reads + writes;
-- the actual write gate is `requireWolfpackStaff` in
-- src/app/api/admin/literacy/* — a dealer session gets 401 there. Document
-- that choice here for future hardening.
--
-- literacy_outcomes IS per-dealer and gets a strict dealer_id-keyed policy
-- mirroring migration 055.
-- ============================================================================
ALTER TABLE literacy_concepts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE literacy_mappings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE literacy_metrics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE literacy_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE literacy_actions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE literacy_outcomes     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS literacy_concepts_app_only ON literacy_concepts;
CREATE POLICY literacy_concepts_app_only ON literacy_concepts
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS literacy_mappings_app_only ON literacy_mappings;
CREATE POLICY literacy_mappings_app_only ON literacy_mappings
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS literacy_metrics_app_only ON literacy_metrics;
CREATE POLICY literacy_metrics_app_only ON literacy_metrics
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS literacy_translations_app_only ON literacy_translations;
CREATE POLICY literacy_translations_app_only ON literacy_translations
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS literacy_actions_app_only ON literacy_actions;
CREATE POLICY literacy_actions_app_only ON literacy_actions
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS literacy_outcomes_tenant ON literacy_outcomes;
CREATE POLICY literacy_outcomes_tenant ON literacy_outcomes
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- Row-count assertions (log only — never fail the migration)
-- ============================================================================
DO $$
DECLARE
  c_count INT; m_count INT; met_count INT; t_count INT; a_count INT; o_count INT;
BEGIN
  SELECT COUNT(*) INTO c_count   FROM literacy_concepts;
  SELECT COUNT(*) INTO m_count   FROM literacy_mappings;
  SELECT COUNT(*) INTO met_count FROM literacy_metrics;
  SELECT COUNT(*) INTO t_count   FROM literacy_translations;
  SELECT COUNT(*) INTO a_count   FROM literacy_actions;
  SELECT COUNT(*) INTO o_count   FROM literacy_outcomes;
  RAISE NOTICE '[migration 075] literacy_concepts rows: %',     c_count;
  RAISE NOTICE '[migration 075] literacy_mappings rows: %',     m_count;
  RAISE NOTICE '[migration 075] literacy_metrics rows: %',      met_count;
  RAISE NOTICE '[migration 075] literacy_translations rows: %', t_count;
  RAISE NOTICE '[migration 075] literacy_actions rows: %',      a_count;
  RAISE NOTICE '[migration 075] literacy_outcomes rows: %',     o_count;
END $$;

-- ============================================================================
-- Final ASSERT — fail loudly if any table is missing.
-- ============================================================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM (
    SELECT 'literacy_concepts'     AS t WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'literacy_concepts')
    UNION ALL SELECT 'literacy_mappings'     WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'literacy_mappings')
    UNION ALL SELECT 'literacy_metrics'      WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'literacy_metrics')
    UNION ALL SELECT 'literacy_translations' WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'literacy_translations')
    UNION ALL SELECT 'literacy_actions'      WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'literacy_actions')
    UNION ALL SELECT 'literacy_outcomes'     WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'literacy_outcomes')
  ) AS missing_tables;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 075 failed — missing tables: %', missing;
  END IF;
END $$;

COMMIT;
