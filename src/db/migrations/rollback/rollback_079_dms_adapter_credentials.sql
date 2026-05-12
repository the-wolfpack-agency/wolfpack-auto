-- Rollback for migration 079 (dms_adapter_credentials).
--
-- CASCADE drops the dependent indexes + trigger; the trigger function is
-- dropped separately so the rollback is fully clean.

DROP TRIGGER IF EXISTS dms_adapter_credentials_updated_at ON dms_adapter_credentials;
DROP FUNCTION IF EXISTS dms_adapter_credentials_set_updated_at();
DROP TABLE IF EXISTS dms_adapter_credentials CASCADE;
