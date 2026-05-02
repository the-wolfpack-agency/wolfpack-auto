-- Rollback for migration 059: Drop the deal-copilot tables.
-- CASCADE so dependent indexes/policies/triggers come down with each table.
-- Idempotent (IF EXISTS) so partial rollbacks don't error.
--
-- This file is the canonical .down.sql pair for 059_deal_copilot.sql; the
-- repo's migration runner reads from rollback_NNN_*.sql so the parallel
-- rollback_059_*.sql is the runner-facing copy.

DROP TABLE IF EXISTS deal_copilot_generator_weights CASCADE;
DROP TABLE IF EXISTS deal_copilot_outcomes CASCADE;
DROP TABLE IF EXISTS deal_copilot_suggestions CASCADE;
DROP TABLE IF EXISTS deal_copilot_sessions CASCADE;
