-- Runner-facing rollback file for migration 069 (BYO external credentials).
-- Mirror of 069_external_credentials.down.sql so both naming conventions in
-- src/db/migrations/rollback/ resolve.

DROP TABLE IF EXISTS external_credential_audit CASCADE;
DROP TABLE IF EXISTS dealer_external_credentials CASCADE;
