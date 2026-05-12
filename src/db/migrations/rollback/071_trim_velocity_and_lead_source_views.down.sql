-- Rollback for migration 071: drop the analytics views.
-- Indexes are kept (they accelerate other queries too) — drop them only
-- if explicitly needed. Views first so any downstream references unwind.

DROP VIEW IF EXISTS v_lead_source_roi CASCADE;
DROP VIEW IF EXISTS v_trim_velocity   CASCADE;
