-- Down migration for 082_ecommerce_adapter_credentials (runner-facing variant).
-- Mirrors rollback_082_ecommerce_adapter_credentials.sql so both naming
-- conventions in src/db/migrations/rollback/ resolve.

DROP TRIGGER IF EXISTS ecommerce_adapter_credentials_updated_at ON ecommerce_adapter_credentials;
DROP FUNCTION IF EXISTS ecommerce_adapter_credentials_set_updated_at();
DROP TABLE IF EXISTS ecommerce_adapter_credentials CASCADE;
