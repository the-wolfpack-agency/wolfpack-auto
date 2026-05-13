-- Migration 047: Deep F&I Desking
-- Full deal structuring workspace, F&I product menus, profit analysis,
-- lender submission workflow, deal comparison, and compliance tracking.

BEGIN;

-- =============================================================================
-- Deal Desk (the core desking workspace — one row per active deal scenario)
-- =============================================================================

CREATE TABLE deal_desk (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  -- `fi_deals` is not a real table; the F&I deal record lives in
  -- `deal_worksheets` (migration 021). deal_worksheets.id is TEXT
  -- (gen_random_uuid()::text), so the FK column must be TEXT.
  deal_id         TEXT REFERENCES deal_worksheets(id) ON DELETE SET NULL,
  vehicle_id      UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  customer_id     UUID,

  -- Deal structure
  deal_type       TEXT NOT NULL DEFAULT 'retail',  -- retail, lease, cash, wholesale
  status          TEXT NOT NULL DEFAULT 'draft',   -- draft, presented, negotiating, approved, signed, funded, unwound

  -- Vehicle pricing
  msrp            NUMERIC(12,2) NOT NULL DEFAULT 0,
  invoice         NUMERIC(12,2) NOT NULL DEFAULT 0,
  selling_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  holdback        NUMERIC(12,2) NOT NULL DEFAULT 0,
  pack            NUMERIC(12,2) NOT NULL DEFAULT 0,  -- dealer pack deduction

  -- Trade-in
  trade_vin       TEXT,
  trade_acv       NUMERIC(12,2) NOT NULL DEFAULT 0,  -- actual cash value
  trade_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,  -- what customer sees
  trade_payoff    NUMERIC(12,2) NOT NULL DEFAULT 0,
  trade_over_allow NUMERIC(12,2) GENERATED ALWAYS AS (trade_allowance - trade_acv) STORED,

  -- Fees & taxes
  doc_fee         NUMERIC(10,2) NOT NULL DEFAULT 0,
  title_fee       NUMERIC(10,2) NOT NULL DEFAULT 0,
  registration_fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(5,4) NOT NULL DEFAULT 0,
  total_tax       NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_fees      JSONB NOT NULL DEFAULT '[]',  -- [{name, amount, taxable}]

  -- Down payment
  cash_down       NUMERIC(12,2) NOT NULL DEFAULT 0,
  rebates         NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Finance terms
  term_months     INTEGER NOT NULL DEFAULT 72,
  apr             NUMERIC(5,3) NOT NULL DEFAULT 0,
  monthly_payment NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_financed NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_of_payments NUMERIC(12,2) NOT NULL DEFAULT 0,
  finance_charge  NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Lease terms (when deal_type = 'lease')
  residual_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  residual_value  NUMERIC(12,2) NOT NULL DEFAULT 0,
  money_factor    NUMERIC(8,6) NOT NULL DEFAULT 0,
  lease_payment   NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- Profit analysis
  front_gross     NUMERIC(12,2) NOT NULL DEFAULT 0,
  back_gross      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_gross     NUMERIC(12,2) GENERATED ALWAYS AS (front_gross + back_gross) STORED,
  fi_per_copy     NUMERIC(12,2) NOT NULL DEFAULT 0,  -- F&I profit per retail unit

  -- Lender
  lender_id       UUID,
  lender_name     TEXT,
  lender_program  TEXT,
  lender_decision TEXT,  -- approved, conditioned, declined, pending
  lender_stipulations JSONB NOT NULL DEFAULT '[]',
  submitted_to_lender_at TIMESTAMPTZ,
  lender_response_at TIMESTAMPTZ,

  -- Metadata
  created_by      UUID,
  presented_at    TIMESTAMPTZ,
  signed_at       TIMESTAMPTZ,
  funded_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_desk_dealer ON deal_desk (dealer_id);
CREATE INDEX idx_deal_desk_status ON deal_desk (dealer_id, status);
CREATE INDEX idx_deal_desk_vehicle ON deal_desk (vehicle_id);

ALTER TABLE deal_desk ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_desk_tenant ON deal_desk
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- F&I Product Catalog (menu items dealers can add to deals)
-- =============================================================================

CREATE TABLE fi_products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'warranty',
    -- warranty, gap, paint_protection, tire_wheel, theft, maintenance, appearance, other
  provider        TEXT NOT NULL DEFAULT '',       -- product provider company
  description     TEXT NOT NULL DEFAULT '',

  -- Pricing
  cost            NUMERIC(10,2) NOT NULL DEFAULT 0,  -- dealer cost
  retail_price    NUMERIC(10,2) NOT NULL DEFAULT 0,  -- price to customer
  max_markup      NUMERIC(10,2),                     -- max allowed markup
  commission_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,   -- salesperson commission %

  -- Terms
  term_months     INTEGER,
  mileage_limit   INTEGER,
  deductible      NUMERIC(10,2),

  -- Status
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,

  -- Performance tracking
  times_presented INTEGER NOT NULL DEFAULT 0,
  times_accepted  INTEGER NOT NULL DEFAULT 0,
  total_profit    NUMERIC(12,2) NOT NULL DEFAULT 0,
  acceptance_rate NUMERIC(5,4) NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fi_products_dealer ON fi_products (dealer_id);
CREATE INDEX idx_fi_products_category ON fi_products (dealer_id, category);

ALTER TABLE fi_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY fi_products_tenant ON fi_products
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Deal F&I Line Items (products added to a specific deal)
-- =============================================================================

CREATE TABLE deal_fi_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  deal_desk_id    UUID NOT NULL REFERENCES deal_desk(id) ON DELETE CASCADE,
  fi_product_id   UUID REFERENCES fi_products(id) ON DELETE SET NULL,

  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  cost            NUMERIC(10,2) NOT NULL DEFAULT 0,
  selling_price   NUMERIC(10,2) NOT NULL DEFAULT 0,
  profit          NUMERIC(10,2) GENERATED ALWAYS AS (selling_price - cost) STORED,

  -- Status
  status          TEXT NOT NULL DEFAULT 'presented',  -- presented, accepted, declined
  presented_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at      TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_fi_items_deal ON deal_fi_items (deal_desk_id);

ALTER TABLE deal_fi_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_fi_items_tenant ON deal_fi_items
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Deal Scenarios (multiple payment scenarios for comparison)
-- =============================================================================

CREATE TABLE deal_scenarios (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  deal_desk_id    UUID NOT NULL REFERENCES deal_desk(id) ON DELETE CASCADE,

  label           TEXT NOT NULL DEFAULT 'Option A',  -- customer-facing label
  term_months     INTEGER NOT NULL,
  apr             NUMERIC(5,3) NOT NULL,
  cash_down       NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_payment NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_cost      NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_selected     BOOLEAN NOT NULL DEFAULT false,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_scenarios_deal ON deal_scenarios (deal_desk_id);

ALTER TABLE deal_scenarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY deal_scenarios_tenant ON deal_scenarios
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Lender Programs (rate sheets and programs from each lender)
-- =============================================================================

CREATE TABLE lender_programs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  lender_id       UUID,

  lender_name     TEXT NOT NULL,
  program_name    TEXT NOT NULL,
  deal_types      TEXT[] NOT NULL DEFAULT '{retail}',  -- retail, lease

  -- Rate tiers (JSONB array of {min_score, max_score, min_term, max_term, rate, advance_pct})
  rate_tiers      JSONB NOT NULL DEFAULT '[]',

  -- Limits
  max_advance     NUMERIC(5,2),        -- max advance % of invoice/NADA
  max_term        INTEGER DEFAULT 84,
  min_amount      NUMERIC(12,2),
  max_amount      NUMERIC(12,2),
  max_ltv         NUMERIC(5,2),        -- max loan-to-value

  -- Reserve
  flat_fee        NUMERIC(10,2),       -- flat reserve fee
  reserve_markup  NUMERIC(5,3),        -- max dealer markup on rate

  is_active       BOOLEAN NOT NULL DEFAULT true,
  effective_date  DATE,
  expiry_date     DATE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lender_programs_dealer ON lender_programs (dealer_id);

ALTER TABLE lender_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY lender_programs_tenant ON lender_programs
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- Triggers
CREATE TRIGGER trg_deal_desk_updated BEFORE UPDATE ON deal_desk
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();
CREATE TRIGGER trg_fi_products_updated BEFORE UPDATE ON fi_products
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();
CREATE TRIGGER trg_lender_programs_updated BEFORE UPDATE ON lender_programs
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();

COMMIT;
