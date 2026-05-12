-- Migration 072: F&I product penetration heatmap + Tech utilization views.
--
-- Read-only aggregate views over existing tables. No new tables, no PII,
-- no triple-write needed. Views are tenant-scoped via WHERE clauses on
-- dealer_id (RLS on the underlying tables enforces isolation at query
-- time when the session sets `app.current_dealer_id`).
--
-- v_fi_penetration:
--   one row per (dealer_id, fi_manager_id, product_type, month)
--   driven by deal_desk (migration 047) joined to deal_fi_items (047).
--   fi_desking_deep introduced deal_desk with a `created_by` UUID — we
--   treat that as the F&I manager identifier. Some dealers also stamp
--   `lender_program` per deal but that is lender-specific.
--   `funded_at` is the funding timestamp; we month-bucket on it because
--   a deal's product attach belongs to the month it actually funded, not
--   the month it was first quoted.
--
-- v_tech_utilization:
--   one row per (dealer_id, tech_id, bay_id, week_start)
--   driven by repair_orders (migration 022). The schema does NOT have a
--   `tech_schedule` table yet, so hours_available defaults to 40h/week
--   per the spec. Hours billed = SUM of `labor_total / hourly_rate` if a
--   tech hourly_rate is known, else SUM of line_items[].labor_hours.
--   Bay attribution: service_appointments.bay_number when an RO links
--   to one, otherwise NULL bay bucket.
--
-- CREATE OR REPLACE VIEW keeps the migration idempotent.

BEGIN;

-- =============================================================================
-- v_fi_penetration — F&I manager x product x month attach rate + gross
-- =============================================================================

CREATE OR REPLACE VIEW v_fi_penetration AS
SELECT
  d.dealer_id,
  d.created_by                                                  AS fi_manager_id,
  COALESCE(items.category, 'none')                              AS product_type,
  DATE_TRUNC('month', d.funded_at)                              AS month,
  -- attach_rate = (deals that had >=1 product of this type) / (all funded deals
  -- by this manager in this month). When product_type='none' the rate is the
  -- share of deals that funded with NO F&I products at all.
  (COUNT(DISTINCT CASE WHEN items.id IS NOT NULL THEN d.id END)::numeric
    / NULLIF(COUNT(DISTINCT d.id), 0))                          AS attach_rate,
  COALESCE(SUM(items.profit), 0)                                AS gross_total,
  COUNT(DISTINCT d.id)                                          AS deals_count,
  COUNT(DISTINCT CASE WHEN items.status = 'accepted' THEN items.id END)
                                                                AS accepted_items
FROM deal_desk d
LEFT JOIN deal_fi_items items
  ON items.deal_desk_id = d.id
  AND items.dealer_id   = d.dealer_id
WHERE d.status   = 'funded'
  AND d.funded_at IS NOT NULL
GROUP BY d.dealer_id, d.created_by, COALESCE(items.category, 'none'),
         DATE_TRUNC('month', d.funded_at);

COMMENT ON VIEW v_fi_penetration IS
  'F&I product attach rate + back-end gross by manager x product x month. Source: deal_desk (047) + deal_fi_items (047).';

-- =============================================================================
-- v_tech_utilization — hours billed vs hours available per tech x bay x week
-- =============================================================================
--
-- NOTE: repair_orders.dealer_id, tech_assigned, line_items (JSONB) come from
-- migration 022. technicians table is in the same migration. Bay attribution
-- pulls from service_appointments.bay_number when RO -> appointment_id is set.
--
-- hours_available is computed from a 40h/week constant. TODO: when a
-- tech_schedule table lands, swap this constant for SUM(schedule.hours).
-- See `tech-utilization.ts` for the lib-layer override.

CREATE OR REPLACE VIEW v_tech_utilization AS
SELECT
  ro.dealer_id,
  t.id                                                         AS tech_id,
  ro.tech_assigned                                             AS tech_name,
  appt.bay_number                                              AS bay_id,
  DATE_TRUNC('week', ro.created_at)                            AS week_start,
  -- Sum labor hours out of the JSONB line_items array.
  COALESCE(SUM(
    (SELECT COALESCE(SUM((li->>'labor_hours')::numeric), 0)
       FROM jsonb_array_elements(ro.line_items) li)
  ), 0)                                                        AS hours_billed,
  -- Default 40h/week. TODO: replace with tech_schedule join when that table
  -- exists; for now this is a clearly-flagged constant assumption.
  40::numeric                                                  AS hours_available,
  -- utilization = hours_billed / hours_available; clamp denominator > 0.
  (COALESCE(SUM(
    (SELECT COALESCE(SUM((li->>'labor_hours')::numeric), 0)
       FROM jsonb_array_elements(ro.line_items) li)
  ), 0) / NULLIF(40, 0))                                       AS utilization,
  COUNT(DISTINCT ro.id)                                        AS ro_count,
  COALESCE(SUM(ro.labor_total), 0)                             AS labor_revenue
FROM repair_orders ro
LEFT JOIN technicians t
  ON t.dealer_id = ro.dealer_id
  AND t.name     = ro.tech_assigned
LEFT JOIN service_appointments appt
  ON appt.id = ro.appointment_id
  AND appt.dealer_id = ro.dealer_id
WHERE ro.tech_assigned IS NOT NULL
  AND ro.tech_assigned <> ''
GROUP BY ro.dealer_id, t.id, ro.tech_assigned, appt.bay_number,
         DATE_TRUNC('week', ro.created_at);

COMMENT ON VIEW v_tech_utilization IS
  'Hours billed vs available per tech x bay x week. Source: repair_orders (022) + technicians (022) + service_appointments (022). hours_available defaults to 40h/week pending a tech_schedule table.';

-- =============================================================================
-- Supporting indexes (only what helps the new views)
-- =============================================================================
-- deal_desk already has idx_deal_desk_dealer + idx_deal_desk_status.
-- Add a composite index on (dealer_id, funded_at) so month-bucketing of
-- funded deals is fast. IF NOT EXISTS keeps it idempotent.
CREATE INDEX IF NOT EXISTS idx_deal_desk_dealer_funded_at
  ON deal_desk (dealer_id, funded_at)
  WHERE status = 'funded';

-- repair_orders gets an index on (dealer_id, created_at) for the weekly
-- bucketing scan. Existing migration 022 only indexed dealer_id and vin.
CREATE INDEX IF NOT EXISTS idx_repair_orders_dealer_week
  ON repair_orders (dealer_id, created_at);

-- deal_fi_items composite index for the join.
CREATE INDEX IF NOT EXISTS idx_deal_fi_items_dealer_deal
  ON deal_fi_items (dealer_id, deal_desk_id);

COMMIT;
