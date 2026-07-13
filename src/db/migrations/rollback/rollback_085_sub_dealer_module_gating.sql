-- Rollback 085: remove per-dealer module gating + sub_dealer role.
--
-- Restores the dealer_users role CHECK to its pre-085 set. Any dealer_users rows
-- with role='sub_dealer' must be reassigned first or the ADD CONSTRAINT fails —
-- that is intentional (fail-closed, no silent data loss).

ALTER TABLE dealers DROP COLUMN IF EXISTS enabled_modules;

ALTER TABLE dealer_users DROP CONSTRAINT IF EXISTS dealer_users_role_check;
ALTER TABLE dealer_users
  ADD CONSTRAINT dealer_users_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'staff'));
