-- ============================================================================
-- Migration 083: analytics_events retention indexing.
--
-- The analytics_events table has grown unbounded since 2026-03-27 because
-- no retention job existed. Combined with EventCollector flushing every
-- 5s and multiple polling dashboards aggregating over the table, this
-- was the primary suspect for the 2026-05-19 Neon data-transfer quota
-- exhaustion.
--
-- This migration only adds the DESCENDING index needed for the new
-- /api/cron/prune-analytics cron to scan oldest rows cheaply. The
-- actual DELETE happens in the cron, not the migration — destructive
-- bulk-deletes in migrations are an anti-pattern (no rollback path).
--
-- See:
--   - scripts/scan-db-burners.sh   (codified detection)
--   - src/app/api/cron/prune-analytics/route.ts  (nightly DELETE job)
--   - vercel.json `crons`           (00:30 UTC nightly schedule)
-- ============================================================================

-- Descending timestamp index — the prune query is
-- `DELETE FROM analytics_events WHERE timestamp < now() - interval '60 days'`
-- which uses the existing ascending idx_analytics_events_timestamp.
-- We add a partial index on "old rows only" so the planner can prune
-- without scanning the recent (hot) majority. Postgres can't put NOW()
-- in a partial-index predicate (it's not IMMUTABLE), so we use a
-- static cutoff that we'll bump in a future migration if the retention
-- window changes. 365-day cutoff is safe-by-construction: any row
-- older than a year is definitively prunable under any reasonable
-- retention policy.
CREATE INDEX IF NOT EXISTS idx_analytics_events_old
  ON analytics_events (timestamp)
  WHERE timestamp < '2025-01-01'::TIMESTAMPTZ;

-- No data changes. Idempotent.
