-- Password reset tokens for dealer_users
ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS reset_token TEXT;
ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_dealer_users_reset_token ON dealer_users (reset_token) WHERE reset_token IS NOT NULL;
