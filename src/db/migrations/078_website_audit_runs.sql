-- Migration 078: website_audit_runs — public lead-magnet Website Audit submissions.
--
-- Second engagement-opener artifact for the Dealer Excellence Program
-- (per docs/dealer-excellence-program-2026-05-12.md). Mirrors the F&I
-- Audit pattern from migration 074. A prospect enters their dealer site
-- URL on the public landing page at `/audits/website`; we scan it with
-- Playwright + Lighthouse, score it against codified rules, generate a
-- 4-page PDF, and email it back. The row stays around as a warm lead
-- for the Wolfpack BDC to follow up on.
--
-- NOT TENANT-SCOPED. There is no `dealer_id` because the submitter is
-- not (yet) a Wolfpack Auto customer. RLS is therefore NOT applied to
-- this table. App-layer policy: only Wolfpack staff (operator-auth, see
-- operator-auth.ts) may read or list rows. The public POST endpoint
-- inserts only.
--
-- Status state machine:
--   pending -> scanning -> generating_report -> delivered -> demo_booked -> converted
--                                            \-> failed
--
-- Idempotent. Paired rollback at rollback/078_website_audit_runs.down.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS website_audit_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_name        text NOT NULL,
  website_url            text NOT NULL,
  contact_name           text NOT NULL,
  contact_email          text NOT NULL,
  contact_phone          text,
  contact_role           text,
  oem_affiliation        text,
  status                 text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','scanning','generating_report','delivered','failed','demo_booked','converted')),
  scan_started_at        timestamptz,
  scan_completed_at      timestamptz,
  pdf_storage_url        text,
  summary_metrics        jsonb,
  raw_findings           jsonb,
  failure_reason         text,
  requested_at           timestamptz DEFAULT now(),
  delivered_at           timestamptz,
  demo_booked_at         timestamptz,
  ip_address             inet,
  user_agent             text
);

CREATE INDEX IF NOT EXISTS website_audit_runs_status_idx
  ON website_audit_runs (status);

CREATE INDEX IF NOT EXISTS website_audit_runs_email_idx
  ON website_audit_runs (contact_email);

CREATE INDEX IF NOT EXISTS website_audit_runs_url_idx
  ON website_audit_runs (website_url);

CREATE INDEX IF NOT EXISTS website_audit_runs_requested_at_idx
  ON website_audit_runs (requested_at DESC);

-- No RLS: this is pre-customer lead intake with no dealer_id key.
-- Wolfpack staff only at the application layer
-- (see /api/admin/website-audit-runs).

COMMIT;
