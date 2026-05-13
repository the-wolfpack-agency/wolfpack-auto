-- 027_credit_bureau.sql — Credit pull history with consent tracking.
-- SSN is NEVER stored raw — only a one-way hash for dedup.

CREATE TABLE IF NOT EXISTS credit_pulls (
  id TEXT PRIMARY KEY,
  dealer_id UUID NOT NULL,
  lead_id TEXT,
  applicant_name TEXT NOT NULL,
  ssn_hash TEXT,                   -- SHA-256 hash, never stored raw
  bureau TEXT CHECK (bureau IN ('equifax','experian','transunion','tri_merge')),
  pull_type TEXT CHECK (pull_type IN ('soft','hard')),
  score INTEGER,
  score_factors TEXT[],
  report_data JSONB,               -- structured credit report data
  pulled_at TIMESTAMPTZ DEFAULT NOW(),
  pulled_by TEXT,
  consent_obtained BOOLEAN DEFAULT false,
  consent_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_pulls_dealer ON credit_pulls(dealer_id);
CREATE INDEX IF NOT EXISTS idx_credit_pulls_lead ON credit_pulls(lead_id);
CREATE INDEX IF NOT EXISTS idx_credit_pulls_pulled_at ON credit_pulls(pulled_at DESC);
