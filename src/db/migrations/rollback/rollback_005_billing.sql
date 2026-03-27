-- Rollback: 005_billing
-- WARNING: This is destructive. Backup first.
-- Usage: psql $DATABASE_URL -f src/db/migrations/rollback/rollback_005_billing.sql
BEGIN;

-- Drop Stripe webhook lookup indexes
DROP INDEX IF EXISTS idx_dealers_stripe_customer;
DROP INDEX IF EXISTS idx_dealers_stripe_sub;

-- Remove billing columns added to dealers
ALTER TABLE dealers
  DROP COLUMN IF EXISTS stripe_customer_id,
  DROP COLUMN IF EXISTS stripe_subscription_id,
  DROP COLUMN IF EXISTS subscription_status,
  DROP COLUMN IF EXISTS subscription_plan,
  DROP COLUMN IF EXISTS trial_ends_at,
  DROP COLUMN IF EXISTS billing_email;

COMMIT;
