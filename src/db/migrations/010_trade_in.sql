-- Trade-In Valuation Module: customer vehicle trade-in estimates + lead capture
-- Migration 010 — 2026-03-27

CREATE TABLE IF NOT EXISTS trade_in_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES dealers(id) ON DELETE SET NULL,

  -- Vehicle info
  year INTEGER NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  mileage INTEGER NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('excellent', 'good', 'fair', 'poor')),
  accident_history TEXT NOT NULL DEFAULT 'none' CHECK (accident_history IN ('none', 'minor', 'major')),
  title_status TEXT NOT NULL DEFAULT 'clean' CHECK (title_status IN ('clean', 'rebuilt', 'salvage')),
  previous_owners INTEGER NOT NULL DEFAULT 1,

  -- Valuation
  estimated_low INTEGER NOT NULL,
  estimated_high INTEGER NOT NULL,
  estimated_mid INTEGER NOT NULL,
  valuation_factors JSONB NOT NULL DEFAULT '{}',

  -- Lead capture
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  lead_captured BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  ip_address TEXT,
  user_agent TEXT,
  converted_to_lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trade_in_dealer ON trade_in_estimates(dealer_id);
CREATE INDEX IF NOT EXISTS idx_trade_in_email ON trade_in_estimates(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trade_in_created ON trade_in_estimates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trade_in_captured ON trade_in_estimates(lead_captured);
