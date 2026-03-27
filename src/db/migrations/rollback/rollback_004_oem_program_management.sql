-- Rollback: 004_oem_program_management
-- WARNING: This is destructive. Backup first.
-- Usage: psql $DATABASE_URL -f src/db/migrations/rollback/rollback_004_oem_program_management.sql
BEGIN;

-- =========================================================================
-- Drop triggers
-- =========================================================================

DROP TRIGGER IF EXISTS trg_lead_routing_rules_updated_at ON lead_routing_rules;
DROP TRIGGER IF EXISTS trg_brand_std_resp_updated_at ON oem_brand_standard_responses;
DROP TRIGGER IF EXISTS trg_oem_enrollments_updated_at ON oem_program_enrollments;
DROP TRIGGER IF EXISTS trg_oem_programs_updated_at ON oem_programs;
DROP TRIGGER IF EXISTS trg_oem_users_updated_at ON oem_users;
DROP TRIGGER IF EXISTS trg_oems_updated_at ON oems;

-- =========================================================================
-- Drop RLS policies
-- =========================================================================

DROP POLICY IF EXISTS lead_routing_rules_insert ON lead_routing_rules;
DROP POLICY IF EXISTS lead_routing_rules_isolation ON lead_routing_rules;
DROP POLICY IF EXISTS brand_std_resp_dealer_read ON oem_brand_standard_responses;
DROP POLICY IF EXISTS brand_std_items_via_program ON oem_brand_standard_items;
DROP POLICY IF EXISTS oem_enrollments_dealer_read ON oem_program_enrollments;
DROP POLICY IF EXISTS oem_programs_isolation ON oem_programs;

-- =========================================================================
-- Drop indexes added in 004
-- =========================================================================

DROP INDEX IF EXISTS idx_vehicles_featured;
DROP INDEX IF EXISTS idx_vehicles_arrival_date;
DROP INDEX IF EXISTS idx_vehicles_arrival;
DROP INDEX IF EXISTS idx_leads_converted;
DROP INDEX IF EXISTS idx_leads_assigned;
DROP INDEX IF EXISTS idx_dealers_oem;
DROP INDEX IF EXISTS idx_lead_routing_dealer;
DROP INDEX IF EXISTS idx_brand_std_resp_enroll;
DROP INDEX IF EXISTS idx_brand_std_items_program;
DROP INDEX IF EXISTS idx_oem_enrollments_status;
DROP INDEX IF EXISTS idx_oem_enrollments_dealer;
DROP INDEX IF EXISTS idx_oem_enrollments_program;
DROP INDEX IF EXISTS idx_oem_programs_oem_active;
DROP INDEX IF EXISTS idx_oem_programs_oem;
DROP INDEX IF EXISTS idx_oem_users_oem;
DROP INDEX IF EXISTS idx_oems_brand_code;
DROP INDEX IF EXISTS idx_oems_slug;

-- =========================================================================
-- Drop columns added to existing tables
-- =========================================================================

-- vehicles: pre-arrival / pipeline inventory columns
ALTER TABLE vehicles
  DROP COLUMN IF EXISTS arrival_status,
  DROP COLUMN IF EXISTS expected_arrival_date,
  DROP COLUMN IF EXISTS is_featured,
  DROP COLUMN IF EXISTS oem_window_sticker_url;

-- leads: close-rate tracking columns
ALTER TABLE leads
  DROP COLUMN IF EXISTS assigned_to,
  DROP COLUMN IF EXISTS first_response_at,
  DROP COLUMN IF EXISTS converted_at,
  DROP COLUMN IF EXISTS deal_value,
  DROP COLUMN IF EXISTS lead_score,
  DROP COLUMN IF EXISTS routing_rule_id;

-- dealers: OEM linkage columns
ALTER TABLE dealers
  DROP COLUMN IF EXISTS oem_id,
  DROP COLUMN IF EXISTS franchise_code;

-- =========================================================================
-- Drop new tables (in reverse FK dependency order)
-- =========================================================================

DROP TABLE IF EXISTS oem_brand_standard_responses CASCADE;
DROP TABLE IF EXISTS oem_brand_standard_items CASCADE;
DROP TABLE IF EXISTS lead_routing_rules CASCADE;
DROP TABLE IF EXISTS oem_program_enrollments CASCADE;
DROP TABLE IF EXISTS oem_programs CASCADE;
DROP TABLE IF EXISTS oem_users CASCADE;
DROP TABLE IF EXISTS oems CASCADE;

COMMIT;
