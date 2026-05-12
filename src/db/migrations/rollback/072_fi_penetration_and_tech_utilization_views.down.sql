-- Rollback for migration 072: drop the two analytics views and the
-- supporting indexes. Idempotent (IF EXISTS). CASCADE on the views so any
-- dependent objects (none expected, but safe) unwind cleanly.

DROP VIEW  IF EXISTS v_tech_utilization     CASCADE;
DROP VIEW  IF EXISTS v_fi_penetration       CASCADE;
DROP INDEX IF EXISTS idx_deal_fi_items_dealer_deal;
DROP INDEX IF EXISTS idx_repair_orders_dealer_week;
DROP INDEX IF EXISTS idx_deal_desk_dealer_funded_at;
