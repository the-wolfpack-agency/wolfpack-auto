-- 030: Floor plan financing lines
-- Tracks vehicles financed through floor plan lenders (NextGear, AFC, Ally, etc.)

CREATE TABLE IF NOT EXISTS floor_plan_lines (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL,
  vehicle_vin TEXT NOT NULL,
  vehicle_desc TEXT,
  lender TEXT NOT NULL,  -- e.g. "NextGear Capital", "AFC", "Ally Floor Plan"
  principal NUMERIC(12,2) NOT NULL,
  daily_rate NUMERIC(8,6) NOT NULL,  -- e.g. 0.000164 (6% / 365)
  funded_date DATE NOT NULL,
  curtailment_date DATE,  -- when first payment reduction is due
  payoff_date DATE,       -- when paid off (null = still active)
  interest_accrued NUMERIC(10,2) DEFAULT 0,
  fees NUMERIC(10,2) DEFAULT 0,
  status TEXT CHECK (status IN ('active','curtailed','paid_off','repossessed')) DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_floor_plan_dealer ON floor_plan_lines(dealer_id);
CREATE INDEX IF NOT EXISTS idx_floor_plan_vin ON floor_plan_lines(vehicle_vin);
CREATE INDEX IF NOT EXISTS idx_floor_plan_status ON floor_plan_lines(dealer_id, status);
