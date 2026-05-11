-- Rollback for migration 067: Drop the pre-qualification tables.
-- CASCADE so dependent indexes/policies/triggers come down with each table.
-- Idempotent (IF EXISTS) so partial rollbacks don't error.
--
-- This file is the runner-facing copy. The .down.sql pair sits alongside it.

DROP TRIGGER IF EXISTS prequal_sessions_updated_at ON prequal_sessions;
DROP FUNCTION IF EXISTS prequal_sessions_set_updated_at();

DROP TABLE IF EXISTS prequal_offers CASCADE;
DROP TABLE IF EXISTS plaid_links CASCADE;
DROP TABLE IF EXISTS soft_credit_pulls CASCADE;
DROP TABLE IF EXISTS prequal_sessions CASCADE;
