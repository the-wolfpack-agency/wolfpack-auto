BEGIN;

-- Add intent scoring fields to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS intent_score INTEGER CHECK (intent_score >= 0 AND intent_score <= 100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_factors JSONB DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS recommended_followup_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS scored_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS page_views INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vdp_views INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS time_on_site_seconds INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS return_visits INTEGER DEFAULT 0;

-- Fast lookup by score (descending — highest priority first)
CREATE INDEX IF NOT EXISTS idx_leads_intent_score ON leads(intent_score DESC NULLS LAST);

-- Fast lookup for follow-up queue (only rows that have a scheduled time)
CREATE INDEX IF NOT EXISTS idx_leads_recommended_followup ON leads(recommended_followup_at) WHERE recommended_followup_at IS NOT NULL;

COMMIT;
