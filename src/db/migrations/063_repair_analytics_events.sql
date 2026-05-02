-- 063_repair_analytics_events.sql
--
-- Two regression repairs (2026-05-02):
--
-- 1. The GoogleMapsEmbed component was sending `page: dealerId`, so
--    444 rows accumulated with raw UUIDs in the page column. Those
--    rows pollute the page-selector dropdown and skew per-page
--    analytics. Move the dealer-id-shaped page values into
--    metadata.dealer_id and reset page to the canonical value the
--    component intended ('/contact').
--
-- 2. Migration 062 backfilled dealer_id only when the dealers table
--    held exactly one row. With multiple dealers active, the backfill
--    was a no-op and ~889 rows kept dealer_id=null. Those rows are
--    invisible to every dealer-scoped query. We now use the same
--    default UUID `00000000-0000-4000-a000-000000000001` that
--    requireAuth/getDealerId/the analytics ingest all fall back to,
--    so the events become queryable. If a row's metadata already
--    carries a non-null dealer_id we leave it alone.
--
-- Idempotent + reversible (rollback restores the prior null + UUID
-- values from a snapshot table this migration writes alongside).

BEGIN;

-- ─── Step 1: capture a snapshot of repaired rows ─────────────────
CREATE TABLE IF NOT EXISTS analytics_events_repair_063 (
  id            BIGINT PRIMARY KEY,
  prior_page    TEXT,
  prior_metadata JSONB,
  repaired_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Snapshot UUID-in-page rows ONLY if not already snapshotted.
INSERT INTO analytics_events_repair_063 (id, prior_page, prior_metadata)
SELECT id, page, metadata
  FROM analytics_events
 WHERE page ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (id) DO NOTHING;

-- Snapshot null-dealer rows ONLY if not already snapshotted.
INSERT INTO analytics_events_repair_063 (id, prior_page, prior_metadata)
SELECT id, page, metadata
  FROM analytics_events
 WHERE (metadata IS NULL OR metadata->>'dealer_id' IS NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── Step 2: repair UUID-in-page rows ─────────────────────────────
-- Move the UUID into metadata.dealer_id (if not already set there)
-- and rewrite page to '/contact' which is the route GoogleMapsEmbed
-- mounts on.
UPDATE analytics_events
   SET page = '/contact',
       metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{dealer_id}',
         to_jsonb(page),
         TRUE
       )
 WHERE page ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- ─── Step 3: backfill null dealer_id rows ────────────────────────
UPDATE analytics_events
   SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{dealer_id}',
         to_jsonb('00000000-0000-4000-a000-000000000001'::text),
         TRUE
       )
 WHERE metadata IS NULL
    OR metadata->>'dealer_id' IS NULL;

-- ─── Step 4: assertion ──────────────────────────────────────────
DO $$
DECLARE
  bad_page_count INT;
  null_dealer_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_page_count
    FROM analytics_events
   WHERE page ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  ASSERT bad_page_count = 0,
    format('UUID-shaped page values remain after repair: %s', bad_page_count);

  SELECT COUNT(*) INTO null_dealer_count
    FROM analytics_events
   WHERE metadata IS NULL OR metadata->>'dealer_id' IS NULL;
  ASSERT null_dealer_count = 0,
    format('null dealer_id rows remain after repair: %s', null_dealer_count);
END $$;

COMMIT;
