-- Rollback for migration 064: Drop the wolfpack staff operator tables.
--
-- Idempotent (IF EXISTS) so partial rollbacks don't error. CASCADE so
-- dependent indexes/policies/triggers come down with each table.
--
-- Order matters: invites references staff (FK), audit_log references
-- staff (FK), so we drop those first.

BEGIN;

DROP TRIGGER IF EXISTS wolfpack_staff_updated_at ON wolfpack_staff;
DROP FUNCTION IF EXISTS wolfpack_staff_set_updated_at() CASCADE;

DROP TABLE IF EXISTS wolfpack_staff_audit_log CASCADE;
DROP TABLE IF EXISTS wolfpack_staff_invites CASCADE;
DROP TABLE IF EXISTS wolfpack_staff CASCADE;

COMMIT;
