-- Migration 049: Stripe Connect Payment Integration
-- Dealer Stripe accounts, payment intents, terminals, reconciliation,
-- refunds, and payout tracking.

BEGIN;

-- =============================================================================
-- Dealer Stripe Accounts (Connect accounts)
-- =============================================================================

CREATE TABLE dealer_stripe_accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,

  stripe_account_id TEXT NOT NULL UNIQUE,  -- acct_xxx
  account_type    TEXT NOT NULL DEFAULT 'standard',  -- standard, express, custom
  status          TEXT NOT NULL DEFAULT 'pending',   -- pending, active, restricted, disabled

  -- Capabilities
  charges_enabled BOOLEAN NOT NULL DEFAULT false,
  payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  card_payments   BOOLEAN NOT NULL DEFAULT false,
  transfers       BOOLEAN NOT NULL DEFAULT false,

  -- Business info (from Stripe)
  business_name   TEXT,
  business_url    TEXT,
  support_email   TEXT,
  default_currency TEXT NOT NULL DEFAULT 'usd',

  -- Onboarding
  onboarding_url  TEXT,
  onboarded_at    TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dsa_dealer ON dealer_stripe_accounts (dealer_id);

ALTER TABLE dealer_stripe_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY dsa_tenant ON dealer_stripe_accounts
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Payment Transactions
-- =============================================================================

CREATE TABLE payment_transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,

  -- Stripe references
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id TEXT,
  stripe_account_id TEXT NOT NULL,

  -- What this payment is for
  payment_type    TEXT NOT NULL DEFAULT 'deal',
    -- deal, service, parts, deposit, fee, other
  source_type     TEXT,  -- deal_desk, service_ro, parts_order
  source_id       UUID,

  -- Customer
  customer_name   TEXT,
  customer_email  TEXT,

  -- Amounts
  amount          NUMERIC(12,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'usd',
  platform_fee    NUMERIC(10,2) NOT NULL DEFAULT 0,  -- our platform fee
  stripe_fee      NUMERIC(10,2) NOT NULL DEFAULT 0,  -- Stripe processing fee
  net_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,  -- dealer receives

  -- Payment method
  payment_method  TEXT NOT NULL DEFAULT 'card',
    -- card, ach, terminal, cash, check, bnpl
  card_brand      TEXT,      -- visa, mastercard, amex
  card_last4      TEXT,
  terminal_id     TEXT,

  -- Status
  status          TEXT NOT NULL DEFAULT 'pending',
    -- pending, processing, succeeded, failed, canceled, refunded, partially_refunded
  failure_reason  TEXT,

  -- Metadata
  description     TEXT NOT NULL DEFAULT '',
  receipt_url     TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pt_dealer ON payment_transactions (dealer_id);
CREATE INDEX idx_pt_status ON payment_transactions (dealer_id, status);
CREATE INDEX idx_pt_source ON payment_transactions (source_type, source_id);
CREATE INDEX idx_pt_stripe ON payment_transactions (stripe_payment_intent_id);

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY pt_tenant ON payment_transactions
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Refunds
-- =============================================================================

CREATE TABLE payment_refunds (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  transaction_id  UUID NOT NULL REFERENCES payment_transactions(id),

  stripe_refund_id TEXT UNIQUE,
  amount          NUMERIC(12,2) NOT NULL,
  reason          TEXT NOT NULL DEFAULT '',  -- requested_by_customer, duplicate, fraudulent, other
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending, succeeded, failed

  refunded_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pr_transaction ON payment_refunds (transaction_id);

ALTER TABLE payment_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY pr_tenant ON payment_refunds
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Payment Terminals (Stripe Terminal readers)
-- =============================================================================

CREATE TABLE payment_terminals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,

  stripe_reader_id TEXT NOT NULL UNIQUE,
  label           TEXT NOT NULL,         -- "Front Desk", "Service Cashier"
  location        TEXT NOT NULL DEFAULT '',
  device_type     TEXT NOT NULL DEFAULT 'bbpos_wisepos_e',
  serial_number   TEXT,

  status          TEXT NOT NULL DEFAULT 'online',  -- online, offline, disconnected
  last_seen_at    TIMESTAMPTZ,

  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pterm_dealer ON payment_terminals (dealer_id);

ALTER TABLE payment_terminals ENABLE ROW LEVEL SECURITY;
CREATE POLICY pterm_tenant ON payment_terminals
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Daily Reconciliation
-- =============================================================================

CREATE TABLE payment_reconciliation (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,

  reconciliation_date DATE NOT NULL,
  total_transactions INTEGER NOT NULL DEFAULT 0,
  total_collected NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_refunded  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_fees      NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,

  status          TEXT NOT NULL DEFAULT 'pending',  -- pending, reconciled, discrepancy
  discrepancy_amount NUMERIC(14,2),
  notes           TEXT,

  reconciled_by   UUID,
  reconciled_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (dealer_id, reconciliation_date)
);

ALTER TABLE payment_reconciliation ENABLE ROW LEVEL SECURITY;
CREATE POLICY prec_tenant ON payment_reconciliation
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- Triggers
CREATE TRIGGER trg_dsa_updated BEFORE UPDATE ON dealer_stripe_accounts
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();
CREATE TRIGGER trg_pt_updated BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();
CREATE TRIGGER trg_pterm_updated BEFORE UPDATE ON payment_terminals
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();

COMMIT;
