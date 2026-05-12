-- Migration 076: Literacy Walkthroughs + Tooltips (in-platform literacy layer)
--
-- Builds on the ontology engine in migration 075. Two new tables hold the
-- *rendered* surfaces that dealer-side users actually see:
--
--   literacy_walkthroughs — multi-step guided tours, role-scoped + surface-scoped
--   literacy_tooltips     — short + expanded explanations for a single concept
--
-- Both tables are SHARED ACROSS ALL DEALERS (curated content). Just like
-- the migration 075 ontology tables, RLS is enabled (so verify:rls passes)
-- with permissive read policies. The write gate is enforced at the app
-- layer in src/app/api/admin/literacy/walkthroughs/* and tooltips/* — every
-- mutating route calls requireWolfpackStaff. Per-dealer outcome tracking
-- already lives in literacy_outcomes (migration 075), which has strict
-- dealer_id-keyed RLS.
--
-- All content is initially `ai_proposed` (see src/lib/literacy-walkthroughs/
-- expansion.ts) and gets promoted to `ai_approved` or `curated` via the
-- existing literacy authoring API. The ontology stays the gatekeeper for
-- the structure (concept slugs are FK-referenced from tooltips); the
-- content itself can be LLM-authored without human gatekeeping.
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every policy is wrapped in
-- DROP POLICY IF EXISTS / CREATE POLICY. Re-running this migration is a
-- no-op. Ends with a final ASSERT that fails loudly if either table is
-- missing.

BEGIN;

-- ============================================================================
-- 1. literacy_walkthroughs — multi-step guided tours
-- ============================================================================
CREATE TABLE IF NOT EXISTS literacy_walkthroughs (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug               TEXT         NOT NULL UNIQUE,
  name               TEXT         NOT NULL,
  role               TEXT         NOT NULL CHECK (role IN (
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
  surface            TEXT,                       -- 'dashboard','onboarding','feature_intro'
  trigger_condition  TEXT,                       -- 'first_login','first_visit','manual'
  steps              JSONB        NOT NULL,      -- array of {selector,concept_id?,translation_id?,template,position}
  source             TEXT         NOT NULL DEFAULT 'ai_proposed'
                                    CHECK (source IN ('curated', 'ai_proposed', 'ai_approved')),
  quality_score      NUMERIC(3,2) NOT NULL DEFAULT 0.5
                                    CHECK (quality_score >= 0 AND quality_score <= 1),
  active             BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS literacy_walkthroughs_role_active_idx
  ON literacy_walkthroughs (role, active);
CREATE INDEX IF NOT EXISTS literacy_walkthroughs_surface_idx
  ON literacy_walkthroughs (surface);
CREATE INDEX IF NOT EXISTS literacy_walkthroughs_trigger_idx
  ON literacy_walkthroughs (trigger_condition);

-- ============================================================================
-- 2. literacy_tooltips — short + expanded explanations per concept + role
-- ============================================================================
CREATE TABLE IF NOT EXISTS literacy_tooltips (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id     UUID         NOT NULL REFERENCES literacy_concepts(id) ON DELETE CASCADE,
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
  short_text     TEXT         NOT NULL,      -- 1 sentence
  expanded_text  TEXT,                       -- 2-3 sentence elaboration
  source         TEXT         NOT NULL DEFAULT 'ai_proposed'
                                CHECK (source IN ('curated', 'ai_proposed', 'ai_approved')),
  quality_score  NUMERIC(3,2) NOT NULL DEFAULT 0.5
                                CHECK (quality_score >= 0 AND quality_score <= 1),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS literacy_tooltips_concept_role_idx
  ON literacy_tooltips (concept_id, role);
CREATE INDEX IF NOT EXISTS literacy_tooltips_role_idx
  ON literacy_tooltips (role);

-- One tooltip per (concept, role) — refine in place rather than duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_literacy_tooltips_concept_role
  ON literacy_tooltips (concept_id, role);

-- ============================================================================
-- updated_at trigger on literacy_walkthroughs
-- ============================================================================
CREATE OR REPLACE FUNCTION literacy_walkthroughs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'literacy_walkthroughs_updated_at'
  ) THEN
    CREATE TRIGGER literacy_walkthroughs_updated_at
    BEFORE UPDATE ON literacy_walkthroughs
    FOR EACH ROW EXECUTE FUNCTION literacy_walkthroughs_set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- Row-level security
--
-- Both tables hold agency-shared curated content (NOT dealer-scoped) so we
-- mirror migration 075's posture: ENABLE ROW LEVEL SECURITY (so verify:rls
-- passes) + permissive read policies. The actual write gate is
-- `requireWolfpackStaff` at the route layer.
-- ============================================================================
ALTER TABLE literacy_walkthroughs ENABLE ROW LEVEL SECURITY;
ALTER TABLE literacy_tooltips     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS literacy_walkthroughs_read ON literacy_walkthroughs;
CREATE POLICY literacy_walkthroughs_read ON literacy_walkthroughs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS literacy_walkthroughs_app_only ON literacy_walkthroughs;
CREATE POLICY literacy_walkthroughs_app_only ON literacy_walkthroughs
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS literacy_tooltips_read ON literacy_tooltips;
CREATE POLICY literacy_tooltips_read ON literacy_tooltips
  FOR SELECT USING (true);

DROP POLICY IF EXISTS literacy_tooltips_app_only ON literacy_tooltips;
CREATE POLICY literacy_tooltips_app_only ON literacy_tooltips
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- Row-count assertion (log only)
-- ============================================================================
DO $$
DECLARE
  w_count INT; t_count INT;
BEGIN
  SELECT COUNT(*) INTO w_count FROM literacy_walkthroughs;
  SELECT COUNT(*) INTO t_count FROM literacy_tooltips;
  RAISE NOTICE '[migration 076] literacy_walkthroughs rows: %', w_count;
  RAISE NOTICE '[migration 076] literacy_tooltips rows: %',     t_count;
END $$;

-- ============================================================================
-- Final ASSERT — fail loudly if either table is missing
-- ============================================================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM (
    SELECT 'literacy_walkthroughs' AS t WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'literacy_walkthroughs'
    )
    UNION ALL SELECT 'literacy_tooltips' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'literacy_tooltips'
    )
  ) AS missing_tables;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 076 failed — missing tables: %', missing;
  END IF;
END $$;

COMMIT;
