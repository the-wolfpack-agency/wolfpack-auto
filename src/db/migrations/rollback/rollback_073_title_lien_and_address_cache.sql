-- Rollback for migration 073: drop the title-lien + address-validation cache.
-- CASCADE so dependent indexes/policies come down with each table.
-- Idempotent (IF EXISTS) so partial rollbacks don't error.

DROP TABLE IF EXISTS address_validations CASCADE;
DROP TABLE IF EXISTS vehicle_title_lookups CASCADE;
