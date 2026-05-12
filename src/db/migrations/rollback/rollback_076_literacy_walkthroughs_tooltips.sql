-- Rollback for migration 076 (Literacy Walkthroughs + Tooltips).
--
-- Drops tooltips first (FK depends on literacy_concepts but not on
-- walkthroughs), then walkthroughs, then the supporting trigger function.
-- Uses IF EXISTS so partial rollbacks don't error.

DROP TABLE IF EXISTS literacy_tooltips     CASCADE;
DROP TABLE IF EXISTS literacy_walkthroughs CASCADE;

DROP FUNCTION IF EXISTS literacy_walkthroughs_set_updated_at() CASCADE;
