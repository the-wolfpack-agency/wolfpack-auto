-- Communication automation: templates, sequences, message log
CREATE TABLE IF NOT EXISTS message_templates (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID NOT NULL REFERENCES dealers(id),
  name        TEXT NOT NULL,
  channel     TEXT NOT NULL CHECK (channel IN ('email','sms')),
  subject     TEXT,  -- email only
  body        TEXT NOT NULL,
  variables   TEXT[],  -- e.g. {'first_name','vehicle_interest','dealer_name'}
  category    TEXT DEFAULT 'general',
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS follow_up_sequences (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   UUID NOT NULL REFERENCES dealers(id),
  name        TEXT NOT NULL,
  trigger_on  TEXT NOT NULL CHECK (trigger_on IN ('lead_created','status_change','appointment_set','no_response','post_sale')),
  steps       JSONB NOT NULL DEFAULT '[]',
  -- steps: [{delay_hours, channel, template_id, subject_override}]
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_log (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id     UUID NOT NULL REFERENCES dealers(id),
  lead_id       TEXT REFERENCES leads(id),
  channel       TEXT NOT NULL CHECK (channel IN ('email','sms')),
  direction     TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  recipient     TEXT NOT NULL,  -- email or phone
  subject       TEXT,
  body          TEXT NOT NULL,
  template_id   TEXT REFERENCES message_templates(id),
  sequence_id   TEXT REFERENCES follow_up_sequences(id),
  status        TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','opened','clicked','bounced','failed')),
  sent_at       TIMESTAMPTZ,
  opened_at     TIMESTAMPTZ,
  clicked_at    TIMESTAMPTZ,
  error_message TEXT,
  external_id   TEXT,  -- Resend/Twilio message ID
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_message_log_dealer ON message_log(dealer_id);
CREATE INDEX idx_message_log_lead ON message_log(lead_id);
CREATE INDEX idx_message_log_status ON message_log(dealer_id, status);
