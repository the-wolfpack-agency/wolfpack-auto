-- Migration 073: Title/lien lookups + USPS address validation cache
--
-- Stream E (2026-05-12) — adds REAL public-API integrations:
--   1. State title/lien lookups (Florida real; California + Texas honest stubs)
--   2. USPS address validation (free Web Tools API)
--
-- Two tables, both dealer-scoped + RLS enforced:
--
--   vehicle_title_lookups — cache of state title/lien API responses keyed on
--                           (vin, state_code). 24h TTL. We never re-pull the
--                           same VIN twice in a day; reduces upstream load and
--                           keeps demos cheap.
--
--   address_validations   — cache of USPS standardize-address responses keyed
--                           on the raw input_address string. 30d TTL because
--                           USPS canonicalization is extremely stable for the
--                           same input — re-validating costs API budget for
--                           zero new information.
--
-- Both tables are tenant-scoped (dealer_id NOT NULL) so RLS can isolate dealer-
-- specific lookups (a dealer can see only their own audit trail, even though
-- the underlying data is technically public). Pattern matches the recall +
-- market-intel migrations (068, 065).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. vehicle_title_lookups — 24h cache of state title/lien API responses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicle_title_lookups (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id          UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  vehicle_id         UUID         REFERENCES vehicles(id) ON DELETE SET NULL,
  state_code         TEXT         NOT NULL,
  vin                TEXT         NOT NULL,
  raw_response       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  has_lien           BOOLEAN,
  lienholder_name    TEXT,
  title_status       TEXT,
  source             TEXT         NOT NULL DEFAULT 'unknown',
  supported          BOOLEAN      NOT NULL DEFAULT FALSE,
  unsupported_reason TEXT,
  looked_up_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (char_length(vin) BETWEEN 1 AND 64),
  CHECK (char_length(state_code) BETWEEN 2 AND 2)
);

-- Cache uniqueness: dedupe lookups on (vin, state_code). Within a 24h window,
-- the second call returns the cached row instead of hitting the upstream API.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_title_lookups_vin_state
  ON vehicle_title_lookups (vin, state_code);

CREATE INDEX IF NOT EXISTS idx_vehicle_title_lookups_dealer
  ON vehicle_title_lookups (dealer_id, looked_up_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_title_lookups_vehicle
  ON vehicle_title_lookups (dealer_id, vehicle_id)
  WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_title_lookups_expires_at
  ON vehicle_title_lookups (expires_at);

ALTER TABLE vehicle_title_lookups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vehicle_title_lookups_tenant ON vehicle_title_lookups;
CREATE POLICY vehicle_title_lookups_tenant ON vehicle_title_lookups
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- 2. address_validations — 30d cache of USPS standardization responses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS address_validations (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id          UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  input_address      TEXT         NOT NULL,
  canonical_address  TEXT,
  status             TEXT         NOT NULL
                       CHECK (status IN ('valid', 'invalid', 'correctable', 'unverifiable')),
  components         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  source             TEXT         NOT NULL DEFAULT 'usps',
  looked_up_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at         TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Cache uniqueness: same dealer + same input string -> single row.
-- (We let DIFFERENT dealers each maintain their own audit trail.)
CREATE UNIQUE INDEX IF NOT EXISTS idx_address_validations_dealer_input
  ON address_validations (dealer_id, input_address);

CREATE INDEX IF NOT EXISTS idx_address_validations_dealer_looked_up
  ON address_validations (dealer_id, looked_up_at DESC);
CREATE INDEX IF NOT EXISTS idx_address_validations_status
  ON address_validations (dealer_id, status);
CREATE INDEX IF NOT EXISTS idx_address_validations_expires_at
  ON address_validations (expires_at);

ALTER TABLE address_validations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS address_validations_tenant ON address_validations;
CREATE POLICY address_validations_tenant ON address_validations
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ---------------------------------------------------------------------------
-- 3. Final ASSERT — fail loudly if either table is missing.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM (
    SELECT 'vehicle_title_lookups' AS t WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'vehicle_title_lookups'
    )
    UNION ALL SELECT 'address_validations' WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_name = 'address_validations'
    )
  ) AS missing_tables;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 073 failed — missing tables: %', missing;
  END IF;
END $$;

COMMIT;
