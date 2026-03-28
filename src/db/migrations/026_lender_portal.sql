-- 026_lender_portal.sql — Lender profile + deal submission tracking
-- Supports RouteOne, DealerTrack, CUDL, and direct lender integrations.

CREATE TABLE IF NOT EXISTS lender_profiles (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL,
  lender_name TEXT NOT NULL,
  lender_code TEXT,                -- RouteOne / DealerTrack lender code
  portal TEXT CHECK (portal IN ('routeone','dealertrack','cudl','direct')),
  contact_email TEXT,
  contact_phone TEXT,
  rate_sheet JSONB DEFAULT '{}',   -- {tier: [{min_score, max_score, rate, max_term}]}
  buy_rates JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lender_profiles_dealer ON lender_profiles(dealer_id);

CREATE TABLE IF NOT EXISTS deal_submissions (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL,
  deal_id TEXT NOT NULL,
  lender_id TEXT REFERENCES lender_profiles(id),
  portal TEXT,
  submission_data JSONB,
  status TEXT CHECK (status IN ('draft','submitted','pending','approved','conditioned','declined','counter','funded')),
  response_data JSONB,             -- lender response (approved amount, rate, term, stipulations)
  submitted_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  stipulations TEXT[],
  funded_amount NUMERIC(12,2),
  funded_rate NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_submissions_deal ON deal_submissions(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_submissions_dealer ON deal_submissions(dealer_id);
CREATE INDEX IF NOT EXISTS idx_deal_submissions_lender ON deal_submissions(lender_id);
