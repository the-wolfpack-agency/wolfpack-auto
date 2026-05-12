-- Rollback for migration 075: Drop Dealership Literacy Ontology tables.
-- CASCADE so dependent indexes/policies/triggers come down with each table.
-- IF EXISTS for idempotency — partial rollbacks won't error.

DROP TABLE IF EXISTS literacy_outcomes     CASCADE;
DROP TABLE IF EXISTS literacy_actions      CASCADE;
DROP TABLE IF EXISTS literacy_translations CASCADE;
DROP TABLE IF EXISTS literacy_metrics      CASCADE;
DROP TABLE IF EXISTS literacy_mappings     CASCADE;
DROP TABLE IF EXISTS literacy_concepts     CASCADE;

DROP FUNCTION IF EXISTS literacy_concepts_set_updated_at() CASCADE;
