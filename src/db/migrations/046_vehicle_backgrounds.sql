-- Migration 046: Vehicle Background Studio
-- Enterprise-grade background management with AI removal, custom uploads,
-- compositing, batch processing, and full analytics integration.

BEGIN;

-- =============================================================================
-- Custom Backgrounds (dealer-uploaded or system-provided image backgrounds)
-- =============================================================================

CREATE TABLE custom_backgrounds (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,

  -- Metadata
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL DEFAULT 'custom',
    -- categories: studio, outdoor, branded, seasonal, lifestyle, custom
  tags            TEXT[] NOT NULL DEFAULT '{}',

  -- Image storage (R2 keys + CDN URLs)
  original_key    TEXT NOT NULL,           -- R2 key for original upload
  original_url    TEXT NOT NULL,           -- CDN URL for original
  optimized_key   TEXT,                    -- R2 key for WebP-optimized version
  optimized_url   TEXT,                    -- CDN URL for optimized
  thumbnail_key   TEXT,                    -- R2 key for 320x240 thumbnail
  thumbnail_url   TEXT,                    -- CDN URL for thumbnail

  -- Image dimensions & format
  width           INTEGER NOT NULL DEFAULT 0,
  height          INTEGER NOT NULL DEFAULT 0,
  file_size       INTEGER NOT NULL DEFAULT 0,     -- bytes
  mime_type       TEXT NOT NULL DEFAULT 'image/jpeg',

  -- Display settings
  position        TEXT NOT NULL DEFAULT 'center',  -- CSS object-position
  fit             TEXT NOT NULL DEFAULT 'cover',    -- CSS object-fit
  overlay_opacity NUMERIC(3,2) NOT NULL DEFAULT 0, -- 0..1, darkening overlay

  -- Status
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_system       BOOLEAN NOT NULL DEFAULT false,  -- system-provided vs dealer-uploaded
  sort_order      INTEGER NOT NULL DEFAULT 0,

  -- Analytics (denormalized for fast reads)
  times_applied   INTEGER NOT NULL DEFAULT 0,
  total_views     INTEGER NOT NULL DEFAULT 0,
  total_clicks    INTEGER NOT NULL DEFAULT 0,
  total_leads     INTEGER NOT NULL DEFAULT 0,
  engagement_score NUMERIC(10,2) NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_custom_backgrounds_dealer   ON custom_backgrounds (dealer_id);
CREATE INDEX idx_custom_backgrounds_category ON custom_backgrounds (dealer_id, category);
CREATE INDEX idx_custom_backgrounds_active   ON custom_backgrounds (dealer_id, is_active) WHERE is_active = true;

-- RLS
ALTER TABLE custom_backgrounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_backgrounds_tenant ON custom_backgrounds
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Vehicle Background Assignments (which background is applied to which vehicle)
-- =============================================================================

CREATE TABLE vehicle_background_assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  vehicle_id      UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  vin             TEXT NOT NULL,

  -- What background is applied?
  background_type TEXT NOT NULL DEFAULT 'preset',
    -- 'preset' = built-in CSS preset
    -- 'custom' = dealer-uploaded from custom_backgrounds
    -- 'composite' = AI-processed composite image
  preset_id       TEXT,                                          -- for type=preset
  custom_bg_id    UUID REFERENCES custom_backgrounds(id) ON DELETE SET NULL,  -- for type=custom

  -- Composite result (when AI background removal + compositing was done)
  composite_key   TEXT,           -- R2 key for final composite image
  composite_url   TEXT,           -- CDN URL for composite
  cutout_key      TEXT,           -- R2 key for vehicle cutout (transparent PNG)
  cutout_url      TEXT,           -- CDN URL for cutout
  composite_width  INTEGER,
  composite_height INTEGER,

  -- CSS fallback (always available, even for composite)
  css_override    TEXT,           -- inline CSS for the background

  -- Metadata
  applied_by      UUID,          -- user who applied (NULL for auto-applied)
  applied_method  TEXT NOT NULL DEFAULT 'manual',
    -- 'manual', 'auto_recommended', 'batch', 'ai_composite'
  is_active       BOOLEAN NOT NULL DEFAULT true,

  -- Performance tracking (denormalized for fast reads)
  views           INTEGER NOT NULL DEFAULT 0,
  clicks          INTEGER NOT NULL DEFAULT 0,
  leads_generated INTEGER NOT NULL DEFAULT 0,
  avg_dwell_ms    INTEGER NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One active assignment per vehicle
  UNIQUE (vehicle_id, is_active) -- partial unique handled by index below
);

-- Only one active assignment per vehicle (partial unique index)
DROP INDEX IF EXISTS idx_vba_unique_active;
CREATE UNIQUE INDEX idx_vba_unique_active
  ON vehicle_background_assignments (vehicle_id)
  WHERE is_active = true;

