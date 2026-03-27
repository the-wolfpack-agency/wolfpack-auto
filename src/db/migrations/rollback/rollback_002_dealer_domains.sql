-- Rollback: 002_dealer_domains
-- WARNING: This is destructive. Backup first.
-- Usage: psql $DATABASE_URL -f src/db/migrations/rollback/rollback_002_dealer_domains.sql
BEGIN;

-- Drop updated-at trigger
DROP TRIGGER IF EXISTS trg_dealer_domains_updated_at ON dealer_domains;

-- Drop RLS policies
DROP POLICY IF EXISTS dealer_domains_tenant_insert ON dealer_domains;
DROP POLICY IF EXISTS dealer_domains_tenant_isolation ON dealer_domains;

-- Drop indexes (unique index drops with the table, but explicit is safer)
DROP INDEX IF EXISTS idx_dealer_domains_ssl_expiry;
DROP INDEX IF EXISTS idx_dealer_domains_verified_active;
DROP INDEX IF EXISTS idx_dealer_domains_dealer;
DROP INDEX IF EXISTS idx_dealer_domains_domain;

-- Drop table
DROP TABLE IF EXISTS dealer_domains CASCADE;

COMMIT;
