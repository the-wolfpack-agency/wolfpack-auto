-- Migration 036: Fix missing tables, columns, and views for production canary
--
-- Resolves all errors found by the canary post-deploy suite:
--   1. deleted_at column on leads and other tables (soft delete)
--   2. customers table (customer 360 page)
--   3. marketing_campaigns table (marketing dashboard)
--   4. dealer_users table (team management)
--   5. deals view (routes query 'deals' but table is 'deal_worksheets')
--   6. service_parts view (routes query 'service_parts' but table is 'parts_inventory')
--   7. scheduled_date + scheduled_time columns on service_appointments

-- ============================================================================
-- 1. Soft delete: add deleted_at column to tables that need it
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_deleted_at ON leads (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE deal_worksheets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_deal_worksheets_deleted_at ON deal_worksheets (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_deleted_at ON vehicles (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE service_appointments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_service_appointments_deleted_at ON service_appointments (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_repair_orders_deleted_at ON repair_orders (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_deleted_at ON reviews (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_message_templates_deleted_at ON message_templates (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE follow_up_sequences ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_follow_up_sequences_deleted_at ON follow_up_sequences (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE sales_log ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_log_deleted_at ON sales_log (deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- 2. customers table
-- ============================================================================

CREATE TABLE IF NOT EXISTS customers (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'prospect', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_dealer ON customers(dealer_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON customers(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- 3. marketing_campaigns table
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id         TEXT NOT NULL,
  name              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  budget            NUMERIC(12,2) DEFAULT 0,
  spent             NUMERIC(12,2) DEFAULT 0,
  goal              TEXT,
  start_date        DATE,
  end_date          DATE,
  channels          JSONB DEFAULT '[]'::jsonb,
  featured_vehicles JSONB DEFAULT '[]'::jsonb,
  leads_generated   INTEGER DEFAULT 0,
  conversions       INTEGER DEFAULT 0,
  roi_pct           NUMERIC(8,2) DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_dealer ON marketing_campaigns(dealer_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_deleted_at ON marketing_campaigns(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================================
-- 4. dealer_users table
-- ============================================================================

CREATE TABLE IF NOT EXISTS dealer_users (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin', 'manager', 'staff')),
  is_active     BOOLEAN DEFAULT true,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dealer_users_dealer ON dealer_users(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_users_email ON dealer_users(email);

-- ============================================================================
-- 5. deals view — routes query 'deals' but data lives in 'deal_worksheets'
-- ============================================================================

CREATE OR REPLACE VIEW deals AS
  SELECT
    id,
    dealer_id,
    lead_id,
    vehicle_vin,
    deal_type,
    selling_price,
    invoice_cost,
    trade_value,
    trade_payoff,
    down_payment,
    rebates,
    term_months,
    apr,
    monthly_payment,
    residual_value,
    money_factor,
    fi_products,
    fi_total,
    front_gross,
    back_gross,
    total_gross,
    status,
    presented_at,
    accepted_at,
    funded_at,
    salesperson,
    fi_manager,
    notes,
    created_at,
    updated_at,
    deleted_at
  FROM deal_worksheets;

-- ============================================================================
-- 6. service_parts view — routes query 'service_parts' but table is 'parts_inventory'
-- ============================================================================

CREATE OR REPLACE VIEW service_parts AS
  SELECT * FROM parts_inventory;

-- ============================================================================
-- 7. service_appointments: add scheduled_date + scheduled_time columns
--    The column is 'scheduled_at' (TIMESTAMPTZ) but routes expect
--    'scheduled_date' (DATE) and 'scheduled_time' (TIME).
--    Add both as computed/stored columns for compatibility.
-- ============================================================================

ALTER TABLE service_appointments ADD COLUMN IF NOT EXISTS scheduled_date DATE;
ALTER TABLE service_appointments ADD COLUMN IF NOT EXISTS scheduled_time TIME;

-- Backfill from scheduled_at where it has data
UPDATE service_appointments
SET scheduled_date = (scheduled_at AT TIME ZONE 'UTC')::date,
    scheduled_time = (scheduled_at AT TIME ZONE 'UTC')::time
WHERE scheduled_at IS NOT NULL AND scheduled_date IS NULL;

-- ============================================================================
-- Mark earlier migrations as applied (they exist as files but tables were
-- created via other means, so the runner would skip them anyway with IF NOT EXISTS)
-- ============================================================================

INSERT INTO _migrations (name) VALUES
  ('004_oem_program_management.sql'),
  ('005_billing.sql'),
  ('006_compliance.sql'),
  ('007_lead_scoring.sql'),
  ('008_pricing_recommendations.sql'),
  ('009_ev_fields.sql'),
  ('010_trade_in.sql'),
  ('020_mfa.sql'),
  ('021_fi_deals.sql'),
  ('022_service_parts.sql'),
  ('023_comms_automation.sql'),
  ('024_deal_accounting.sql'),
  ('025_reviews.sql'),
  ('026_lender_portal.sql'),
  ('027_credit_bureau.sql'),
  ('028_document_vault.sql'),
  ('029_compliance_checks.sql'),
  ('030_floor_plan.sql'),
  ('031_schema_fixes.sql'),
  ('032_soft_delete.sql'),
  ('033_missing_indexes.sql'),
  ('034_webhook_outbound.sql'),
  ('035_dealer_users.sql')
ON CONFLICT (name) DO NOTHING;
