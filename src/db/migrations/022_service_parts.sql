-- Service & Parts module
CREATE TABLE IF NOT EXISTS service_appointments (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id     TEXT NOT NULL REFERENCES dealers(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  vehicle_vin   TEXT,
  vehicle_desc  TEXT,  -- "2024 Honda CR-V EX-L"
  service_type  TEXT NOT NULL CHECK (service_type IN ('maintenance','repair','recall','inspection','detail','other')),
  description   TEXT,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  estimated_duration_min INTEGER DEFAULT 60,
  status        TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','checked_in','in_progress','waiting_parts','completed','cancelled','no_show')),
  assigned_tech TEXT,
  bay_number    TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_appts_dealer ON service_appointments(dealer_id);
CREATE INDEX idx_service_appts_date ON service_appointments(dealer_id, scheduled_at);
CREATE INDEX idx_service_appts_vin ON service_appointments(vehicle_vin);

CREATE TABLE IF NOT EXISTS repair_orders (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id     TEXT NOT NULL REFERENCES dealers(id),
  ro_number     TEXT NOT NULL,
  appointment_id TEXT REFERENCES service_appointments(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  vehicle_vin   TEXT NOT NULL,
  vehicle_desc  TEXT,
  mileage_in    INTEGER,
  mileage_out   INTEGER,

  -- Line items as JSONB array: [{description, labor_hours, labor_rate, parts_cost, total}]
  line_items    JSONB DEFAULT '[]',
  parts_total   NUMERIC(10,2) DEFAULT 0,
  labor_total   NUMERIC(10,2) DEFAULT 0,
  tax           NUMERIC(10,2) DEFAULT 0,
  grand_total   NUMERIC(10,2) DEFAULT 0,

  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_parts','waiting_approval','completed','invoiced','paid')),
  tech_assigned TEXT,
  advisor       TEXT,
  promised_at   TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  paid_at       TIMESTAMPTZ,
  notes         TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repair_orders_dealer ON repair_orders(dealer_id);
CREATE INDEX idx_repair_orders_vin ON repair_orders(vehicle_vin);

CREATE TABLE IF NOT EXISTS parts_inventory (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id     TEXT NOT NULL REFERENCES dealers(id),
  part_number   TEXT NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT DEFAULT 'general',
  manufacturer  TEXT,
  quantity_on_hand INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER NOT NULL DEFAULT 0,
  reorder_point INTEGER DEFAULT 2,
  cost          NUMERIC(10,2),
  retail_price  NUMERIC(10,2),
  location      TEXT,  -- bin/shelf location
  last_ordered  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(dealer_id, part_number)
);

CREATE TABLE IF NOT EXISTS technicians (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   TEXT NOT NULL REFERENCES dealers(id),
  name        TEXT NOT NULL,
  specialties TEXT[],  -- e.g. {'engine','transmission','electrical'}
  certifications TEXT[],
  hourly_rate NUMERIC(8,2),
  status      TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','busy','off','on_leave')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS service_history (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  dealer_id   TEXT NOT NULL REFERENCES dealers(id),
  vehicle_vin TEXT NOT NULL,
  ro_id       TEXT REFERENCES repair_orders(id),
  service_date TIMESTAMPTZ NOT NULL,
  mileage     INTEGER,
  description TEXT NOT NULL,
  cost        NUMERIC(10,2),
  tech_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_history_vin ON service_history(vehicle_vin);
