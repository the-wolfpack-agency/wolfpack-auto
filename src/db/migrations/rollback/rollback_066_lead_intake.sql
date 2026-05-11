-- Rollback for migration 066: drop modern lead intake tables.
-- Idempotent — IF EXISTS so partial rollbacks don't error.

DROP TABLE IF EXISTS lead_routing_decisions CASCADE;
DROP TABLE IF EXISTS lead_enrichment CASCADE;
DROP TABLE IF EXISTS lead_sources CASCADE;
