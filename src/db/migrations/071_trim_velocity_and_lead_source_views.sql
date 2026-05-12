-- Migration 071: Trim-velocity + Lead-source ROI analytics views
--
-- Two SELECT-only views power dealer-facing analytics:
--   1. v_trim_velocity     — per (dealer, make, model, trim, year) days-to-sell
--   2. v_lead_source_roi   — per (dealer, lead source) ROI: conversion, time-to-close, gross
--
-- Notes on schema fit (verified against migrations 001 + 021):
--  * `vehicles` uses `trim` (not trim_level), `dealer_id UUID`, and has
--    `created_at` + `days_on_lot` but NO `listed_at` column. We use
--    `created_at` as the listing timestamp baseline.
--  * `deal_worksheets` (the F&I deal table — the schema name "fi_deals" is
--    legacy; the table is `deal_worksheets`) uses `dealer_id TEXT`,
--    `lead_id TEXT`, `vehicle_vin TEXT`, `total_gross NUMERIC`, `funded_at`,
--    `status` (with 'funded' value).
--  * Cross-type dealer_id requires explicit CAST(... AS TEXT) on the join.
--  * `leads.source` is the canonical lead-source column (migration 001).
--  * `leads` has NO cost column — lib surfaces "cost not configured" for now.
--
-- Both views are read-only aggregates: no RLS needed on the view itself,
-- but every consuming query MUST filter by dealer_id in the WHERE clause.
-- The lib layer (src/lib/analytics-engine/*) enforces this — see those files.
--
-- Idempotent: CREATE OR REPLACE VIEW + CREATE INDEX IF NOT EXISTS, so
-- up + down + up round-trips clean.

-- ============================================================================
-- 1. v_trim_velocity — average days-on-lot grouped by make/model/trim/year
-- ============================================================================
CREATE OR REPLACE VIEW v_trim_velocity AS
SELECT
  v.dealer_id,
  v.make,
  v.model,
  v.trim,
  v.year,
  COUNT(DISTINCT v.id)::int                                    AS listed_count,
  COUNT(DISTINCT dw.id) FILTER (WHERE dw.status = 'funded')::int AS funded_count,
  -- Average days from listing creation to funding for funded deals only
  ROUND(
    AVG(
      EXTRACT(EPOCH FROM (dw.funded_at - v.created_at)) / 86400.0
    ) FILTER (WHERE dw.status = 'funded' AND dw.funded_at IS NOT NULL)::numeric,
    2
  ) AS avg_days_to_sell,
  -- Median days-to-sell — robust against outliers from one stale unit
  ROUND(
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (dw.funded_at - v.created_at)) / 86400.0
    ) FILTER (WHERE dw.status = 'funded' AND dw.funded_at IS NOT NULL)::numeric,
    2
  ) AS median_days_to_sell,
  -- Average gross profit per funded deal in this trim group
  ROUND(
    AVG(dw.total_gross) FILTER (WHERE dw.status = 'funded')::numeric,
    2
  ) AS avg_gross_profit,
  -- Average days-on-lot of currently-listed (unsold) units in this trim
  ROUND(
    AVG(v.days_on_lot) FILTER (WHERE v.status = 'available')::numeric,
    2
  ) AS avg_current_days_on_lot
FROM vehicles v
LEFT JOIN deal_worksheets dw
  ON dw.vehicle_vin = v.vin
 AND dw.dealer_id   = v.dealer_id::text
WHERE v.make IS NOT NULL
  AND v.model IS NOT NULL
GROUP BY v.dealer_id, v.make, v.model, v.trim, v.year;

COMMENT ON VIEW v_trim_velocity IS
  'Per-dealer trim-level velocity: average and median days-to-sell, avg gross profit, and avg days-on-lot for currently-listed units. Always filter by dealer_id in the consuming query.';

-- ============================================================================
-- 2. v_lead_source_roi — per-source conversion + ROI rollup
-- ============================================================================
CREATE OR REPLACE VIEW v_lead_source_roi AS
SELECT
  l.dealer_id,
  COALESCE(NULLIF(l.source, ''), 'unknown')                      AS source,
  COUNT(DISTINCT l.id)::int                                       AS total_leads,
  COUNT(DISTINCT dw.id) FILTER (WHERE dw.status = 'funded')::int  AS funded_deals,
  -- Conversion rate as a percentage (0-100) of total_leads → funded
  CASE
    WHEN COUNT(DISTINCT l.id) = 0 THEN 0
    ELSE ROUND(
      COUNT(DISTINCT dw.id) FILTER (WHERE dw.status = 'funded')::numeric
      / COUNT(DISTINCT l.id)::numeric * 100,
      2
    )
  END AS conversion_rate_pct,
  -- Total gross attributed to leads from this source
  COALESCE(
    ROUND(SUM(dw.total_gross) FILTER (WHERE dw.status = 'funded')::numeric, 2),
    0
  ) AS total_gross_profit,
  -- Gross profit per funded deal
  ROUND(
    AVG(dw.total_gross) FILTER (WHERE dw.status = 'funded')::numeric,
    2
  ) AS avg_gross_per_deal,
  -- Time-to-close in days: lead create → deal funding
  ROUND(
    AVG(
      EXTRACT(EPOCH FROM (dw.funded_at - l.created_at)) / 86400.0
    ) FILTER (WHERE dw.status = 'funded' AND dw.funded_at IS NOT NULL)::numeric,
    2
  ) AS avg_days_to_close
FROM leads l
LEFT JOIN deal_worksheets dw
  ON dw.lead_id   = l.id::text
 AND dw.dealer_id = l.dealer_id::text
GROUP BY l.dealer_id, COALESCE(NULLIF(l.source, ''), 'unknown');

COMMENT ON VIEW v_lead_source_roi IS
  'Per-dealer lead-source ROI: total leads, funded count, conversion %, gross profit, avg days-to-close. Cost-per-lead is NOT in this view because no cost column exists on leads; lib layer surfaces "cost not configured" until a future migration adds it.';

-- ============================================================================
-- Supporting indexes — speed up the joins these views drive
-- (idempotent; safe to re-run)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_vehicles_dealer_make_model_trim_year
  ON vehicles (dealer_id, make, model, trim, year);

CREATE INDEX IF NOT EXISTS idx_deal_worksheets_vehicle_vin
  ON deal_worksheets (vehicle_vin);

CREATE INDEX IF NOT EXISTS idx_deal_worksheets_lead_id
  ON deal_worksheets (lead_id);

CREATE INDEX IF NOT EXISTS idx_leads_dealer_source
  ON leads (dealer_id, source);
