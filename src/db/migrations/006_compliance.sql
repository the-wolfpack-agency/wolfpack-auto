-- OEM Brand Compliance Scoring
-- Migration: 006_compliance

CREATE TABLE IF NOT EXISTS compliance_scores (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id        UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  score            INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  grade            TEXT NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D', 'F')),
  category_scores  JSONB NOT NULL DEFAULT '{}',
  violations       JSONB NOT NULL DEFAULT '[]',
  checked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_scores_dealer_id
  ON compliance_scores(dealer_id);

CREATE INDEX IF NOT EXISTS idx_compliance_scores_checked_at
  ON compliance_scores(checked_at DESC);
