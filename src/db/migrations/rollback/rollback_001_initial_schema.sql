-- Rollback: 001_initial_schema
-- WARNING: This is FULLY DESTRUCTIVE — drops the entire Wolfpack Auto schema.
-- Backup first. This cannot be undone without a restore.
-- Usage: psql $DATABASE_URL -f src/db/migrations/rollback/rollback_001_initial_schema.sql
BEGIN;

-- =========================================================================
-- Drop updated-at triggers
-- =========================================================================

DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads;
DROP TRIGGER IF EXISTS trg_vehicles_updated_at ON vehicles;
DROP TRIGGER IF EXISTS trg_dealers_updated_at ON dealers;

-- =========================================================================
-- Drop search vector trigger
-- =========================================================================

DROP TRIGGER IF EXISTS trg_vehicles_search_vector ON vehicles;

-- =========================================================================
-- Drop RLS policies
-- =========================================================================

DROP POLICY IF EXISTS ab_tests_tenant_insert ON ab_tests;
DROP POLICY IF EXISTS ab_tests_tenant_isolation ON ab_tests;
DROP POLICY IF EXISTS seo_metrics_tenant_insert ON seo_metrics;
DROP POLICY IF EXISTS seo_metrics_tenant_isolation ON seo_metrics;
DROP POLICY IF EXISTS page_views_tenant_insert ON page_views;
DROP POLICY IF EXISTS page_views_tenant_isolation ON page_views;
DROP POLICY IF EXISTS leads_tenant_insert ON leads;
DROP POLICY IF EXISTS leads_tenant_isolation ON leads;
DROP POLICY IF EXISTS vehicles_tenant_insert ON vehicles;
DROP POLICY IF EXISTS vehicles_tenant_isolation ON vehicles;

-- =========================================================================
-- Drop indexes
-- =========================================================================

DROP INDEX IF EXISTS idx_ab_tests_dealer;
DROP INDEX IF EXISTS idx_seo_metrics_dealer;
DROP INDEX IF EXISTS idx_page_views_session;
DROP INDEX IF EXISTS idx_page_views_dealer_created;
DROP INDEX IF EXISTS idx_leads_email;
DROP INDEX IF EXISTS idx_leads_dealer_created;
DROP INDEX IF EXISTS idx_leads_dealer_status;
DROP INDEX IF EXISTS idx_vehicles_dealer_body_style;
DROP INDEX IF EXISTS idx_vehicles_dealer_condition;
DROP INDEX IF EXISTS idx_vehicles_search;
DROP INDEX IF EXISTS idx_vehicles_dealer_created;
DROP INDEX IF EXISTS idx_vehicles_vin;
DROP INDEX IF EXISTS idx_vehicles_dealer_make_model;
DROP INDEX IF EXISTS idx_vehicles_dealer_status;

-- =========================================================================
-- Drop tables in reverse FK dependency order
-- (child tables before parent tables)
-- =========================================================================

DROP TABLE IF EXISTS ab_tests CASCADE;
DROP TABLE IF EXISTS seo_metrics CASCADE;
DROP TABLE IF EXISTS page_views CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS dealer_group_members CASCADE;
DROP TABLE IF EXISTS dealers CASCADE;
DROP TABLE IF EXISTS dealer_groups CASCADE;

-- =========================================================================
-- Drop functions
-- =========================================================================

DROP FUNCTION IF EXISTS vehicles_search_vector_update() CASCADE;
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

-- =========================================================================
-- Drop extensions (only if no other schemas depend on them)
-- Comment these out if other databases share the same PG instance.
-- =========================================================================

-- DROP EXTENSION IF EXISTS "pg_trgm";
-- DROP EXTENSION IF EXISTS "uuid-ossp";

COMMIT;
