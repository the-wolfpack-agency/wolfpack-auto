-- Onboarding funnel analytics
CREATE TABLE IF NOT EXISTS onboarding_events (
  id TEXT PRIMARY KEY,
  dealer_id TEXT,
  event_type TEXT NOT NULL,
  step_name TEXT,
  metadata JSONB DEFAULT '{}',
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_dealer ON onboarding_events(dealer_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_type ON onboarding_events(event_type);

-- Demo sessions for prospects
CREATE TABLE IF NOT EXISTS demo_sessions (
  id TEXT PRIMARY KEY,
  prospect_email TEXT,
  prospect_name TEXT,
  company_name TEXT,
  demo_dealer_id TEXT REFERENCES dealers(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  pages_visited JSONB DEFAULT '[]',
  is_converted BOOLEAN DEFAULT false,
  converted_dealer_id TEXT REFERENCES dealers(id)
);
CREATE INDEX IF NOT EXISTS idx_demo_sessions_email ON demo_sessions(prospect_email);
