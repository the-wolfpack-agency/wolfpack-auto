-- Rollback for migration 080: assistant_actions vertical + tenant_verticals.

DROP TABLE IF EXISTS tenant_verticals CASCADE;

DROP FUNCTION IF EXISTS tenant_verticals_set_updated_at() CASCADE;

DROP INDEX IF EXISTS assistant_actions_vertical_idx;

ALTER TABLE IF EXISTS assistant_actions
  DROP CONSTRAINT IF EXISTS assistant_actions_vertical_check;

ALTER TABLE IF EXISTS assistant_actions
  DROP COLUMN IF EXISTS vertical;
