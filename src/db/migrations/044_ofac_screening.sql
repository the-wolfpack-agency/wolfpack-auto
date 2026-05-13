-- OFAC SDN screening records — legally required audit trail for every screening
-- Every vehicle sale MUST have an OFAC screening before deal completion

CREATE TABLE IF NOT EXISTS ofac_screenings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id       UUID NOT NULL REFERENCES dealers(id),
  -- `deals` is a backward-compat VIEW over `deal_worksheets` (migration 036);
  -- Postgres won't FK against a view, so reference the underlying table.
  -- deal_worksheets.id is TEXT (uses gen_random_uuid()::text), so the FK
  -- column must be TEXT too.
  deal_id         TEXT REFERENCES deal_worksheets(id),
  customer_name   TEXT NOT NULL,
  customer_dob_masked TEXT,  -- month/year only, NEVER full DOB
  status          TEXT NOT NULL DEFAULT 'clear'
                    CHECK (status IN ('clear', 'potential_match', 'confirmed_match', 'override')),
  match_score     INTEGER NOT NULL DEFAULT 0,
  matches_found   INTEGER NOT NULL DEFAULT 0,
  matches_detail  JSONB DEFAULT '[]'::jsonb,
  reference_id    TEXT NOT NULL,
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  override_reason TEXT,
  screened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ofac_screenings_dealer
  ON ofac_screenings(dealer_id, screened_at DESC);

CREATE INDEX IF NOT EXISTS idx_ofac_screenings_deal
  ON ofac_screenings(deal_id)
  WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ofac_screenings_status
  ON ofac_screenings(dealer_id, status);

-- Audit log for every action taken on a screening record
CREATE TABLE IF NOT EXISTS ofac_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id  UUID NOT NULL REFERENCES ofac_screenings(id),
  action        TEXT NOT NULL,
  user_name     TEXT NOT NULL,
  details       TEXT,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ofac_audit_log_screening
  ON ofac_audit_log(screening_id, timestamp ASC);
