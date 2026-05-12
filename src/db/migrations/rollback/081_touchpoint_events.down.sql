-- Down migration for 081_touchpoint_events (runner-facing variant).
-- Mirrors rollback_081_touchpoint_events.sql so both naming conventions
-- in src/db/migrations/rollback/ resolve.

DROP TABLE IF EXISTS touchpoint_registrations CASCADE;
DROP TABLE IF EXISTS touchpoint_events CASCADE;
