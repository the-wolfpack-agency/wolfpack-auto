-- 029: Red Flags Rule / OFAC compliance checks
-- Tracks identity verification, red flags, and OFAC screening per customer/deal.

CREATE TABLE IF NOT EXISTS compliance_checks (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL,
  lead_id TEXT,
  deal_id TEXT,
  check_type TEXT CHECK (check_type IN ('red_flags','ofac','id_verification')),
  customer_name TEXT NOT NULL,
  result TEXT CHECK (result IN ('clear','flagged','review_required','blocked')),
  flags JSONB DEFAULT '[]',  -- [{rule, description, severity}]
  checked_by TEXT,
  reviewed_by TEXT,
  review_notes TEXT,
  override_approved BOOLEAN DEFAULT false,
  override_by TEXT,
  override_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_checks_dealer ON compliance_checks(dealer_id);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_result ON compliance_checks(dealer_id, result);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_type ON compliance_checks(dealer_id, check_type);
