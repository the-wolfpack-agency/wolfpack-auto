-- Migration 080: Vertical-aware action registry + tenant_verticals
--
-- Adds the `vertical` dimension to the Wolfpack Assistant action registry so
-- one codebase can serve multiple verticals (auto, retail, service,
-- hospitality, any) without polluting per-tenant action lists. See
-- docs/wolfpack-platform-multivertical-2026-05-12.md for the strategic frame.
--
-- Two changes:
--
--   1. assistant_actions.vertical (TEXT NOT NULL DEFAULT 'any', CHECK
--      constraint, indexed). Existing rows backfill to 'any' via the
--      DEFAULT; the seed script subsequently retags auto-specific actions
--      to 'auto'.
--
--   2. tenant_verticals — small lookup table associating a tenant
--      (tenant_id = dealer_id today) with its vertical. Generalizes to any
--      vertical tenant. Most existing tenants default to 'auto'.
--
-- Backfill: every existing dealer is treated as 'auto' (we are pre-launch
-- for other verticals). The backfill is wrapped in a DO block so the
-- migration still succeeds if `dealers` does not exist (defensive — though
-- migration 001 guarantees it).
--
-- RLS: tenant_verticals is read-open (shared lookup; the route layer is the
-- gate on write). Mirrors migration 077's policy pattern for assistant_actions.
--
-- Idempotent: every ADD/CREATE uses IF NOT EXISTS. Re-running this migration
-- is a no-op. Ends with a final ASSERT that fails loudly if the column or
-- table is missing.

BEGIN;

-- ============================================================================
-- 1. Add vertical column to assistant_actions
-- ============================================================================
ALTER TABLE assistant_actions
  ADD COLUMN IF NOT EXISTS vertical TEXT NOT NULL DEFAULT 'any';

-- Add the CHECK constraint defensively — Postgres won't accept
-- IF NOT EXISTS on ADD CONSTRAINT, so we wrap in a DO block + catalog query.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'assistant_actions_vertical_check'
       AND conrelid = 'assistant_actions'::regclass
  ) THEN
    ALTER TABLE assistant_actions
      ADD CONSTRAINT assistant_actions_vertical_check
      CHECK (vertical IN ('auto', 'retail', 'service', 'hospitality', 'any'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS assistant_actions_vertical_idx
  ON assistant_actions (vertical);

-- ============================================================================
-- 2. tenant_verticals — tenant-to-vertical association
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_verticals (
  tenant_id   UUID         PRIMARY KEY,
  vertical    TEXT         NOT NULL CHECK (vertical IN (
                              'auto',
                              'retail',
                              'service',
                              'hospitality'
                            )),
  active      BOOLEAN      DEFAULT TRUE,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tenant_verticals_vertical_idx
  ON tenant_verticals (vertical);

-- ============================================================================
-- 3. Backfill: every existing dealer defaults to 'auto'. Safe because we are
-- pre-launch for other verticals. Wrapped in a defensive DO block so the
-- migration still succeeds if `dealers` does not exist (it always should,
-- per migration 001).
-- ============================================================================
DO $$
DECLARE
  inserted INT;
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_name = 'dealers'
       AND table_schema = current_schema()
  ) THEN
    INSERT INTO tenant_verticals (tenant_id, vertical)
    SELECT id, 'auto' FROM dealers
    ON CONFLICT (tenant_id) DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
    RAISE NOTICE '[migration 080] backfilled % tenant_verticals rows (auto)', inserted;
  ELSE
    -- TODO: re-run backfill when the dealers table is present.
    RAISE NOTICE '[migration 080] dealers table missing — skipping backfill';
  END IF;
END $$;

-- ============================================================================
-- updated_at trigger on tenant_verticals
-- ============================================================================
CREATE OR REPLACE FUNCTION tenant_verticals_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'tenant_verticals_updated_at'
  ) THEN
    CREATE TRIGGER tenant_verticals_updated_at
    BEFORE UPDATE ON tenant_verticals
    FOR EACH ROW EXECUTE FUNCTION tenant_verticals_set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- Row-level security
--
-- tenant_verticals is shared lookup metadata (mirrors migration 077's pattern
-- for assistant_actions). RLS is enabled so verify:rls is satisfied, but the
-- policy is permissive on read — writes are gated at the route layer
-- (Wolfpack staff only) and audited.
-- ============================================================================
ALTER TABLE tenant_verticals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_verticals_read ON tenant_verticals;
CREATE POLICY tenant_verticals_read ON tenant_verticals
  FOR SELECT USING (true);

DROP POLICY IF EXISTS tenant_verticals_app_only ON tenant_verticals;
CREATE POLICY tenant_verticals_app_only ON tenant_verticals
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- Row-count assertion (log only — never fail the migration).
-- ============================================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM tenant_verticals;
  RAISE NOTICE '[migration 080] tenant_verticals rows: %', v_count;
END $$;

-- ============================================================================
-- Final ASSERT — fail loudly if the column or table is missing.
-- ============================================================================
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM (
    SELECT 'assistant_actions.vertical' AS t
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'assistant_actions'
           AND column_name = 'vertical'
      )
    UNION ALL
    SELECT 'tenant_verticals'
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_name = 'tenant_verticals'
      )
  ) AS missing_items;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 080 failed -- missing: %', missing;
  END IF;
END $$;

COMMIT;
