-- Rollback for migration 061: drop inventory pool tables.
-- Idempotent — IF EXISTS so partial rollbacks don't error.

DROP TABLE IF EXISTS inventory_swap_proposals CASCADE;
DROP TABLE IF EXISTS inventory_reservations CASCADE;
DROP TABLE IF EXISTS inventory_pool_visibilities CASCADE;
DROP TABLE IF EXISTS inventory_pool_memberships CASCADE;
