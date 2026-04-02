-- Migration 048: General Ledger & Financial Statements
-- Chart of accounts, journal entries, financial periods,
-- multi-company support, and automated posting from deals/service.

BEGIN;

-- =============================================================================
-- Chart of Accounts
-- =============================================================================

CREATE TABLE chart_of_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,

  account_number  TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',

  -- Classification
  account_type    TEXT NOT NULL,
    -- asset, liability, equity, revenue, expense, cogs
  sub_type        TEXT NOT NULL DEFAULT '',
    -- cash, accounts_receivable, inventory, fixed_asset, accounts_payable,
    -- notes_payable, retained_earnings, sales_revenue, service_revenue,
    -- fi_revenue, cost_of_sales, operating_expense, payroll_expense, etc.
  normal_balance  TEXT NOT NULL DEFAULT 'debit',  -- debit, credit

  -- Hierarchy
  parent_id       UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  depth           INTEGER NOT NULL DEFAULT 0,

  -- Status
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_system       BOOLEAN NOT NULL DEFAULT false,  -- system-generated, not deletable
  is_header       BOOLEAN NOT NULL DEFAULT false,  -- grouping header, not postable

  -- Running balance (updated by triggers)
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (dealer_id, account_number)
);

CREATE INDEX idx_coa_dealer ON chart_of_accounts (dealer_id);
CREATE INDEX idx_coa_type ON chart_of_accounts (dealer_id, account_type);
CREATE INDEX idx_coa_parent ON chart_of_accounts (parent_id);

ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY coa_tenant ON chart_of_accounts
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Financial Periods (monthly close tracking)
-- =============================================================================

CREATE TABLE financial_periods (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,

  period_year     INTEGER NOT NULL,
  period_month    INTEGER NOT NULL,  -- 1-12
  label           TEXT NOT NULL,     -- "2026-04", "April 2026"

  status          TEXT NOT NULL DEFAULT 'open',  -- open, closing, closed, locked
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  closed_by       UUID,

  -- Period totals (updated on close)
  total_revenue   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_expenses  NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_income      NUMERIC(14,2) NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (dealer_id, period_year, period_month)
);

ALTER TABLE financial_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY fp_tenant ON financial_periods
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Journal Entries (double-entry bookkeeping)
-- =============================================================================

CREATE TABLE journal_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  period_id       UUID REFERENCES financial_periods(id),

  -- Entry metadata
  entry_number    SERIAL,
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  description     TEXT NOT NULL,
  memo            TEXT NOT NULL DEFAULT '',

  -- Source (what generated this entry)
  source_type     TEXT NOT NULL DEFAULT 'manual',
    -- manual, deal, service_ro, payment, payroll, adjustment, closing
  source_id       UUID,  -- reference to the source record

  -- Status
  status          TEXT NOT NULL DEFAULT 'posted',  -- draft, posted, voided
  is_reversing    BOOLEAN NOT NULL DEFAULT false,
  reversed_by     UUID REFERENCES journal_entries(id),

  -- Totals (must balance)
  total_debits    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_credits   NUMERIC(14,2) NOT NULL DEFAULT 0,

  posted_by       UUID,
  posted_at       TIMESTAMPTZ,
  voided_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_je_dealer ON journal_entries (dealer_id);
CREATE INDEX idx_je_date ON journal_entries (dealer_id, entry_date);
CREATE INDEX idx_je_source ON journal_entries (source_type, source_id);
CREATE INDEX idx_je_period ON journal_entries (period_id);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY je_tenant ON journal_entries
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Journal Entry Lines (individual debit/credit lines)
-- =============================================================================

CREATE TABLE journal_entry_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES chart_of_accounts(id),

  description     TEXT NOT NULL DEFAULT '',
  debit           NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit          NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Optional department/cost center
  department      TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jel_entry ON journal_entry_lines (journal_entry_id);
CREATE INDEX idx_jel_account ON journal_entry_lines (account_id);

ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY jel_tenant ON journal_entry_lines
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Account Balances (monthly snapshots for financial statements)
-- =============================================================================

CREATE TABLE account_balances (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES chart_of_accounts(id),
  period_id       UUID NOT NULL REFERENCES financial_periods(id),

  opening_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_debits    NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_credits   NUMERIC(14,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(14,2) NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (dealer_id, account_id, period_id)
);

CREATE INDEX idx_ab_dealer_period ON account_balances (dealer_id, period_id);

ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY ab_tenant ON account_balances
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- Triggers
CREATE TRIGGER trg_coa_updated BEFORE UPDATE ON chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();
CREATE TRIGGER trg_fp_updated BEFORE UPDATE ON financial_periods
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();
CREATE TRIGGER trg_je_updated BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();

COMMIT;
