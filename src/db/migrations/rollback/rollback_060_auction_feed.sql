-- Rollback for migration 060: drop the auction-feed tables.
-- Idempotent — IF EXISTS so partial rollbacks don't error.
-- CASCADE so dependent triggers/policies/indexes come down with each table.

DROP TABLE IF EXISTS auction_acquisition_opportunities CASCADE;
DROP TABLE IF EXISTS auction_trade_benchmarks CASCADE;
DROP TABLE IF EXISTS auction_listings CASCADE;
DROP TABLE IF EXISTS auction_sources CASCADE;
