-- Migration 032: Add soft-delete support (deleted_at column) to key tables
-- Instead of DELETE FROM, routes will UPDATE SET deleted_at = NOW()
-- All SELECT queries must include WHERE deleted_at IS NULL

BEGIN;

-- Leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_deleted_at ON leads (deleted_at) WHERE deleted_at IS NULL;

-- Deals / deal worksheets
ALTER TABLE deal_worksheets ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_deal_worksheets_deleted_at ON deal_worksheets (deleted_at) WHERE deleted_at IS NULL;

-- Vehicles (inventory)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_deleted_at ON vehicles (deleted_at) WHERE deleted_at IS NULL;

-- Service appointments
ALTER TABLE service_appointments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_service_appointments_deleted_at ON service_appointments (deleted_at) WHERE deleted_at IS NULL;

-- Repair orders
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_repair_orders_deleted_at ON repair_orders (deleted_at) WHERE deleted_at IS NULL;

-- Reviews
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_deleted_at ON reviews (deleted_at) WHERE deleted_at IS NULL;

-- Documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON documents (deleted_at) WHERE deleted_at IS NULL;

-- Message templates
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_message_templates_deleted_at ON message_templates (deleted_at) WHERE deleted_at IS NULL;

-- Follow-up sequences
ALTER TABLE follow_up_sequences ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_follow_up_sequences_deleted_at ON follow_up_sequences (deleted_at) WHERE deleted_at IS NULL;

-- Sales log
ALTER TABLE sales_log ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_log_deleted_at ON sales_log (deleted_at) WHERE deleted_at IS NULL;

-- Webhooks
-- Defensive: `webhooks` is not created by any migration in the tree
-- (production has it from legacy/manual state). On a fresh DB this
-- migration runs before any such legacy state exists, so skip cleanly
-- when the table is absent. Established envs keep the existing
-- ADD COLUMN IF NOT EXISTS semantic untouched.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'webhooks'
  ) THEN
    ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_webhooks_deleted_at ON webhooks (deleted_at) WHERE deleted_at IS NULL;
  END IF;
END
$$;

COMMIT;
