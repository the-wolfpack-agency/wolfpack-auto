-- Rollback for migration 059: Drop the deal-copilot tables.
-- CASCADE so dependent indexes/policies/triggers come down with each table.
-- Idempotent (IF EXISTS) so partial rollbacks don't error.
--
-- Order is reverse of the create order so any FKs unwind cleanly.

DROP TABLE IF EXISTS deal_copilot_generator_weights CASCADE;
DROP TABLE IF EXISTS deal_copilot_outcomes CASCADE;
DROP TABLE IF EXISTS deal_copilot_suggestions CASCADE;
DROP TABLE IF EXISTS deal_copilot_sessions CASCADE;
