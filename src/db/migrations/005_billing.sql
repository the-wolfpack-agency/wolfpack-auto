BEGIN;

-- Add billing/subscription fields to dealers table
ALTER TABLE dealers
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial'
    CHECK (subscription_status IN ('trial', 'active', 'past_due', 'canceled', 'paused')),
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'starter'
    CHECK (subscription_plan IN ('starter', 'professional', 'enterprise')),
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  ADD COLUMN IF NOT EXISTS billing_email TEXT;

-- Index for Stripe webhook lookups
CREATE INDEX IF NOT EXISTS idx_dealers_stripe_customer ON dealers(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dealers_stripe_sub ON dealers(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

COMMIT;
