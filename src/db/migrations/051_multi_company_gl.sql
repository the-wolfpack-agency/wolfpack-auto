-- Migration 051: Multi-Company General Ledger
-- Adds company_id to all GL tables so dealer groups with multiple
-- rooftops can maintain separate books per entity while consolidating
-- at the group level.
--
-- Pattern: dealer_id = the tenant, company_id = the legal entity.
-- A single-rooftop dealer has one company. A group has many.

BEGIN;

-- =============================================================================
-- Companies (legal entities within a dealer group)
-- =============================================================================

CREATE TABLE gl_companies (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  code            TEXT NOT NULL,          -- short code, e.g. "WPM-DEN", "WPM-BLD"
  legal_name      TEXT NOT NULL DEFAULT '',
  tax_id          TEXT NOT NULL DEFAULT '',  -- EIN

  -- Address
  address         JSONB NOT NULL DEFAULT '{}',

  -- Type
  entity_type     TEXT NOT NULL DEFAULT 'dealership',
    -- dealership, holding, realty, finance_co, other

  -- Consolidation
  is_parent       BOOLEAN NOT NULL DEFAULT false,  -- true = consolidation entity
  parent_company_id UUID REFERENCES gl_companies(id) ON DELETE SET NULL,

  -- Status
  is_active       BOOLEAN NOT NULL DEFAULT true,
  fiscal_year_start INTEGER NOT NULL DEFAULT 1,  -- month (1=Jan)

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (dealer_id, code)
);

CREATE INDEX idx_glc_dealer ON gl_companies (dealer_id);

ALTER TABLE gl_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY glc_tenant ON gl_companies
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Add company_id to all GL tables
-- =============================================================================

-- Chart of Accounts
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES gl_companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_coa_company ON chart_of_accounts (company_id);

-- Drop and re-create the unique constraint to include company_id
ALTER TABLE chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_dealer_id_account_number_key;
ALTER TABLE chart_of_accounts ADD CONSTRAINT chart_of_accounts_dealer_company_acctnum_key
  UNIQUE (dealer_id, company_id, account_number);

-- Financial Periods
ALTER TABLE financial_periods
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES gl_companies(id) ON DELETE CASCADE;

ALTER TABLE financial_periods DROP CONSTRAINT IF EXISTS financial_periods_dealer_id_period_year_period_month_key;
ALTER TABLE financial_periods ADD CONSTRAINT financial_periods_dealer_company_year_month_key
  UNIQUE (dealer_id, company_id, period_year, period_month);

-- Journal Entries
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES gl_companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_je_company ON journal_entries (company_id);

-- Journal Entry Lines
ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES gl_companies(id) ON DELETE CASCADE;

-- Account Balances
ALTER TABLE account_balances
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES gl_companies(id) ON DELETE CASCADE;

ALTER TABLE account_balances DROP CONSTRAINT IF EXISTS account_balances_dealer_id_account_id_period_id_key;
ALTER TABLE account_balances ADD CONSTRAINT account_balances_dealer_company_acct_period_key
  UNIQUE (dealer_id, company_id, account_id, period_id);

-- =============================================================================
-- Inter-Company Transactions (eliminations for consolidation)
-- =============================================================================

CREATE TABLE intercompany_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,

  -- Which companies are involved
  from_company_id UUID NOT NULL REFERENCES gl_companies(id) ON DELETE CASCADE,
  to_company_id   UUID NOT NULL REFERENCES gl_companies(id) ON DELETE CASCADE,

  -- Journal entries on each side
  from_journal_id UUID REFERENCES journal_entries(id),
  to_journal_id   UUID REFERENCES journal_entries(id),

  amount          NUMERIC(14,2) NOT NULL,
  description     TEXT NOT NULL,

  -- Status
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending, posted, eliminated
  eliminated_at   TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ict_dealer ON intercompany_transactions (dealer_id);
CREATE INDEX idx_ict_companies ON intercompany_transactions (from_company_id, to_company_id);

ALTER TABLE intercompany_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ict_tenant ON intercompany_transactions
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Consolidated Balances (rollup view across all companies)
-- =============================================================================

CREATE TABLE consolidated_balances (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  period_id       UUID NOT NULL REFERENCES financial_periods(id),
  account_number  TEXT NOT NULL,

  -- Per-company breakdown (JSONB array)
  company_balances JSONB NOT NULL DEFAULT '[]',
    -- [{company_id, company_name, balance}]

  -- Eliminations
  elimination_amount NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Consolidated total
  consolidated_balance NUMERIC(14,2) NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (dealer_id, period_id, account_number)
);

ALTER TABLE consolidated_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY cb_tenant ON consolidated_balances
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- Triggers
CREATE TRIGGER trg_glc_updated BEFORE UPDATE ON gl_companies
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();

COMMIT;
