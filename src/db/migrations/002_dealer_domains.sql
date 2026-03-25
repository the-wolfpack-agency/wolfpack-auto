-- 002_dealer_domains.sql
-- Adds the dealer_domains table for custom domain routing and SSL management.

CREATE TABLE dealer_domains (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id      UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  domain         TEXT NOT NULL,
  ssl_status     TEXT NOT NULL DEFAULT 'pending'
                   CHECK (ssl_status IN ('pending', 'provisioning', 'active', 'failed', 'expired')),
  ssl_expiry     TIMESTAMPTZ,
  verified       BOOLEAN NOT NULL DEFAULT false,
  dns_txt_record TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Each domain can only be registered once across all dealers
CREATE UNIQUE INDEX idx_dealer_domains_domain ON dealer_domains (domain);

-- Fast lookup by dealer
CREATE INDEX idx_dealer_domains_dealer ON dealer_domains (dealer_id);

-- Fast lookup for verified + active domains (tenant resolution hot path)
CREATE INDEX idx_dealer_domains_verified_active
  ON dealer_domains (domain)
  WHERE verified = true;

-- SSL renewal cron: find domains expiring soon
CREATE INDEX idx_dealer_domains_ssl_expiry
  ON dealer_domains (ssl_expiry)
  WHERE ssl_status = 'active' AND verified = true;

-- Updated-at trigger (reuses the function from 001)
CREATE TRIGGER trg_dealer_domains_updated_at
  BEFORE UPDATE ON dealer_domains
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE dealer_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY dealer_domains_tenant_isolation ON dealer_domains
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

CREATE POLICY dealer_domains_tenant_insert ON dealer_domains
  FOR INSERT WITH CHECK (dealer_id = current_setting('app.current_dealer_id', true)::uuid);
