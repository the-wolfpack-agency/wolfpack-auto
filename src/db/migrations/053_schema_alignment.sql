-- Migration 053: Align schemas with lib module INSERT statements
--
-- Fixes two critical mismatches found during data pipeline audit:
--   1. campaign_enrollments missing email + next_email_due_at columns
--   2. walkaround_segments segment_type enum doesn't match code constants

-- ============================================================================
-- 1. campaign_enrollments — add missing columns
-- ============================================================================

ALTER TABLE campaign_enrollments ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE campaign_enrollments ADD COLUMN IF NOT EXISTS next_email_due_at TIMESTAMPTZ;

-- ============================================================================
-- 2. walkaround_segments — expand segment_type CHECK to include code values
--    Code uses: exterior_left, exterior_right, features
--    Schema had: exterior_driver, exterior_passenger, undercarriage
--    Fix: drop old constraint, add new one accepting ALL values (both naming schemes)
-- ============================================================================

ALTER TABLE walkaround_segments DROP CONSTRAINT IF EXISTS walkaround_segments_segment_type_check;

ALTER TABLE walkaround_segments ADD CONSTRAINT walkaround_segments_segment_type_check
  CHECK (segment_type IN (
    'exterior_front', 'exterior_rear',
    'exterior_left', 'exterior_right',
    'exterior_driver', 'exterior_passenger',
    'interior', 'trunk', 'engine',
    'features', 'undercarriage'
  ));