CREATE INDEX idx_vba_dealer     ON vehicle_background_assignments (dealer_id);
CREATE INDEX idx_vba_vin        ON vehicle_background_assignments (dealer_id, vin);
CREATE INDEX idx_vba_custom_bg  ON vehicle_background_assignments (custom_bg_id) WHERE custom_bg_id IS NOT NULL;

-- RLS
ALTER TABLE vehicle_background_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY vba_tenant ON vehicle_background_assignments
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Background Processing Jobs (AI removal + compositing queue)
-- =============================================================================

CREATE TABLE background_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,

  -- What we're processing
  vehicle_id      UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  vin             TEXT NOT NULL,
  source_photo_url TEXT NOT NULL,          -- original vehicle photo URL
  target_bg_id    UUID REFERENCES custom_backgrounds(id) ON DELETE SET NULL,
  target_preset   TEXT,                    -- OR a preset ID

  -- Job lifecycle
  status          TEXT NOT NULL DEFAULT 'queued',
    -- 'queued', 'removing_bg', 'compositing', 'optimizing', 'uploading', 'completed', 'failed'
  progress        INTEGER NOT NULL DEFAULT 0,   -- 0..100
  error_message   TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retries     INTEGER NOT NULL DEFAULT 3,

  -- Results
  cutout_key      TEXT,           -- R2 key for transparent vehicle cutout
  cutout_url      TEXT,
  composite_key   TEXT,           -- R2 key for final composite
  composite_url   TEXT,

  -- AI service details
  ai_provider     TEXT NOT NULL DEFAULT 'replicate',  -- 'replicate', 'remove_bg'
  ai_model        TEXT NOT NULL DEFAULT 'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46',
  ai_prediction_id TEXT,          -- Replicate prediction ID for tracking
  processing_ms   INTEGER,        -- total processing time

  -- Cost tracking
  cost_cents      INTEGER NOT NULL DEFAULT 0,   -- processing cost in cents

  -- Batch reference
  batch_id        UUID,           -- groups jobs from a single batch operation

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_bg_jobs_dealer  ON background_jobs (dealer_id);
CREATE INDEX idx_bg_jobs_status  ON background_jobs (status) WHERE status NOT IN ('completed', 'failed');
CREATE INDEX idx_bg_jobs_batch   ON background_jobs (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_bg_jobs_vehicle ON background_jobs (vehicle_id);

-- RLS
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY bg_jobs_tenant ON background_jobs
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Background Performance Snapshots (time-series for learning)
-- =============================================================================

CREATE TABLE background_performance_snapshots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  assignment_id   UUID NOT NULL REFERENCES vehicle_background_assignments(id) ON DELETE CASCADE,
  vin             TEXT NOT NULL,

  -- Background identification
  background_type TEXT NOT NULL,  -- 'preset', 'custom', 'composite'
  preset_id       TEXT,
  custom_bg_id    UUID,

  -- Engagement metrics at snapshot time
  views           INTEGER NOT NULL DEFAULT 0,
  clicks          INTEGER NOT NULL DEFAULT 0,
  leads_generated INTEGER NOT NULL DEFAULT 0,
  avg_dwell_ms    INTEGER NOT NULL DEFAULT 0,

  -- Computed scores
  engagement_score NUMERIC(10,2) NOT NULL DEFAULT 0,
  ctr             NUMERIC(5,4) NOT NULL DEFAULT 0,    -- click-through rate
  lead_rate       NUMERIC(5,4) NOT NULL DEFAULT 0,    -- leads per view

  -- Context at snapshot time
  vehicle_price   NUMERIC(10,2),
  vehicle_make    TEXT,
  vehicle_condition TEXT,
  day_of_week     INTEGER,        -- 0=Sunday
  hour_of_day     INTEGER,

  snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bg_perf_dealer ON background_performance_snapshots (dealer_id);
CREATE INDEX idx_bg_perf_time   ON background_performance_snapshots (snapshot_at DESC);
CREATE INDEX idx_bg_perf_bg     ON background_performance_snapshots (background_type, preset_id);

-- RLS
ALTER TABLE background_performance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY bg_perf_tenant ON background_performance_snapshots
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- =============================================================================
-- Trigger: updated_at auto-update
-- =============================================================================

CREATE OR REPLACE FUNCTION update_background_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_custom_backgrounds_updated
  BEFORE UPDATE ON custom_backgrounds
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();

CREATE TRIGGER trg_vba_updated
  BEFORE UPDATE ON vehicle_background_assignments
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();

CREATE TRIGGER trg_bg_jobs_updated
  BEFORE UPDATE ON background_jobs
  FOR EACH ROW EXECUTE FUNCTION update_background_timestamp();

COMMIT;
