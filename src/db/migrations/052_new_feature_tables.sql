-- Migration 052: Create all missing tables for Day 10 features
--
-- These 19 routes currently fall back to demo data when tables don't exist.
-- This migration creates all tables with RLS, indexes, and proper constraints
-- so every feature persists real data and feeds the analytics/learning loop.
--
-- Tables created (grouped by feature area):
--   Analytics infrastructure:
--     analytics_events (formalized from runtime CREATE IF NOT EXISTS)
--     data_exports
--   Customer intelligence:
--     customer_vehicles, households, household_members, household_vehicles
--   Communications:
--     sms_messages, drip_campaigns, campaign_enrollments, call_recordings
--   Experience tracking:
--     session_replays, session_replay_events, client_errors,
--     surveys, survey_responses, user_tests, test_recordings
--   F&I / Insurance:
--     reinsurance_programs, reinsurance_policies, reinsurance_claims,
--     erating_cache
--   Operations:
--     deliveries, vehicle_delivery_tracker, walkarounds, walkaround_segments,
--     lead_ingestion_feeds, ingested_leads
--   Collaboration:
--     dashboard_annotations, customer_touchpoints
--   Propensity (view only — reads analytics_events)

-- ============================================================================
-- Helper: ensure update_background_timestamp trigger function exists
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. analytics_events — formalize the runtime-created table
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_events (
  id                BIGSERIAL    PRIMARY KEY,
  event_type        TEXT         NOT NULL,
  action            TEXT         NOT NULL,
  page              TEXT         NOT NULL,
  session_id        TEXT         NOT NULL,
  user_fingerprint  TEXT         NOT NULL,
  timestamp         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  metadata          JSONB        NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_session   ON analytics_events (session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type      ON analytics_events (event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_action    ON analytics_events (action);
CREATE INDEX IF NOT EXISTS idx_analytics_events_page      ON analytics_events (page);
CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events (timestamp);
-- Composite for propensity scoring queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_page_ts   ON analytics_events (page, timestamp);
-- GIN index on metadata for JSONB queries (data export, propensity)
CREATE INDEX IF NOT EXISTS idx_analytics_events_metadata  ON analytics_events USING GIN (metadata);

-- ============================================================================
-- 2. data_exports — export job history
-- ============================================================================
CREATE TABLE IF NOT EXISTS data_exports (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID         NOT NULL,
  export_type TEXT         NOT NULL CHECK (export_type IN ('analytics', 'leads', 'inventory', 'all')),
  format      TEXT         NOT NULL DEFAULT 'csv' CHECK (format IN ('csv', 'json', 'parquet')),
  destination TEXT         NOT NULL DEFAULT 'download' CHECK (destination IN ('download', 's3', 'snowflake', 'databricks')),
  status      TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  row_count   INTEGER      DEFAULT 0,
  file_url    TEXT,
  error       TEXT,
  started_at  TIMESTAMPTZ  DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_exports_dealer ON data_exports (dealer_id);
ALTER TABLE data_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY data_exports_tenant ON data_exports
  USING (dealer_id = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- 3. customer_vehicles — equity mining
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_vehicles (
  id                TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id         UUID         NOT NULL,
  customer_id       TEXT         NOT NULL REFERENCES customers(id),
  vin               TEXT,
  year              INTEGER,
  make              TEXT,
  model             TEXT,
  mileage           INTEGER,
  condition         TEXT         DEFAULT 'good' CHECK (condition IN ('excellent', 'good', 'fair', 'poor')),
  loan_balance      NUMERIC(12,2) DEFAULT 0,
  monthly_payment   NUMERIC(10,2) DEFAULT 0,
  payoff_date       DATE,
  last_service_date DATE,
  market_value      NUMERIC(12,2),
  equity_position   NUMERIC(12,2),
  created_at        TIMESTAMPTZ  DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_vehicles_dealer   ON customer_vehicles (dealer_id);
CREATE INDEX IF NOT EXISTS idx_customer_vehicles_customer ON customer_vehicles (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_vehicles_vin      ON customer_vehicles (vin);
ALTER TABLE customer_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_vehicles_tenant ON customer_vehicles
  USING (dealer_id = current_setting('app.current_dealer_id', true));

CREATE TRIGGER customer_vehicles_updated_at BEFORE UPDATE ON customer_vehicles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

-- ============================================================================
-- 4. households — customer household grouping
-- ============================================================================
CREATE TABLE IF NOT EXISTS households (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID         NOT NULL,
  family_name TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_households_dealer ON households (dealer_id);
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
CREATE POLICY households_tenant ON households
  USING (dealer_id = current_setting('app.current_dealer_id', true));

CREATE TABLE IF NOT EXISTS household_members (
  id           TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  household_id TEXT         NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  customer_id  TEXT         NOT NULL REFERENCES customers(id),
  relationship TEXT         DEFAULT 'member',
  added_at     TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (household_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_household_members_household ON household_members (household_id);
CREATE INDEX IF NOT EXISTS idx_household_members_customer  ON household_members (customer_id);

CREATE TABLE IF NOT EXISTS household_vehicles (
  id             TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  household_id   TEXT          NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  vehicle_id     TEXT,
  vin            TEXT,
  purchase_price NUMERIC(12,2) DEFAULT 0,
  purchase_date  DATE,
  added_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_household_vehicles_household ON household_vehicles (household_id);

-- ============================================================================
-- 5. sms_messages — SMS/Twilio messaging
-- ============================================================================
CREATE TABLE IF NOT EXISTS sms_messages (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID         NOT NULL,
  lead_id     UUID         REFERENCES leads(id),
  direction   TEXT         NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  "from"      TEXT         NOT NULL,
  "to"        TEXT         NOT NULL,
  body        TEXT         NOT NULL,
  status      TEXT         DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'queued')),
  twilio_sid  TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  read_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_dealer  ON sms_messages (dealer_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_lead    ON sms_messages (lead_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_created ON sms_messages (created_at);
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY sms_messages_tenant ON sms_messages
  USING (dealer_id = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- 6. drip_campaigns — behavior-triggered email sequences
-- ============================================================================
CREATE TABLE IF NOT EXISTS drip_campaigns (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID         NOT NULL,
  name        TEXT         NOT NULL,
  trigger     TEXT         NOT NULL DEFAULT 'lead_created',
  steps       JSONB        NOT NULL DEFAULT '[]',
  active      BOOLEAN      DEFAULT true,
  stats       JSONB        DEFAULT '{"totalEnrolled":0,"totalConverted":0,"emailsSent":0,"conversionRate":0}',
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drip_campaigns_dealer ON drip_campaigns (dealer_id);
CREATE INDEX IF NOT EXISTS idx_drip_campaigns_active ON drip_campaigns (active) WHERE active = true;
ALTER TABLE drip_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY drip_campaigns_tenant ON drip_campaigns
  USING (dealer_id = current_setting('app.current_dealer_id', true));

CREATE TABLE IF NOT EXISTS campaign_enrollments (
  id           TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  campaign_id  TEXT         NOT NULL REFERENCES drip_campaigns(id) ON DELETE CASCADE,
  dealer_id    UUID         NOT NULL,
  lead_id      UUID         NOT NULL REFERENCES leads(id),
  current_step INTEGER      DEFAULT 0,
  status       TEXT         DEFAULT 'active' CHECK (status IN ('active', 'completed', 'unsubscribed', 'converted')),
  enrolled_at  TIMESTAMPTZ  DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  UNIQUE (campaign_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_campaign ON campaign_enrollments (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_dealer   ON campaign_enrollments (dealer_id);
CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_status   ON campaign_enrollments (status) WHERE status = 'active';
ALTER TABLE campaign_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaign_enrollments_tenant ON campaign_enrollments
  USING (dealer_id = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- 7. call_recordings — call intelligence / conversation analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS call_recordings (
  id            TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id     UUID         NOT NULL,
  lead_id       UUID         REFERENCES leads(id),
  phone_number  TEXT,
  direction     TEXT         DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  duration_sec  INTEGER      DEFAULT 0,
  transcript    TEXT,
  sentiment     TEXT         CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  quality_score NUMERIC(5,2),
  keywords      JSONB        DEFAULT '[]',
  outcome       TEXT,
  recorded_at   TIMESTAMPTZ  DEFAULT NOW(),
  analyzed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_call_recordings_dealer    ON call_recordings (dealer_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_lead      ON call_recordings (lead_id);
CREATE INDEX IF NOT EXISTS idx_call_recordings_recorded  ON call_recordings (recorded_at);
ALTER TABLE call_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY call_recordings_tenant ON call_recordings
  USING (dealer_id = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- 8. session_replays + session_replay_events — session recording
-- ============================================================================
CREATE TABLE IF NOT EXISTS session_replays (
  session_id     TEXT         PRIMARY KEY,
  dealer_id      UUID         NOT NULL,
  started_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ended_at       TIMESTAMPTZ,
  duration_ms    INTEGER      DEFAULT 0,
  pages_visited  JSONB        DEFAULT '[]',
  event_count    INTEGER      DEFAULT 0,
  conversion     BOOLEAN      DEFAULT false,
  user_agent     TEXT,
  viewport       JSONB,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_replays_dealer  ON session_replays (dealer_id);
CREATE INDEX IF NOT EXISTS idx_session_replays_started ON session_replays (started_at);
ALTER TABLE session_replays ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_replays_tenant ON session_replays
  USING (dealer_id = current_setting('app.current_dealer_id', true));

CREATE TABLE IF NOT EXISTS session_replay_events (
  id         BIGSERIAL    PRIMARY KEY,
  session_id TEXT         NOT NULL REFERENCES session_replays(session_id) ON DELETE CASCADE,
  seq        INTEGER      NOT NULL,
  ts         BIGINT       NOT NULL,
  type       TEXT         NOT NULL,
  data       JSONB        NOT NULL DEFAULT '{}',
  UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_session_replay_events_session ON session_replay_events (session_id);

-- ============================================================================
-- 9. client_errors — error monitoring + behavior correlation
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_errors (
  id           TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id    UUID         NOT NULL,
  fingerprint  TEXT         NOT NULL,
  message      TEXT         NOT NULL,
  stack        TEXT,
  page_url     TEXT,
  session_id   TEXT,
  user_agent   TEXT,
  captured_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_client_errors_dealer      ON client_errors (dealer_id);
CREATE INDEX IF NOT EXISTS idx_client_errors_fingerprint ON client_errors (fingerprint);
CREATE INDEX IF NOT EXISTS idx_client_errors_captured    ON client_errors (captured_at);
CREATE INDEX IF NOT EXISTS idx_client_errors_unresolved  ON client_errors (dealer_id, fingerprint) WHERE resolved_at IS NULL;
ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY client_errors_tenant ON client_errors
  USING (dealer_id = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- 10. surveys + survey_responses
-- ============================================================================
CREATE TABLE IF NOT EXISTS surveys (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID         NOT NULL,
  title       TEXT         NOT NULL,
  description TEXT,
  questions   JSONB        NOT NULL DEFAULT '[]',
  trigger     JSONB        DEFAULT '{}',
  active      BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surveys_dealer ON surveys (dealer_id);
CREATE INDEX IF NOT EXISTS idx_surveys_active ON surveys (active) WHERE active = true;
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;
CREATE POLICY surveys_tenant ON surveys
  USING (dealer_id = current_setting('app.current_dealer_id', true));

CREATE TABLE IF NOT EXISTS survey_responses (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  survey_id   TEXT         NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  dealer_id   UUID         NOT NULL,
  session_id  TEXT,
  responses   JSONB        NOT NULL DEFAULT '{}',
  nps_score   INTEGER,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses (survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_dealer ON survey_responses (dealer_id);
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY survey_responses_tenant ON survey_responses
  USING (dealer_id = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- 11. user_tests + test_recordings — user testing
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_tests (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID         NOT NULL,
  title       TEXT         NOT NULL,
  description TEXT,
  tasks       JSONB        NOT NULL DEFAULT '[]',
  active      BOOLEAN      DEFAULT true,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_tests_dealer ON user_tests (dealer_id);
ALTER TABLE user_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_tests_tenant ON user_tests
  USING (dealer_id = current_setting('app.current_dealer_id', true));

CREATE TABLE IF NOT EXISTS test_recordings (
  id              TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  test_id         TEXT         NOT NULL REFERENCES user_tests(id) ON DELETE CASCADE,
  dealer_id       UUID         NOT NULL,
  participant_id  TEXT         NOT NULL,
  task_results    JSONB        DEFAULT '[]',
  completed       BOOLEAN      DEFAULT false,
  duration_ms     INTEGER,
  started_at      TIMESTAMPTZ  DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_test_recordings_test ON test_recordings (test_id);
CREATE INDEX IF NOT EXISTS idx_test_recordings_dealer ON test_recordings (dealer_id);
ALTER TABLE test_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_recordings_tenant ON test_recordings
  USING (dealer_id = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- 12. reinsurance — programs, policies, claims
-- ============================================================================
CREATE TABLE IF NOT EXISTS reinsurance_programs (
  id                 TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id          UUID          NOT NULL,
  name               TEXT          NOT NULL,
  type               TEXT          NOT NULL DEFAULT 'CFC' CHECK (type IN ('CFC', 'DOWC', 'retro')),
  status             TEXT          NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  inception_date     DATE,
  cession_rate       NUMERIC(5,4) DEFAULT 0,
  admin_fee_rate     NUMERIC(5,4) DEFAULT 0,
  total_premiums     NUMERIC(14,2) DEFAULT 0,
  total_claims       NUMERIC(14,2) DEFAULT 0,
  total_admin_costs  NUMERIC(14,2) DEFAULT 0,
  retained_reserves  NUMERIC(14,2) DEFAULT 0,
  created_at         TIMESTAMPTZ   DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reinsurance_programs_dealer ON reinsurance_programs (dealer_id);
ALTER TABLE reinsurance_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY reinsurance_programs_tenant ON reinsurance_programs
  USING (dealer_id = current_setting('app.current_dealer_id', true));

CREATE TRIGGER reinsurance_programs_updated_at BEFORE UPDATE ON reinsurance_programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

CREATE TABLE IF NOT EXISTS reinsurance_policies (
  id               TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  program_id       TEXT          NOT NULL REFERENCES reinsurance_programs(id) ON DELETE CASCADE,
  dealer_id        UUID          NOT NULL,
  product_category TEXT          NOT NULL CHECK (product_category IN ('VSC', 'GAP', 'maintenance', 'tire_wheel', 'key_replacement', 'paint_protection', 'windshield', 'other')),
  ceded_premium    NUMERIC(12,2) DEFAULT 0,
  deal_id          TEXT,
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reinsurance_policies_program ON reinsurance_policies (program_id);
CREATE INDEX IF NOT EXISTS idx_reinsurance_policies_dealer  ON reinsurance_policies (dealer_id);
ALTER TABLE reinsurance_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY reinsurance_policies_tenant ON reinsurance_policies
  USING (dealer_id = current_setting('app.current_dealer_id', true));

CREATE TABLE IF NOT EXISTS reinsurance_claims (
  id          TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  policy_id   TEXT          NOT NULL REFERENCES reinsurance_policies(id) ON DELETE CASCADE,
  dealer_id   UUID          NOT NULL,
  paid_amount NUMERIC(12,2) DEFAULT 0,
  status      TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'denied')),
  filed_at    TIMESTAMPTZ   DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reinsurance_claims_policy ON reinsurance_claims (policy_id);
ALTER TABLE reinsurance_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY reinsurance_claims_tenant ON reinsurance_claims
  USING (dealer_id = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- 13. erating_cache — cached F&I product rates
-- ============================================================================
CREATE TABLE IF NOT EXISTS erating_cache (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID         NOT NULL,
  vin         TEXT         NOT NULL,
  provider    TEXT         NOT NULL,
  product     TEXT         NOT NULL,
  term_months INTEGER,
  sale_price  NUMERIC(12,2),
  rate        NUMERIC(12,2),
  cost        NUMERIC(12,2),
  markup      NUMERIC(12,2),
  fetched_at  TIMESTAMPTZ  DEFAULT NOW(),
  expires_at  TIMESTAMPTZ  DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_erating_cache_dealer ON erating_cache (dealer_id);
CREATE INDEX IF NOT EXISTS idx_erating_cache_vin    ON erating_cache (vin);
CREATE INDEX IF NOT EXISTS idx_erating_cache_lookup ON erating_cache (dealer_id, vin, provider);
ALTER TABLE erating_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY erating_cache_tenant ON erating_cache
  USING (dealer_id = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- 14. deliveries — store-to-door delivery scheduling
-- ============================================================================
CREATE TABLE IF NOT EXISTS deliveries (
  id               TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id        UUID          NOT NULL,
  vehicle_vin      TEXT,
  customer_id      TEXT,
  customer_name    TEXT,
  customer_phone   TEXT,
  delivery_address TEXT,
  status           TEXT          NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_transit', 'delivered', 'cancelled')),
  slot_date        DATE,
  slot_time        TEXT,
  fee              NUMERIC(10,2) DEFAULT 0,
  distance_miles   NUMERIC(8,2) DEFAULT 0,
  notes            TEXT,
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_dealer  ON deliveries (dealer_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status  ON deliveries (status);
CREATE INDEX IF NOT EXISTS idx_deliveries_date    ON deliveries (slot_date);
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY deliveries_tenant ON deliveries
  USING (dealer_id = current_setting('app.current_dealer_id', true));

CREATE TRIGGER deliveries_updated_at BEFORE UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();

-- ============================================================================
-- 15. vehicle_delivery_tracker — 9-stage vehicle pipeline
-- ============================================================================
CREATE TABLE IF NOT EXISTS vehicle_delivery_tracker (
  id           TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id    UUID         NOT NULL,
  vin          TEXT         NOT NULL,
  current_stage TEXT        NOT NULL DEFAULT 'acquired' CHECK (current_stage IN ('acquired', 'in_transit', 'arrived', 'inspection', 'reconditioning', 'photos', 'listed', 'sold', 'delivered')),
  milestones   JSONB        DEFAULT '[]',
  vehicle_info JSONB        DEFAULT '{}',
  acquired_at  TIMESTAMPTZ  DEFAULT NOW(),
  last_updated TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (dealer_id, vin)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_delivery_tracker_dealer ON vehicle_delivery_tracker (dealer_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_delivery_tracker_stage  ON vehicle_delivery_tracker (current_stage);
ALTER TABLE vehicle_delivery_tracker ENABLE ROW LEVEL SECURITY;
CREATE POLICY vehicle_delivery_tracker_tenant ON vehicle_delivery_tracker
  USING (dealer_id = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- 16. walkarounds + walkaround_segments — video walkaround
-- ============================================================================
CREATE TABLE IF NOT EXISTS walkarounds (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID         NOT NULL,
  vin         TEXT         NOT NULL,
  status      TEXT         NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'recording', 'published', 'archived')),
  metadata    JSONB        DEFAULT '{}',
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  created_by  TEXT,
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_walkarounds_dealer ON walkarounds (dealer_id);
CREATE INDEX IF NOT EXISTS idx_walkarounds_vin    ON walkarounds (vin);
CREATE INDEX IF NOT EXISTS idx_walkarounds_status ON walkarounds (status);
ALTER TABLE walkarounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY walkarounds_tenant ON walkarounds
  USING (dealer_id = current_setting('app.current_dealer_id', true));

CREATE TABLE IF NOT EXISTS walkaround_segments (
  id               TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  walkaround_id    TEXT         NOT NULL REFERENCES walkarounds(id) ON DELETE CASCADE,
  segment_type     TEXT         NOT NULL CHECK (segment_type IN ('exterior_front', 'exterior_rear', 'exterior_driver', 'exterior_passenger', 'interior', 'trunk', 'engine', 'undercarriage')),
  url              TEXT         NOT NULL,
  thumbnail_url    TEXT,
  duration_seconds INTEGER      DEFAULT 0,
  added_at         TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_walkaround_segments_walkaround ON walkaround_segments (walkaround_id);

-- ============================================================================
-- 17. lead_ingestion_feeds + ingested_leads
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_ingestion_feeds (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID         NOT NULL,
  name        TEXT         NOT NULL DEFAULT 'Untitled Feed',
  source      TEXT         NOT NULL CHECK (source IN ('autotrader', 'cars_com', 'cargurus', 'generic_adf', 'carfax', 'truecar', 'edmunds', 'custom')),
  format      TEXT         DEFAULT 'adf_xml' CHECK (format IN ('adf_xml', 'json', 'csv')),
  active      BOOLEAN      DEFAULT true,
  webhook_url TEXT,
  last_received_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_ingestion_feeds_dealer ON lead_ingestion_feeds (dealer_id);
ALTER TABLE lead_ingestion_feeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_ingestion_feeds_tenant ON lead_ingestion_feeds
  USING (dealer_id = current_setting('app.current_dealer_id', true));

CREATE TABLE IF NOT EXISTS ingested_leads (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID         NOT NULL,
  feed_id     TEXT         REFERENCES lead_ingestion_feeds(id),
  lead_id     UUID         REFERENCES leads(id),
  source      TEXT,
  raw_payload JSONB,
  duplicate   BOOLEAN      DEFAULT false,
  ingested_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingested_leads_dealer ON ingested_leads (dealer_id);
CREATE INDEX IF NOT EXISTS idx_ingested_leads_feed   ON ingested_leads (feed_id);
CREATE INDEX IF NOT EXISTS idx_ingested_leads_at     ON ingested_leads (ingested_at);
ALTER TABLE ingested_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY ingested_leads_tenant ON ingested_leads
  USING (dealer_id = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- 18. dashboard_annotations — in-app annotations on dashboard widgets
-- ============================================================================
CREATE TABLE IF NOT EXISTS dashboard_annotations (
  id           TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id    UUID         NOT NULL,
  dashboard_id TEXT         NOT NULL DEFAULT 'main',
  date         DATE         NOT NULL,
  text         TEXT         NOT NULL,
  type         TEXT         NOT NULL DEFAULT 'note' CHECK (type IN ('campaign', 'milestone', 'alert', 'note')),
  created_by   TEXT,
  metadata     JSONB        DEFAULT '{}',
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_annotations_dealer ON dashboard_annotations (dealer_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_annotations_date   ON dashboard_annotations (date);
ALTER TABLE dashboard_annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY dashboard_annotations_tenant ON dashboard_annotations
  USING (dealer_id = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- 19. customer_touchpoints — omnichannel timeline
-- ============================================================================
CREATE TABLE IF NOT EXISTS customer_touchpoints (
  id          TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID         NOT NULL,
  customer_id TEXT         NOT NULL,
  channel     TEXT         NOT NULL CHECK (channel IN ('online', 'phone', 'email', 'in_store', 'sms', 'chat', 'social')),
  timestamp   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  summary     TEXT,
  metadata    JSONB        DEFAULT '{}',
  handoff_token TEXT,
  qr_code_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_customer_touchpoints_dealer   ON customer_touchpoints (dealer_id);
CREATE INDEX IF NOT EXISTS idx_customer_touchpoints_customer ON customer_touchpoints (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_touchpoints_ts       ON customer_touchpoints (timestamp);
ALTER TABLE customer_touchpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_touchpoints_tenant ON customer_touchpoints
  USING (dealer_id = current_setting('app.current_dealer_id', true));

-- ============================================================================
-- 20. Add missing columns to customers table (equity-mining + households need them)
-- ============================================================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS zip TEXT;

-- Backfill first_name/last_name from name column where possible
UPDATE customers
SET first_name = split_part(name, ' ', 1),
    last_name  = CASE
      WHEN position(' ' IN name) > 0 THEN substring(name FROM position(' ' IN name) + 1)
      ELSE ''
    END
WHERE first_name IS NULL AND name IS NOT NULL;

-- ============================================================================
-- 21. Learning views — materialized aggregates for the propensity model
-- ============================================================================

-- Feature engagement summary (used by propensity scoring + analytics brain)
CREATE OR REPLACE VIEW v_feature_engagement AS
SELECT
  page AS dealer_id,
  event_type AS module,
  action,
  DATE(timestamp) AS event_date,
  COUNT(*) AS event_count,
  COUNT(DISTINCT session_id) AS unique_sessions,
  COUNT(DISTINCT user_fingerprint) AS unique_users
FROM analytics_events
WHERE timestamp > NOW() - INTERVAL '90 days'
GROUP BY page, event_type, action, DATE(timestamp);

-- Module adoption rate (which features are actually being used per dealer)
CREATE OR REPLACE VIEW v_module_adoption AS
SELECT
  page AS dealer_id,
  event_type AS module,
  COUNT(*) AS total_events,
  COUNT(DISTINCT DATE(timestamp)) AS active_days,
  MIN(timestamp) AS first_use,
  MAX(timestamp) AS last_use,
  CASE
    WHEN COUNT(DISTINCT DATE(timestamp)) >= 14 THEN 'power_user'
    WHEN COUNT(DISTINCT DATE(timestamp)) >= 3  THEN 'active'
    WHEN COUNT(DISTINCT DATE(timestamp)) >= 1  THEN 'tried'
    ELSE 'never'
  END AS adoption_tier
FROM analytics_events
WHERE timestamp > NOW() - INTERVAL '30 days'
GROUP BY page, event_type;

-- Error impact ranking (correlates errors with session behavior)
CREATE OR REPLACE VIEW v_error_impact AS
SELECT
  ce.dealer_id,
  ce.fingerprint,
  MIN(ce.message) AS message,
  COUNT(*) AS occurrences,
  COUNT(DISTINCT ce.session_id) AS affected_sessions,
  COUNT(*) * COUNT(DISTINCT ce.session_id) AS impact_score,
  MIN(ce.captured_at) AS first_seen,
  MAX(ce.captured_at) AS last_seen,
  BOOL_OR(ce.resolved_at IS NOT NULL) AS any_resolved
FROM client_errors ce
WHERE ce.captured_at > NOW() - INTERVAL '30 days'
GROUP BY ce.dealer_id, ce.fingerprint;

-- Delivery performance (learning for scheduling optimization)
CREATE OR REPLACE VIEW v_delivery_performance AS
SELECT
  dealer_id,
  COUNT(*) AS total_deliveries,
  COUNT(*) FILTER (WHERE status = 'delivered') AS completed,
  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
  AVG(distance_miles) AS avg_distance,
  AVG(fee) AS avg_fee,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'delivered') / NULLIF(COUNT(*), 0), 1) AS completion_rate
FROM deliveries
GROUP BY dealer_id;

-- Reinsurance ROI (learning for F&I product recommendations)
CREATE OR REPLACE VIEW v_reinsurance_roi AS
SELECT
  rp.dealer_id,
  rp.id AS program_id,
  rp.name,
  rp.type,
  COALESCE(SUM(rpol.ceded_premium), 0) AS total_premiums_earned,
  COALESCE(SUM(rc.paid_amount), 0) AS total_claims_paid,
  CASE
    WHEN COALESCE(SUM(rpol.ceded_premium), 0) > 0
    THEN ROUND(100.0 * (SUM(rpol.ceded_premium) - COALESCE(SUM(rc.paid_amount), 0)) / SUM(rpol.ceded_premium), 1)
    ELSE 0
  END AS roi_pct
FROM reinsurance_programs rp
LEFT JOIN reinsurance_policies rpol ON rpol.program_id = rp.id
LEFT JOIN reinsurance_claims rc ON rc.policy_id = rpol.id AND rc.status = 'paid'
GROUP BY rp.dealer_id, rp.id, rp.name, rp.type;

-- Survey NPS trend (learning for customer satisfaction optimization)
CREATE OR REPLACE VIEW v_survey_nps AS
SELECT
  sr.dealer_id,
  s.id AS survey_id,
  s.title,
  COUNT(*) AS total_responses,
  AVG(sr.nps_score) AS avg_nps,
  COUNT(*) FILTER (WHERE sr.nps_score >= 9) AS promoters,
  COUNT(*) FILTER (WHERE sr.nps_score BETWEEN 7 AND 8) AS passives,
  COUNT(*) FILTER (WHERE sr.nps_score <= 6) AS detractors,
  ROUND(
    100.0 * (COUNT(*) FILTER (WHERE sr.nps_score >= 9) - COUNT(*) FILTER (WHERE sr.nps_score <= 6))
    / NULLIF(COUNT(*), 0), 1
  ) AS nps_score
FROM survey_responses sr
JOIN surveys s ON s.id = sr.survey_id
WHERE sr.nps_score IS NOT NULL
GROUP BY sr.dealer_id, s.id, s.title;
