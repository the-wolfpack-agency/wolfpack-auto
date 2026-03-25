-- 001_initial_schema.sql
-- Bootstraps the full Wolfpack Auto schema.
-- This file is a copy of src/db/schema.sql for migration-runner consumption.

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE dealer_groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  admin_email TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dealers (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  subdomain          TEXT NOT NULL UNIQUE,
  phone              TEXT NOT NULL DEFAULT '',
  email              TEXT NOT NULL DEFAULT '',
  website_url        TEXT NOT NULL DEFAULT '',
  address            JSONB NOT NULL DEFAULT '{}',
  sales_hours        JSONB NOT NULL DEFAULT '[]',
  service_hours      JSONB NOT NULL DEFAULT '[]',
  branding           JSONB NOT NULL DEFAULT '{}',
  has_service_center BOOLEAN NOT NULL DEFAULT false,
  has_financing      BOOLEAN NOT NULL DEFAULT false,
  has_trade_in       BOOLEAN NOT NULL DEFAULT false,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dealer_group_members (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_group_id UUID NOT NULL REFERENCES dealer_groups(id) ON DELETE CASCADE,
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dealer_group_id, dealer_id)
);

CREATE TABLE vehicles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  vin             TEXT NOT NULL,
  stock_number    TEXT NOT NULL DEFAULT '',
  year            INTEGER NOT NULL,
  make            TEXT NOT NULL,
  model           TEXT NOT NULL,
  trim            TEXT NOT NULL DEFAULT '',
  body_style      TEXT NOT NULL DEFAULT '',
  exterior_color  TEXT NOT NULL DEFAULT '',
  interior_color  TEXT NOT NULL DEFAULT '',
  engine          TEXT NOT NULL DEFAULT '',
  transmission    TEXT NOT NULL DEFAULT 'automatic',
  drivetrain      TEXT NOT NULL DEFAULT 'fwd',
  fuel_type       TEXT NOT NULL DEFAULT 'gasoline',
  mpg_city        INTEGER,
  mpg_highway     INTEGER,
  msrp            NUMERIC(12, 2),
  price           NUMERIC(12, 2) NOT NULL,
  internet_price  NUMERIC(12, 2),
  condition       TEXT NOT NULL DEFAULT 'used',
  mileage         INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'available',
  days_on_lot     INTEGER NOT NULL DEFAULT 0,
  photos          JSONB NOT NULL DEFAULT '[]',
  photo_count     INTEGER NOT NULL DEFAULT 0,
  description     TEXT NOT NULL DEFAULT '',
  features        JSONB NOT NULL DEFAULT '[]',
  vdp_url         TEXT NOT NULL DEFAULT '',
  search_vector   TSVECTOR,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dealer_id, vin)
);

-- Full-text search trigger
CREATE FUNCTION vehicles_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.make, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.model, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.trim, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.body_style, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_vehicles_search_vector
  BEFORE INSERT OR UPDATE ON vehicles
  FOR EACH ROW
  EXECUTE FUNCTION vehicles_search_vector_update();

CREATE TABLE leads (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id        UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  vehicle_id       UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  email            TEXT NOT NULL,
  phone            TEXT,
  vehicle_interest TEXT NOT NULL DEFAULT '',
  source           TEXT NOT NULL DEFAULT 'website_form',
  status           TEXT NOT NULL DEFAULT 'new',
  notes            TEXT NOT NULL DEFAULT '',
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT,
  referrer_url     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE page_views (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id   UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  vehicle_id  UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  page_path   TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  user_agent  TEXT NOT NULL DEFAULT '',
  ip_hash     TEXT NOT NULL DEFAULT '',
  referrer    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE seo_metrics (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id        UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  page_path        TEXT NOT NULL,
  title_tag        TEXT NOT NULL DEFAULT '',
  meta_description TEXT NOT NULL DEFAULT '',
  impressions      INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  avg_position     NUMERIC(5, 2) NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dealer_id, page_path)
);

CREATE TABLE ab_tests (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id      UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  test_name      TEXT NOT NULL,
  variant_a      TEXT NOT NULL,
  variant_b      TEXT NOT NULL,
  winner         TEXT,
  conversions_a  INTEGER NOT NULL DEFAULT 0,
  conversions_b  INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'running',
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at       TIMESTAMPTZ
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_vehicles_dealer_status     ON vehicles (dealer_id, status);
CREATE INDEX idx_vehicles_dealer_make_model ON vehicles (dealer_id, make, model);
CREATE INDEX idx_vehicles_vin               ON vehicles (vin);
CREATE INDEX idx_vehicles_dealer_created    ON vehicles (dealer_id, created_at DESC);
CREATE INDEX idx_vehicles_search            ON vehicles USING GIN (search_vector);
CREATE INDEX idx_vehicles_dealer_condition  ON vehicles (dealer_id, condition);
CREATE INDEX idx_vehicles_dealer_body_style ON vehicles (dealer_id, body_style);

CREATE INDEX idx_leads_dealer_status  ON leads (dealer_id, status);
CREATE INDEX idx_leads_dealer_created ON leads (dealer_id, created_at DESC);
CREATE INDEX idx_leads_email          ON leads (email);

CREATE INDEX idx_page_views_dealer_created ON page_views (dealer_id, created_at DESC);
CREATE INDEX idx_page_views_session        ON page_views (session_id);

CREATE INDEX idx_seo_metrics_dealer ON seo_metrics (dealer_id);
CREATE INDEX idx_ab_tests_dealer    ON ab_tests (dealer_id);

-- =============================================================================
-- Row-Level Security
-- =============================================================================

ALTER TABLE vehicles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_views  ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_tests    ENABLE ROW LEVEL SECURITY;

CREATE POLICY vehicles_tenant_isolation ON vehicles
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);
CREATE POLICY vehicles_tenant_insert ON vehicles
  FOR INSERT WITH CHECK (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

CREATE POLICY leads_tenant_isolation ON leads
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);
CREATE POLICY leads_tenant_insert ON leads
  FOR INSERT WITH CHECK (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

CREATE POLICY page_views_tenant_isolation ON page_views
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);
CREATE POLICY page_views_tenant_insert ON page_views
  FOR INSERT WITH CHECK (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

CREATE POLICY seo_metrics_tenant_isolation ON seo_metrics
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);
CREATE POLICY seo_metrics_tenant_insert ON seo_metrics
  FOR INSERT WITH CHECK (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

CREATE POLICY ab_tests_tenant_isolation ON ab_tests
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);
CREATE POLICY ab_tests_tenant_insert ON ab_tests
  FOR INSERT WITH CHECK (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Updated-at triggers
-- =============================================================================

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dealers_updated_at
  BEFORE UPDATE ON dealers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_vehicles_updated_at
  BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
