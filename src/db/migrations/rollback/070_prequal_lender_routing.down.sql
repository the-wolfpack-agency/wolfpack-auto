-- Rollback for migration 070: Drop prequal lender routing tables.
-- Idempotent (IF EXISTS) so a partial rollback won't error.
-- CASCADE so dependent indexes/policies/triggers come down with each table.

DROP TRIGGER IF EXISTS dealer_lender_routes_updated_at ON dealer_lender_routes;
DROP FUNCTION IF EXISTS dealer_lender_routes_set_updated_at();

DROP TABLE IF EXISTS prequal_lender_dispatches CASCADE;
DROP TABLE IF EXISTS dealer_lender_routes CASCADE;
