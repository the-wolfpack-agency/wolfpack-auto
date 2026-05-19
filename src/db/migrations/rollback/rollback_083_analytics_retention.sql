-- Rollback for migration 083: drop the partial index added for the
-- prune-analytics cron's planner hint.
DROP INDEX IF EXISTS idx_analytics_events_old;
