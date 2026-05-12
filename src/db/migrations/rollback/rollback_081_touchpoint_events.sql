-- Legacy-naming rollback for migration 081 (touchpoint_events +
-- touchpoint_registrations). Mirrors 081_touchpoint_events.down.sql.

DROP TABLE IF EXISTS touchpoint_registrations CASCADE;
DROP TABLE IF EXISTS touchpoint_events CASCADE;
