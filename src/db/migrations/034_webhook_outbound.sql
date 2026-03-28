-- Webhook outbound system: configs + delivery log
-- Allows dealers to register URLs that receive real-time platform events.

CREATE TABLE IF NOT EXISTS webhook_configs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{*}',
  active BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  webhook_config_id TEXT NOT NULL,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT CHECK (status IN ('pending','delivered','failed')) DEFAULT 'pending',
  status_code INTEGER,
  response_body TEXT,
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_configs_dealer ON webhook_configs(dealer_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_config ON webhook_deliveries(webhook_config_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
