-- Agency API keys for programmatic access
CREATE TABLE IF NOT EXISTS agency_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Untitled Key',
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agency_api_keys_hash ON agency_api_keys (key_hash) WHERE active = true;
