-- Rollback for migration 069: Drop BYO external credential tables.
-- CASCADE so dependent indexes/policies come down with each table.
-- Idempotent (IF EXISTS) so partial rollbacks don't error.

DROP TABLE IF EXISTS external_credential_audit CASCADE;
DROP TABLE IF EXISTS dealer_external_credentials CASCADE;
