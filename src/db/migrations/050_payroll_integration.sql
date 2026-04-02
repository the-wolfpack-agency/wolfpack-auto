-- Migration 050: Payroll Integration Layer
-- Integration with external payroll providers (Gusto, ADP, Paychex).
-- Stores employee records, time entries, commission calculations,
-- and sync status — the actual payroll processing is handled by the provider.

BEGIN;

-- =============================================================================
-- Payroll Provider Configuration
-- =============================================================================

CREATE TABLE payroll_config (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,

  provider        TEXT NOT NULL DEFAULT 'gusto',  -- gusto, adp, paychex, manual
  status          TEXT NOT NULL DEFAULT 'disconnected',  -- disconnected, connecting, active, error

  -- OAuth / API credentials (encrypted references, not raw keys)
  access_token_ref TEXT,   -- reference to secret in vault
  refresh_token_ref TEXT,
  external_company_id TEXT, -- provider's company ID

  -- Sync settings
  auto_sync       BOOLEAN NOT NULL DEFAULT true,
  sync_frequency  TEXT NOT NULL DEFAULT 'daily',  -- daily, weekly, on_period_close
  last_sync_at    TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (dealer_id)
);

ALTER TABLE payroll_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY pc_tenant ON payroll_config
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Employee Records (synced from payroll provider)
-- =============================================================================

CREATE TABLE employee_records (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  user_id         UUID,  -- link to dealer_users if applicable

  -- External IDs
  external_employee_id TEXT,  -- provider's employee ID

  -- Info
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT,
  department      TEXT NOT NULL DEFAULT 'sales',
    -- sales, finance, service, parts, admin, management
  job_title       TEXT NOT NULL DEFAULT '',
  employment_type TEXT NOT NULL DEFAULT 'full_time',  -- full_time, part_time, contractor

  -- Compensation
  pay_type        TEXT NOT NULL DEFAULT 'salary',  -- salary, hourly, commission, draw
  pay_rate        NUMERIC(12,2) NOT NULL DEFAULT 0,  -- annual salary or hourly rate
  commission_plan TEXT,  -- reference to commission structure

  -- Status
  status          TEXT NOT NULL DEFAULT 'active',  -- active, on_leave, terminated
  hire_date       DATE,
  termination_date DATE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (dealer_id, external_employee_id)
);

CREATE INDEX idx_emp_dealer ON employee_records (dealer_id);
CREATE INDEX idx_emp_department ON employee_records (dealer_id, department);

ALTER TABLE employee_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY emp_tenant ON employee_records
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Time Entries (clock in/out, hours worked)
-- =============================================================================

CREATE TABLE time_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employee_records(id) ON DELETE CASCADE,

  entry_date      DATE NOT NULL,
  clock_in        TIMESTAMPTZ NOT NULL,
  clock_out       TIMESTAMPTZ,
  break_minutes   INTEGER NOT NULL DEFAULT 0,
  total_hours     NUMERIC(5,2),
  overtime_hours  NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- Source
  source          TEXT NOT NULL DEFAULT 'manual',  -- manual, kiosk, mobile, imported
  approved        BOOLEAN NOT NULL DEFAULT false,
  approved_by     UUID,

  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_te_employee ON time_entries (employee_id);
CREATE INDEX idx_te_date ON time_entries (dealer_id, entry_date);

ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY te_tenant ON time_entries
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Commission Calculations (auto-calculated from deals)
-- =============================================================================

CREATE TABLE commission_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employee_records(id) ON DELETE CASCADE,

  -- Source
  source_type     TEXT NOT NULL,  -- deal, service_ro, spiff, bonus, draw
  source_id       UUID,

  -- Calculation
  gross_profit    NUMERIC(12,2) NOT NULL DEFAULT 0,  -- deal gross that commission is based on
  commission_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Pay period
  pay_period_start DATE,
  pay_period_end   DATE,

  -- Status
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending, approved, paid, adjusted
  approved_by     UUID,
  paid_at         TIMESTAMPTZ,

  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ce_employee ON commission_entries (employee_id);
CREATE INDEX idx_ce_period ON commission_entries (dealer_id, pay_period_start, pay_period_end);

ALTER TABLE commission_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ce_tenant ON commission_entries
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Payroll Sync Log (audit trail of all sync operations)
-- =============================================================================

CREATE TABLE payroll_sync_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,

  sync_type       TEXT NOT NULL,  -- employees, time_entries, commissions, full
  direction       TEXT NOT NULL DEFAULT 'push',  -- push (to provider), pull (from provider)
  status          TEXT NOT NULL DEFAULT 'started',  -- started, completed, failed
  records_synced  INTEGER NOT NULL DEFAULT 0,
  errors          JSONB NOT NULL DEFAULT '[]',

  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_psl_dealer ON payroll_sync_log (dealer_id);

ALTER TABLE payroll_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY psl_tenant ON payroll_sync_log
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- Triggers
CREATE TRIGGER trg_pc_updated BEFORE UPDATE ON payroll_config
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();
CREATE TRIGGER trg_emp_updated BEFORE UPDATE ON employee_records
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();
CREATE TRIGGER trg_ce_updated BEFORE UPDATE ON commission_entries
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();

COMMIT;
