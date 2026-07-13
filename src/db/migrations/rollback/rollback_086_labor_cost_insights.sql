-- Rollback for migration 086: drop the labor cost insights table.
-- Idempotent — IF EXISTS so partial rollbacks don't error. CASCADE for safety
-- so dependent objects (indexes, policies, triggers) drop alongside.

DROP TRIGGER IF EXISTS labor_cost_insights_updated_at ON labor_cost_insights;
DROP TABLE IF EXISTS labor_cost_insights CASCADE;
