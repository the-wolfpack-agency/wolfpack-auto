-- Rollback for migration 056: Drop the durable tables created for the
-- shadow-store admin routes. CASCADE so dependent indexes/policies/triggers
-- come down with each table. Idempotent (IF EXISTS) so partial rollbacks
-- don't error.

DROP TABLE IF EXISTS error_monitor_resolutions CASCADE;
DROP TABLE IF EXISTS good_faith_gestures CASCADE;
DROP TABLE IF EXISTS engagement_reports CASCADE;

-- contracts is pre-existing (created in 045). Don't drop it — only roll
-- back the additive changes 056 made.
DROP POLICY IF EXISTS contracts_tenant ON contracts;
DROP INDEX IF EXISTS idx_contracts_active;
ALTER TABLE contracts DISABLE ROW LEVEL SECURITY;
-- deleted_at column is left in place: removing it is a destructive
-- alter that breaks any rows soft-deleted in the meantime. If a
-- downgrade truly needs to drop it, do so explicitly:
--   ALTER TABLE contracts DROP COLUMN deleted_at;
