-- Wolfpack Auto — OEM Program Management Layer
-- Migration: 004_oem_program_management
--
-- Adds multi-tier tenancy: OEM → Dealer Group → Dealer
-- Also adds lead close-rate tracking and pre-arrival inventory fields.

BEGIN;

-- =============================================================================
-- OEM (Original Equipment Manufacturer) organizations
-- e.g. Ford Motor Company, General Motors, Toyota, Honda
-- =============================================================================

CREATE TABLE oems (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  brand_code    TEXT NOT NULL UNIQUE,           -- e.g. 'FORD', 'GM', 'TOYOTA'
  logo_url      TEXT NOT NULL DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '#000000',
  contact_email TEXT NOT NULL DEFAULT '',
  website_url   TEXT NOT NULL DEFAULT '',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  settings      JSONB NOT NULL DEFAULT '{}',    -- OEM-level feature flags / config
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- OEM Users — regional managers, brand analysts, field reps
-- =============================================================================

CREATE TABLE oem_users (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id     UUID NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'analyst',
  region     TEXT,                              -- optional geographic region
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_oem_user_role CHECK (
    role IN ('admin', 'regional_manager', 'analyst', 'field_rep', 'read_only')
  )
);

-- =============================================================================
-- OEM Programs — incentive programs, certification tiers, brand standards
-- =============================================================================

CREATE TABLE oem_programs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id           UUID NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL,
  type             TEXT NOT NULL DEFAULT 'incentive',
  description      TEXT NOT NULL DEFAULT '',
  requirements     JSONB NOT NULL DEFAULT '[]',  -- list of requirement objects
  benefits         JSONB NOT NULL DEFAULT '[]',  -- list of benefit objects
  incentive_amount NUMERIC(12, 2),               -- $ amount if financial incentive
  incentive_pct    NUMERIC(5, 2),                -- % amount if percentage incentive
  start_date       DATE,
  end_date         DATE,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  is_required      BOOLEAN NOT NULL DEFAULT false, -- mandatory brand standard
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_program_type CHECK (
    type IN ('incentive', 'certification', 'brand_standard', 'training', 'co_op_advertising')
  ),
  UNIQUE (oem_id, slug)
);

-- =============================================================================
-- OEM Program Enrollments — dealer participation in OEM programs
-- =============================================================================

CREATE TABLE oem_program_enrollments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id     UUID NOT NULL REFERENCES oem_programs(id) ON DELETE CASCADE,
  dealer_id      UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'enrolled',
  enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ,
  score          NUMERIC(5, 2),               -- compliance / certification score
  notes          TEXT NOT NULL DEFAULT '',
  metadata       JSONB NOT NULL DEFAULT '{}',  -- program-specific tracking data
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_enrollment_status CHECK (
    status IN ('enrolled', 'in_progress', 'completed', 'expired', 'withdrawn')
  ),
  UNIQUE (program_id, dealer_id)
);

-- =============================================================================
-- OEM Brand Standards Checklist Items
-- Detailed compliance requirements a dealer must meet
-- =============================================================================

CREATE TABLE oem_brand_standard_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id   UUID NOT NULL REFERENCES oem_programs(id) ON DELETE CASCADE,
  category     TEXT NOT NULL,                  -- 'facility', 'digital', 'training', 'inventory'
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  weight       NUMERIC(5, 2) NOT NULL DEFAULT 1.0,  -- scoring weight
  is_mandatory BOOLEAN NOT NULL DEFAULT false,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dealer responses to brand standard checklist items
