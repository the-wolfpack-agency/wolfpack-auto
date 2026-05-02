-- Rollback for migration 058: Connected-Vehicle Telemetry Intake.
-- Drop child tables first; the parent (connected_vehicles) carries FK
-- references from vehicle_telemetry_events. CASCADE for safety.
-- Idempotent (IF EXISTS) so partial rollbacks don't error.

DROP TABLE IF EXISTS telemetry_ingestion_log CASCADE;
DROP TABLE IF EXISTS telemetry_provider_credentials CASCADE;
DROP TABLE IF EXISTS predictive_maintenance_leads CASCADE;
DROP TABLE IF EXISTS vehicle_telemetry_events CASCADE;
DROP TABLE IF EXISTS connected_vehicles CASCADE;
