-- Rollback: 003_dms_feeds
-- WARNING: This is destructive. Backup first.
-- Usage: psql $DATABASE_URL -f src/db/migrations/rollback/rollback_003_dms_feeds.sql
BEGIN;

-- Drop updated-at trigger
DROP TRIGGER IF EXISTS trg_dms_feed_configs_updated_at ON dms_feed_configs;

-- Drop RLS policies
DROP POLICY IF EXISTS dms_feed_logs_tenant_insert ON dms_feed_logs;
DROP POLICY IF EXISTS dms_feed_logs_tenant_isolation ON dms_feed_logs;
DROP POLICY IF EXISTS dms_feed_configs_tenant_insert ON dms_feed_configs;
DROP POLICY IF EXISTS dms_feed_configs_tenant_isolation ON dms_feed_configs;

-- Drop indexes
DROP INDEX IF EXISTS idx_dms_feed_logs_provider;
DROP INDEX IF EXISTS idx_dms_feed_logs_dealer_synced;
DROP INDEX IF EXISTS idx_dms_feed_logs_dealer;
DROP INDEX IF EXISTS idx_dms_feed_configs_dealer_status;
DROP INDEX IF EXISTS idx_dms_feed_configs_dealer;

-- Drop tables (logs first — no FK deps on configs, but keeping logical order)
DROP TABLE IF EXISTS dms_feed_logs CASCADE;
DROP TABLE IF EXISTS dms_feed_configs CASCADE;

COMMIT;
