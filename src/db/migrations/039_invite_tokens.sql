-- Add invite flow columns to dealer_users
ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS invite_token TEXT;
ALTER TABLE dealer_users ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;

-- Allow password_hash to be NULL for invited-but-not-yet-accepted users
ALTER TABLE dealer_users ALTER COLUMN password_hash DROP NOT NULL;

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_dealer_users_invite_token
  ON dealer_users (invite_token)
  WHERE invite_token IS NOT NULL;
