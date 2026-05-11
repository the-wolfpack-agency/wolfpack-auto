-- Rollback for migration 068: drop the recalls + TSB tables.
-- CASCADE so dependent indexes/policies/triggers come down with each table.
-- Idempotent (IF EXISTS) so partial rollbacks don't error.
-- Order is reverse of the create order so any FKs unwind cleanly.

DROP TABLE IF EXISTS recall_check_history CASCADE;
DROP TABLE IF EXISTS vehicle_recall_status CASCADE;
DROP TABLE IF EXISTS tsbs CASCADE;
DROP TABLE IF EXISTS recalls CASCADE;
