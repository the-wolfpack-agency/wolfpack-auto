-- Migration 061: Multi-Rooftop Inventory Pool / Swap Engine
--
-- Lets dealer-group rooftops share inventory visibility, reserve cross-rooftop
-- vehicles for incoming customers, and execute swaps when a sister rooftop has
-- higher local-market velocity for an aged unit.
--
-- All tables additive + idempotent. RLS enabled on every table; pool members
-- get cross-tenant SELECT access through a permissive policy that keys on
-- pool membership (cloned from the migration 055 RLS pattern but extended for
-- the share-policy escape hatch).

-- ============================================================================
-- 1. inventory_pool_memberships — rooftops opted into a dealer-group pool
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_pool_memberships (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_group_id  UUID         NOT NULL,
  dealer_id        UUID         NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  joined_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  share_policy     TEXT         NOT NULL DEFAULT 'all'
                     CHECK (share_policy IN ('all','used_only','aged_only','opt_in_per_vehicle')),
  active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (dealer_group_id, dealer_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_memberships_group
  ON inventory_pool_memberships (dealer_group_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_pool_memberships_dealer
  ON inventory_pool_memberships (dealer_id) WHERE active = TRUE;

ALTER TABLE inventory_pool_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_pool_memberships_tenant ON inventory_pool_memberships;
CREATE POLICY inventory_pool_memberships_tenant
  ON inventory_pool_memberships
  USING (dealer_id = current_setting('app.current_dealer_id', true)::uuid);

-- ============================================================================
-- 2. inventory_pool_visibilities — exposed inventory rows per pool member
--    Computed from share_policy. (vin, dealer_id, exposed_to_dealer_id) is
--    the natural key — re-running recompute is idempotent.
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_pool_visibilities (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vin                   TEXT         NOT NULL,
  dealer_id             UUID         NOT NULL,
  exposed_to_dealer_id  UUID         NOT NULL,
  exposed_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (vin, dealer_id, exposed_to_dealer_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_visibilities_exposed
  ON inventory_pool_visibilities (exposed_to_dealer_id, exposed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pool_visibilities_owner
  ON inventory_pool_visibilities (dealer_id);

ALTER TABLE inventory_pool_visibilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_pool_visibilities_access ON inventory_pool_visibilities;
-- A row is visible to either the owner OR the recipient dealer. Cross-tenant
-- SELECT is the entire point of the pool, so the policy intentionally widens
-- the standard (dealer_id = current) check.
CREATE POLICY inventory_pool_visibilities_access
  ON inventory_pool_visibilities
  USING (
    dealer_id = current_setting('app.current_dealer_id', true)::uuid
    OR exposed_to_dealer_id = current_setting('app.current_dealer_id', true)::uuid
  );

-- ============================================================================
-- 3. inventory_reservations — cross-rooftop holds against a VIN
--    Default 24h TTL enforced at the application layer.
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vin                   TEXT         NOT NULL,
  requesting_dealer_id  UUID         NOT NULL REFERENCES dealers(id),
  owning_dealer_id      UUID         NOT NULL REFERENCES dealers(id),
  customer_id           UUID,
  status                TEXT         NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','rejected','fulfilled','expired')),
  requested_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  decision_at           TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  notes                 TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_owner_status
  ON inventory_reservations (owning_dealer_id, status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_requester_status
  ON inventory_reservations (requesting_dealer_id, status, requested_at DESC);

ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_reservations_access ON inventory_reservations;
-- Both sides of the reservation can SELECT (sender + receiver).
CREATE POLICY inventory_reservations_access
  ON inventory_reservations
  USING (
    requesting_dealer_id = current_setting('app.current_dealer_id', true)::uuid
    OR owning_dealer_id = current_setting('app.current_dealer_id', true)::uuid
  );

-- ============================================================================
-- 4. inventory_swap_proposals — system-suggested A↔B swaps for velocity lift
-- ============================================================================
CREATE TABLE IF NOT EXISTS inventory_swap_proposals (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_group_id          UUID         NOT NULL,
  vin_a                    TEXT         NOT NULL,
  dealer_a_id              UUID         NOT NULL REFERENCES dealers(id),
  vin_b                    TEXT         NOT NULL,
  dealer_b_id              UUID         NOT NULL REFERENCES dealers(id),
  rationale                TEXT,
  expected_velocity_lift   NUMERIC(6,2) NOT NULL DEFAULT 0,
  status                   TEXT         NOT NULL DEFAULT 'proposed'
                             CHECK (status IN ('proposed','accepted','rejected','completed')),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (dealer_group_id, vin_a, vin_b)
);

CREATE INDEX IF NOT EXISTS idx_swap_proposals_group_status
  ON inventory_swap_proposals (dealer_group_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swap_proposals_dealer_a
  ON inventory_swap_proposals (dealer_a_id, status);
CREATE INDEX IF NOT EXISTS idx_swap_proposals_dealer_b
  ON inventory_swap_proposals (dealer_b_id, status);

ALTER TABLE inventory_swap_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_swap_proposals_access ON inventory_swap_proposals;
-- Both dealers in the swap can SELECT.
CREATE POLICY inventory_swap_proposals_access
  ON inventory_swap_proposals
  USING (
    dealer_a_id = current_setting('app.current_dealer_id', true)::uuid
    OR dealer_b_id = current_setting('app.current_dealer_id', true)::uuid
  );

-- ============================================================================
-- 5. updated_at triggers
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at_column') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'inventory_pool_memberships_updated_at') THEN
      CREATE TRIGGER inventory_pool_memberships_updated_at
        BEFORE UPDATE ON inventory_pool_memberships
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'inventory_reservations_updated_at') THEN
      CREATE TRIGGER inventory_reservations_updated_at
        BEFORE UPDATE ON inventory_reservations
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'inventory_swap_proposals_updated_at') THEN
      CREATE TRIGGER inventory_swap_proposals_updated_at
        BEFORE UPDATE ON inventory_swap_proposals
        FOR EACH ROW EXECUTE FUNCTION set_updated_at_column();
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 6. Row-count assertion guard
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_name = 'inventory_pool_memberships') THEN
    RAISE EXCEPTION 'Migration 061 failed: inventory_pool_memberships was not created';
  END IF;
END $$;
