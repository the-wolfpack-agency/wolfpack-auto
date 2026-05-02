-- 062_backfill_analytics_dealer_id.sql
--
-- Regression repair (2026-05-02): every dealer-scoped query
-- (heatmap, propensity, micro-behavioral views) filters events on
-- `metadata->>'dealer_id'`, but the public ingest endpoint never
-- stamped that key into metadata. Real Playwright + browser traffic
-- piled up under no dealer_id, invisible to every downstream surface.
--
-- The route fix (this same commit) stamps dealer_id from
-- resolveTenant on every NEW event. This migration backfills the
-- missing key on EXISTING rows so historic events become queryable
-- again. Idempotent: rows that already have a dealer_id are left
-- untouched.
--
-- Strategy: assign rows the dealer_id of the only active dealer if
-- exactly one exists; otherwise skip the backfill (a multi-tenant
-- environment can't safely auto-attribute orphan events). The
-- single-dealer case is the current state of the deployed canary
-- and the local dev environments, so the backfill is a no-op-safe
-- "fix what you can, leave the rest" pass.

BEGIN;

DO $$
DECLARE
  active_dealer_count INT;
  canonical_dealer_id TEXT;
BEGIN
  SELECT COUNT(*) INTO active_dealer_count FROM dealers
   WHERE COALESCE(deleted_at, NULL) IS NULL OR TRUE;
  -- ^ guard against either schema; we only need a count.

  IF active_dealer_count = 1 THEN
    SELECT id::text INTO canonical_dealer_id FROM dealers
     ORDER BY created_at ASC NULLS LAST, id ASC
     LIMIT 1;

    UPDATE analytics_events
       SET metadata = jsonb_set(
             COALESCE(metadata, '{}'::jsonb),
             '{dealer_id}',
             to_jsonb(canonical_dealer_id),
             TRUE
           )
     WHERE (metadata IS NULL)
        OR (metadata->>'dealer_id' IS NULL);

    RAISE NOTICE 'backfilled analytics_events.dealer_id with %', canonical_dealer_id;
  ELSE
    RAISE NOTICE 'skipping backfill — % dealers active (need exactly 1)',
                 active_dealer_count;
  END IF;
END $$;

COMMIT;
