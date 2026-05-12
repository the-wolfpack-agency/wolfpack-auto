-- Rollback for migration 078: drop the website_audit_runs lead-intake table.
-- CASCADE so dependent indexes come down with it. Idempotent.

DROP TABLE IF EXISTS website_audit_runs CASCADE;