CREATE TABLE oem_brand_standard_responses (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id            UUID NOT NULL REFERENCES oem_brand_standard_items(id) ON DELETE CASCADE,
  enrollment_id      UUID NOT NULL REFERENCES oem_program_enrollments(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'pending',
  evidence_url       TEXT,
  notes              TEXT NOT NULL DEFAULT '',
  reviewed_by        UUID REFERENCES oem_users(id),
  reviewed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_response_status CHECK (
    status IN ('pending', 'submitted', 'approved', 'rejected', 'waived')
  ),
  UNIQUE (item_id, enrollment_id)
);

-- =============================================================================
-- Lead Routing Rules — auto-assign leads to sales reps or queues
-- =============================================================================

CREATE TABLE lead_routing_rules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id   UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  priority    INTEGER NOT NULL DEFAULT 0,       -- higher = evaluated first
  conditions  JSONB NOT NULL DEFAULT '{}',      -- {source, vehicle_make, lead_score, etc.}
  action      JSONB NOT NULL DEFAULT '{}',      -- {assign_to_user, assign_to_queue, notify}
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- Alter existing tables — add OEM linkage + lead close-rate + pre-arrival
-- =============================================================================

-- Link dealers to an OEM (optional — not all dealers are franchise)
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS oem_id UUID REFERENCES oems(id) ON DELETE SET NULL;
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS franchise_code TEXT;  -- e.g. dealer franchise number

-- Lead close-rate tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to     UUID;   -- user_id reference (soft ref)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_at    TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_value      NUMERIC(12, 2);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS routing_rule_id UUID REFERENCES lead_routing_rules(id) ON DELETE SET NULL;

-- Pre-arrival / pipeline inventory
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS arrival_status      TEXT NOT NULL DEFAULT 'in_stock'
  CHECK (arrival_status IN ('in_stock', 'in_transit', 'factory_order', 'arriving_soon'));
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS expected_arrival_date DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_featured           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS oem_window_sticker_url TEXT;

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_oems_slug               ON oems (slug);
CREATE INDEX idx_oems_brand_code         ON oems (brand_code);
CREATE INDEX idx_oem_users_oem           ON oem_users (oem_id);
CREATE INDEX idx_oem_programs_oem        ON oem_programs (oem_id);
CREATE INDEX idx_oem_programs_oem_active ON oem_programs (oem_id, is_active);
CREATE INDEX idx_oem_enrollments_program ON oem_program_enrollments (program_id);
CREATE INDEX idx_oem_enrollments_dealer  ON oem_program_enrollments (dealer_id);
CREATE INDEX idx_oem_enrollments_status  ON oem_program_enrollments (dealer_id, status);
CREATE INDEX idx_brand_std_items_program ON oem_brand_standard_items (program_id);
CREATE INDEX idx_brand_std_resp_enroll   ON oem_brand_standard_responses (enrollment_id);
CREATE INDEX idx_lead_routing_dealer     ON lead_routing_rules (dealer_id, priority DESC);
CREATE INDEX idx_dealers_oem             ON dealers (oem_id);
CREATE INDEX idx_leads_assigned          ON leads (dealer_id, assigned_to);
CREATE INDEX idx_leads_converted         ON leads (dealer_id, converted_at);
CREATE INDEX idx_vehicles_arrival        ON vehicles (dealer_id, arrival_status);
CREATE INDEX idx_vehicles_arrival_date   ON vehicles (dealer_id, expected_arrival_date);
CREATE INDEX idx_vehicles_featured       ON vehicles (dealer_id, is_featured) WHERE is_featured = true;

-- =============================================================================
-- Row-Level Security for new tables
-- OEM tables use oem_id-based isolation (set via app.current_oem_id)
-- Dealer-scoped tables reuse the existing dealer isolation pattern
-- =============================================================================

ALTER TABLE oem_programs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE oem_program_enrollments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE oem_brand_standard_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE oem_brand_standard_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_routing_rules         ENABLE ROW LEVEL SECURITY;

-- OEM programs: visible to users of the same OEM
CREATE POLICY oem_programs_isolation ON oem_programs
  USING (oem_id = current_setting('app.current_oem_id', true)::uuid);

-- Enrollments: visible to the dealer they belong to
CREATE POLICY oem_enrollments_dealer_read ON oem_program_enrollments
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- Brand standard items: visible if you can see the parent program
CREATE POLICY brand_std_items_via_program ON oem_brand_standard_items
  USING (
    program_id IN (
      SELECT id FROM oem_programs
      WHERE oem_id = current_setting('app.current_oem_id', true)::uuid
    )
  );

-- Brand standard responses: visible to the enrolled dealer
CREATE POLICY brand_std_resp_dealer_read ON oem_brand_standard_responses
  USING (
    enrollment_id IN (
      SELECT id FROM oem_program_enrollments
      WHERE dealer_id = current_setting('app.current_dealer_id', true)::uuid
    )
  );

-- Lead routing rules: tenant-isolated to dealer
CREATE POLICY lead_routing_rules_isolation ON lead_routing_rules
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

CREATE POLICY lead_routing_rules_insert ON lead_routing_rules
  FOR INSERT
  WITH CHECK (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Updated-at triggers
-- =============================================================================

CREATE TRIGGER trg_oems_updated_at
  BEFORE UPDATE ON oems
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_oem_users_updated_at
  BEFORE UPDATE ON oem_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_oem_programs_updated_at
  BEFORE UPDATE ON oem_programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_oem_enrollments_updated_at
  BEFORE UPDATE ON oem_program_enrollments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_brand_std_resp_updated_at
  BEFORE UPDATE ON oem_brand_standard_responses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_lead_routing_rules_updated_at
  BEFORE UPDATE ON lead_routing_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
