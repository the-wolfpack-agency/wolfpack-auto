-- Migration 055: Enforce RLS on core tables from migrations 001-051
--
-- The following tables were created in early migrations WITHOUT Row-Level
-- Security policies. Migration 052+ tables already have RLS. This migration
-- closes the gap so ALL multi-tenant tables enforce tenant isolation.
--
-- Tables addressed:
--   dealers        (001) - id scoping (not dealer_id)
--   dealer_users   (035) - dealer_id scoping
--   deal_worksheets (021) - dealer_id scoping
--   service_appointments (022) - dealer_id scoping
--   repair_orders  (022) - dealer_id scoping
--   documents      (028) - dealer_id scoping
--   reviews        (025) - dealer_id scoping
--
-- Tables already covered by migration 001 (no changes needed):
--   vehicles, leads, page_views, seo_metrics, ab_tests

-- ============================================================================
-- dealers — scoped by id (not dealer_id, since this IS the dealer table)
-- ============================================================================
ALTER TABLE dealers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dealers_tenant ON dealers;
CREATE POLICY dealers_tenant ON dealers
  USING (id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- dealer_users — scoped by dealer_id
-- ============================================================================
ALTER TABLE dealer_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dealer_users_tenant ON dealer_users;
CREATE POLICY dealer_users_tenant ON dealer_users
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- deal_worksheets — scoped by dealer_id
-- ============================================================================
ALTER TABLE deal_worksheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deal_worksheets_tenant ON deal_worksheets;
CREATE POLICY deal_worksheets_tenant ON deal_worksheets
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- service_appointments — scoped by dealer_id
-- ============================================================================
ALTER TABLE service_appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_appointments_tenant ON service_appointments;
CREATE POLICY service_appointments_tenant ON service_appointments
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- repair_orders — scoped by dealer_id
-- ============================================================================
ALTER TABLE repair_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS repair_orders_tenant ON repair_orders;
CREATE POLICY repair_orders_tenant ON repair_orders
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- documents — scoped by dealer_id
-- ============================================================================
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_tenant ON documents;
CREATE POLICY documents_tenant ON documents
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- reviews — scoped by dealer_id
-- ============================================================================
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reviews_tenant ON reviews;
CREATE POLICY reviews_tenant ON reviews
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);
