-- Migration 085: Sub-dealer role + per-dealer module gating
--
-- Powers the minimal "pilot" dashboard: a dealer sees only the modules the agency
-- has enabled for them, and can be scaled up to more modules from the admin side
-- with no redeploy. Two additive, idempotent changes:
--   1. dealers.enabled_modules — the per-dealer allow-list of module keys.
--      NULL means "all modules" so every EXISTING dealer is unaffected (backward
--      compatible); a limited pilot dealer gets an explicit array.
--   2. A new 'sub_dealer' role on dealer_users — the dealer-facing limited role.
--      (users.role, the login source, has no CHECK, so login already accepts it;
--      this keeps the dealer_users membership table's constraint in sync.)

-- 1. Per-dealer enabled-modules allow-list (NULL = all modules).
ALTER TABLE dealers ADD COLUMN IF NOT EXISTS enabled_modules TEXT[];

COMMENT ON COLUMN dealers.enabled_modules IS
  'Allow-list of admin module keys (see src/lib/admin-modules.ts moduleKeyForHref). NULL = all modules enabled. Agency roles (owner/admin) bypass this gate; dealer roles (manager/staff/sub_dealer) see only these + CORE modules.';

-- 2. Extend the dealer_users role CHECK to include 'sub_dealer'. Drop-then-add is
--    idempotent (DROP IF EXISTS is a no-op on re-run); the constraint keeps its
--    canonical auto-generated name so a later migration can find it.
ALTER TABLE dealer_users DROP CONSTRAINT IF EXISTS dealer_users_role_check;
ALTER TABLE dealer_users
  ADD CONSTRAINT dealer_users_role_check
  CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'sub_dealer'));

-- dealers already has RLS enabled (migration 055). Adding a column needs no new
-- policy; the existing dealer_id/self policy continues to scope reads + writes.
