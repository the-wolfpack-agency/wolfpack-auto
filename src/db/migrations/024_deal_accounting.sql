-- Deal accounting: sales log, commissions, financial reporting
CREATE TABLE IF NOT EXISTS sales_log (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id     UUID NOT NULL REFERENCES dealers(id),
  deal_id       TEXT REFERENCES deal_worksheets(id),
  vehicle_vin   TEXT NOT NULL,
  vehicle_desc  TEXT,
  customer_name TEXT NOT NULL,
  sale_date     DATE NOT NULL,

  -- Pricing
  selling_price NUMERIC(12,2) NOT NULL,
  invoice_cost  NUMERIC(12,2),
  holdback      NUMERIC(10,2) DEFAULT 0,
  pack_cost     NUMERIC(10,2) DEFAULT 0,

  -- Trade
  trade_value   NUMERIC(12,2) DEFAULT 0,
  trade_acv     NUMERIC(12,2) DEFAULT 0,  -- actual cash value

  -- Gross breakdown
  front_gross   NUMERIC(12,2) DEFAULT 0,
  back_gross    NUMERIC(12,2) DEFAULT 0,
  total_gross   NUMERIC(12,2) DEFAULT 0,

  -- F&I
  fi_income     NUMERIC(12,2) DEFAULT 0,
  reserve_income NUMERIC(10,2) DEFAULT 0,  -- finance reserve

  -- People
  salesperson   TEXT,
  fi_manager    TEXT,
  sales_manager TEXT,

  deal_type     TEXT DEFAULT 'retail' CHECK (deal_type IN ('retail','lease','cash','wholesale')),
  funded        BOOLEAN DEFAULT false,
  funded_at     TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_log_dealer ON sales_log(dealer_id);
CREATE INDEX idx_sales_log_date ON sales_log(dealer_id, sale_date);
CREATE INDEX idx_sales_log_person ON sales_log(dealer_id, salesperson);

CREATE TABLE IF NOT EXISTS commissions (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id     UUID NOT NULL REFERENCES dealers(id),
  sale_id       TEXT REFERENCES sales_log(id),
  employee_name TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('salesperson','fi_manager','sales_manager','bdc')),
  commission_type TEXT NOT NULL CHECK (commission_type IN ('flat','percentage','mini','bonus')),
  gross_basis   NUMERIC(12,2),  -- the gross the commission is calculated from
  rate          NUMERIC(8,4),   -- percentage (0.25 = 25%) or flat amount
  amount        NUMERIC(10,2) NOT NULL,
  pay_period    TEXT,  -- e.g. '2026-03' for March 2026
  paid          BOOLEAN DEFAULT false,
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_commissions_dealer ON commissions(dealer_id);
CREATE INDEX idx_commissions_employee ON commissions(dealer_id, employee_name);
CREATE INDEX idx_commissions_period ON commissions(dealer_id, pay_period);
