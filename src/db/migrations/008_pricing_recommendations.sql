-- Migration 008: Pricing Recommendations
-- Stores generated pricing recommendations per vehicle so the admin UI can
-- track which have been applied or dismissed.

CREATE TABLE IF NOT EXISTS pricing_recommendations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id     UUID        NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  vehicle_id    UUID        NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  current_price NUMERIC(10,2) NOT NULL,
  recommended_price NUMERIC(10,2) NOT NULL,
  action        TEXT        NOT NULL,
  urgency       TEXT        NOT NULL,
  reason        TEXT        NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at    TIMESTAMPTZ,
  dismissed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pricing_recs_dealer_id
  ON pricing_recommendations(dealer_id);

CREATE INDEX IF NOT EXISTS idx_pricing_recs_vehicle_id
  ON pricing_recommendations(vehicle_id);

CREATE INDEX IF NOT EXISTS idx_pricing_recs_generated
  ON pricing_recommendations(generated_at DESC);
