-- Migration 054: Learning views for 5 novel micro-behavioral signals
--
-- These views aggregate computed signals from analytics_events so the
-- propensity model and analytics brain can consume them directly.
-- Each signal is persisted as an analytics event by the scoring engine,
-- then materialized here for efficient querying.

-- ============================================================================
-- 1. Photo Comparison Preferences — which vehicles buyers prefer in A/B
-- ============================================================================
CREATE OR REPLACE VIEW v_photo_comparison_preferences AS
SELECT
  page AS dealer_id,
  metadata->>'customer_id' AS customer_id,
  metadata->>'preferred_vin' AS preferred_vin,
  (metadata->>'strength')::numeric AS preference_strength,
  (metadata->>'comparisons')::int AS comparison_count,
  timestamp AS detected_at
FROM analytics_events
WHERE action = 'photo_compare.preference_detected'
  AND timestamp > NOW() - INTERVAL '30 days';

-- ============================================================================
-- 2. Price Sensitivity Fingerprints — budget ceilings per customer
-- ============================================================================
CREATE OR REPLACE VIEW v_price_sensitivity AS
SELECT
  page AS dealer_id,
  metadata->>'customer_id' AS customer_id,
  metadata->>'vin' AS vin,
  (metadata->>'ceiling')::numeric AS monthly_payment_ceiling,
  metadata->>'tier' AS sensitivity_tier,
  (metadata->>'bounced')::boolean AS sticker_shock_bounce,
  timestamp AS fingerprinted_at
FROM analytics_events
WHERE action = 'price_sensitivity.budget_fingerprint'
  AND timestamp > NOW() - INTERVAL '30 days';

-- ============================================================================
-- 3. Decision Velocity — how fast each buyer moves toward purchase
-- ============================================================================
CREATE OR REPLACE VIEW v_decision_velocity AS
SELECT
  page AS dealer_id,
  metadata->>'customer_id' AS customer_id,
  metadata->>'vin' AS vin,
  metadata->>'classification' AS velocity_class,
  (metadata->>'urgency')::int AS urgency_score,
  (metadata->>'hours')::numeric AS velocity_hours,
  timestamp AS classified_at
FROM analytics_events
WHERE action = 'decision_velocity.velocity_classified'
  AND timestamp > NOW() - INTERVAL '30 days';

-- ============================================================================
-- 4. Device Handoff Intent — cross-device browsing signals
-- ============================================================================
CREATE OR REPLACE VIEW v_device_handoff AS
SELECT
  page AS dealer_id,
  metadata->>'customer_id' AS customer_id,
  metadata->>'direction' AS handoff_direction,
  (metadata->>'shared_vins')::int AS shared_vin_count,
  (metadata->>'escalation')::int AS escalation_score,
  (metadata->>'intent')::boolean AS intent_escalation,
  timestamp AS detected_at
FROM analytics_events
WHERE action = 'device_handoff.intent_escalation'
  AND timestamp > NOW() - INTERVAL '30 days';

-- ============================================================================
-- 5. Night Owl Patterns — time-of-day purchase intent multipliers
-- ============================================================================
CREATE OR REPLACE VIEW v_night_owl_patterns AS
SELECT
  page AS dealer_id,
  metadata->>'customer_id' AS customer_id,
  metadata->>'segment' AS time_segment,
  (metadata->>'multiplier')::numeric AS intent_multiplier,
  (metadata->>'depth')::numeric AS engagement_depth,
  timestamp AS classified_at
FROM analytics_events
WHERE action = 'night_owl.time_segment_classified'
  AND timestamp > NOW() - INTERVAL '30 days';

-- ============================================================================
-- 6. Combined micro-signal propensity boost — aggregates all 5 signals
--    per customer into a single score modifier for the propensity model
-- ============================================================================
CREATE OR REPLACE VIEW v_micro_signal_propensity AS
SELECT
  customer_id,
  dealer_id,
  -- Price sensitivity: high sensitivity = lower score, low = higher
  COALESCE(MAX(CASE WHEN signal = 'price' THEN
    CASE tier WHEN 'low' THEN 10 WHEN 'medium' THEN 0 WHEN 'high' THEN -10 END
  END), 0) AS price_modifier,
  -- Decision velocity: impulse/fast = boost, comparison = slight negative
  COALESCE(MAX(CASE WHEN signal = 'velocity' THEN urgency END), 0) AS velocity_score,
  -- Device handoff: escalation = strong positive
  COALESCE(MAX(CASE WHEN signal = 'handoff' THEN escalation END), 0) AS handoff_boost,
  -- Night owl: multiplier applied to base score
  COALESCE(MAX(CASE WHEN signal = 'nightowl' THEN multiplier END), 1.0) AS time_multiplier,
  -- Photo comparison: having a preference = engaged
  COALESCE(MAX(CASE WHEN signal = 'photo' THEN strength * 20 END), 0) AS preference_boost,
  -- Combined modifier: sum of all individual modifiers
  COALESCE(MAX(CASE WHEN signal = 'price' THEN
    CASE tier WHEN 'low' THEN 10 WHEN 'medium' THEN 0 WHEN 'high' THEN -10 END
  END), 0)
  + COALESCE(MAX(CASE WHEN signal = 'velocity' THEN urgency / 5 END), 0)
  + COALESCE(MAX(CASE WHEN signal = 'handoff' THEN escalation / 5 END), 0)
  + COALESCE(MAX(CASE WHEN signal = 'photo' THEN strength * 20 END), 0)
  AS total_modifier
FROM (
  -- Price sensitivity
  SELECT page AS dealer_id, metadata->>'customer_id' AS customer_id,
    'price' AS signal, metadata->>'tier' AS tier, NULL::int AS urgency,
    NULL::int AS escalation, NULL::numeric AS multiplier, NULL::numeric AS strength
  FROM analytics_events WHERE action = 'price_sensitivity.budget_fingerprint'
    AND timestamp > NOW() - INTERVAL '30 days'
  UNION ALL
  -- Decision velocity
  SELECT page, metadata->>'customer_id', 'velocity', NULL,
    (metadata->>'urgency')::int, NULL, NULL, NULL
  FROM analytics_events WHERE action = 'decision_velocity.velocity_classified'
    AND timestamp > NOW() - INTERVAL '30 days'
  UNION ALL
  -- Device handoff
  SELECT page, metadata->>'customer_id', 'handoff', NULL, NULL,
    (metadata->>'escalation')::int, NULL, NULL
  FROM analytics_events WHERE action = 'device_handoff.intent_escalation'
    AND timestamp > NOW() - INTERVAL '30 days'
  UNION ALL
  -- Night owl
  SELECT page, metadata->>'customer_id', 'nightowl', NULL, NULL, NULL,
    (metadata->>'multiplier')::numeric, NULL
  FROM analytics_events WHERE action = 'night_owl.time_segment_classified'
    AND timestamp > NOW() - INTERVAL '30 days'
  UNION ALL
  -- Photo comparison
  SELECT page, metadata->>'customer_id', 'photo', NULL, NULL, NULL, NULL,
    (metadata->>'strength')::numeric
  FROM analytics_events WHERE action = 'photo_compare.preference_detected'
    AND timestamp > NOW() - INTERVAL '30 days'
) signals
GROUP BY customer_id, dealer_id;
