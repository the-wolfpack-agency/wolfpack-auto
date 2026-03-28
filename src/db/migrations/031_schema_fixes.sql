-- 031_schema_fixes.sql
-- Fix schema mismatches between the leads table and the API routes.
--
-- Issue 1: API routes reference `temperature` column which does not exist.
-- Issue 2: API routes reference `assigned_to`, `follow_up_date`, `message`
--          columns which do not exist.
-- Issue 3: dealer_id sent as "default" string fails UUID cast.

BEGIN;

-- Lead temperature (hot/warm/cool/cold)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS temperature TEXT NOT NULL DEFAULT 'warm';

-- Assignee tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to TEXT;

-- Follow-up scheduling
ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_date TIMESTAMPTZ;

-- Original message from the lead
ALTER TABLE leads ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';

-- Structured notes (JSONB array of note objects)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS structured_notes JSONB NOT NULL DEFAULT '[]';

-- Activity log (JSONB array of activity objects)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS activity JSONB NOT NULL DEFAULT '[]';

-- Index for temperature-based filtering and sorting
CREATE INDEX IF NOT EXISTS idx_leads_temperature ON leads (temperature);

-- Index for assignee lookup
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads (assigned_to) WHERE assigned_to IS NOT NULL;

-- Index for follow-up queue
CREATE INDEX IF NOT EXISTS idx_leads_follow_up ON leads (follow_up_date) WHERE follow_up_date IS NOT NULL;

COMMIT;
