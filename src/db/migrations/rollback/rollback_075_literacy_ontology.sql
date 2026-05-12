-- Runner-facing rollback file for migration 075 (Literacy Ontology).
-- Mirror of 075_literacy_ontology.down.sql so both naming conventions in
-- src/db/migrations/rollback/ resolve.

DROP TABLE IF EXISTS literacy_outcomes     CASCADE;
DROP TABLE IF EXISTS literacy_actions      CASCADE;
DROP TABLE IF EXISTS literacy_translations CASCADE;
DROP TABLE IF EXISTS literacy_metrics      CASCADE;
DROP TABLE IF EXISTS literacy_mappings     CASCADE;
DROP TABLE IF EXISTS literacy_concepts     CASCADE;

DROP FUNCTION IF EXISTS literacy_concepts_set_updated_at() CASCADE;
