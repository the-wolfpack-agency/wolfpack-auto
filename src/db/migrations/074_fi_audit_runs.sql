-- Migration 074: fi_audit_runs — public lead-magnet F&I penetration audit submissions.
--
-- This table captures PRE-CUSTOMER lead intake from the public landing page at
-- `/audits/fi-penetration`. A prospect uploads their DMS deal CSV (or proxy
-- thereof), we run our F&I penetration analytics (migration 072 / Stream D),
-- produce a 4-page PDF, email it back, and the row stays around as a warm
-- lead for the Wolfpack BDC to follow up on.
--
-- NOT TENANT-SCOPED. There is no `dealer_id` because the submitter is not
-- (yet) a Wolfpack Auto customer. RLS is therefore NOT applied to this table.
-- App-layer policy: only Wolfpack staff (operator-auth, see operator-auth.ts)
-- may read or list rows. The public POST endpoint inserts only.
--
-- Status state machine:
--   pending     -> processing -> delivered -> demo_booked -> converted
--                              \-> failed
--
-- Idempotent. Paired rollback at rollback/074_fi_audit_runs.down.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS fi_audit_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_name       text NOT NULL,
  contact_name          text NOT NULL,
  contact_email         text NOT NULL,
  contact_phone         text,
  contact_role          text,
  rooftops_count        int DEFAULT 1,
  source_csv_storage_url text,
  source_csv_row_count  int,
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','delivered','failed','demo_booked','converted')),
  pdf_storage_url       text,
  summary_metrics       jsonb,
  failure_reason        text,
  requested_at          timestamptz DEFAULT now(),
  delivered_at          timestamptz,
  demo_booked_at        timestamptz,
  converted_at          timestamptz,
  ip_address            inet,
  user_agent            text
);

CREATE INDEX IF NOT EXISTS fi_audit_runs_status_idx
  ON fi_audit_runs (status);

CREATE INDEX IF NOT EXISTS fi_audit_runs_requested_at_idx
  ON fi_audit_runs (requested_at DESC);

CREATE INDEX IF NOT EXISTS fi_audit_runs_email_idx
  ON fi_audit_runs (contact_email);

-- No RLS: this is pre-customer lead intake with no dealer_id key.
-- Wolfpack staff only at the application layer (see /api/admin/fi-audit-runs).

COMMIT;
