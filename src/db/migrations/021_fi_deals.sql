-- F&I Deal Desking: deal worksheets, F&I products, lender submissions
CREATE TABLE IF NOT EXISTS deal_worksheets (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id     UUID NOT NULL REFERENCES dealers(id),
  lead_id       UUID REFERENCES leads(id),
  vehicle_vin   TEXT NOT NULL,

  -- Deal structure
  deal_type     TEXT NOT NULL DEFAULT 'retail' CHECK (deal_type IN ('retail','lease','cash')),
  selling_price NUMERIC(12,2) NOT NULL,
  invoice_cost  NUMERIC(12,2),
  trade_value   NUMERIC(12,2) DEFAULT 0,
  trade_payoff  NUMERIC(12,2) DEFAULT 0,
  down_payment  NUMERIC(12,2) DEFAULT 0,
  rebates       NUMERIC(12,2) DEFAULT 0,

  -- Financing
  term_months   INTEGER DEFAULT 60,
  apr           NUMERIC(5,2),
  monthly_payment NUMERIC(10,2),
  residual_value  NUMERIC(12,2),  -- lease only
  money_factor    NUMERIC(8,6),   -- lease only

  -- F&I products (stored as JSONB array)
  fi_products   JSONB DEFAULT '[]',
  fi_total      NUMERIC(12,2) DEFAULT 0,

  -- Gross
  front_gross   NUMERIC(12,2),
  back_gross    NUMERIC(12,2),
  total_gross   NUMERIC(12,2),

  -- Status
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','presented','accepted','funded','unwound')),
  presented_at  TIMESTAMPTZ,
  accepted_at   TIMESTAMPTZ,
  funded_at     TIMESTAMPTZ,

  salesperson   TEXT,
  fi_manager    TEXT,
  notes         TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deal_worksheets_dealer ON deal_worksheets(dealer_id);
CREATE INDEX idx_deal_worksheets_status ON deal_worksheets(dealer_id, status);

-- F&I product catalog (warranties, GAP, paint protection, etc.)
CREATE TABLE IF NOT EXISTS fi_product_catalog (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID NOT NULL REFERENCES dealers(id),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('warranty','gap','paint_protection','tire_wheel','theft','maintenance','other')),
  provider    TEXT,
  cost        NUMERIC(10,2) NOT NULL,
  retail_price NUMERIC(10,2) NOT NULL,
  term_months INTEGER,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lender submissions
CREATE TABLE IF NOT EXISTS lender_submissions (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  deal_id       TEXT NOT NULL REFERENCES deal_worksheets(id),
  lender_name   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','conditioned','declined','funded')),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMPTZ,
  approved_amount NUMERIC(12,2),
  approved_rate   NUMERIC(5,2),
  approved_term   INTEGER,
  conditions    TEXT,
  notes         TEXT
);
