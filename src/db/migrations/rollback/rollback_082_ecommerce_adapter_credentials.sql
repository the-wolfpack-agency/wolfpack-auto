-- Rollback for migration 082 (ecommerce_adapter_credentials).
--
-- CASCADE drops the dependent indexes + trigger; the trigger function is
-- dropped separately so the rollback is fully clean.

DROP TRIGGER IF EXISTS ecommerce_adapter_credentials_updated_at ON ecommerce_adapter_credentials;
DROP FUNCTION IF EXISTS ecommerce_adapter_credentials_set_updated_at();
DROP TABLE IF EXISTS ecommerce_adapter_credentials CASCADE;
