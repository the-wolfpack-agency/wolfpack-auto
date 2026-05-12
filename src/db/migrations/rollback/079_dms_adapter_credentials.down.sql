-- Down migration for 079_dms_adapter_credentials (runner-facing variant).
-- Mirrors rollback_079_dms_adapter_credentials.sql so both naming
-- conventions in src/db/migrations/rollback/ resolve.

DROP TRIGGER IF EXISTS dms_adapter_credentials_updated_at ON dms_adapter_credentials;
DROP FUNCTION IF EXISTS dms_adapter_credentials_set_updated_at();
DROP TABLE IF EXISTS dms_adapter_credentials CASCADE;
