-- Rollback for migration 065: drop market intelligence tables.
-- Idempotent — IF EXISTS so partial rollbacks don't error. CASCADE for safety
-- so dependent objects (indexes, policies) drop alongside.

DROP TRIGGER IF EXISTS vehicle_market_signals_updated_at ON vehicle_market_signals;
DROP TABLE IF EXISTS market_comparable_listings CASCADE;
DROP TABLE IF EXISTS vehicle_market_signals CASCADE;
DROP TABLE IF EXISTS market_value_snapshots CASCADE;
