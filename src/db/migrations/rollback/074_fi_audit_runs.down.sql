-- Rollback for migration 074: drop the fi_audit_runs lead-intake table.
-- CASCADE so dependent indexes come down with it. Idempotent.

DROP TABLE IF EXISTS fi_audit_runs CASCADE;
