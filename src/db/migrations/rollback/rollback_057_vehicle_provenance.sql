-- Rollback for migration 057: drop the cryptographically-signed vehicle
-- provenance tables. CASCADE so dependent indexes/policies/foreign keys
-- come down with each table. Idempotent (IF EXISTS) so partial rollbacks
-- don't error.
--
-- Order matters: attestations references events; anchors references
-- events. Drop dependents first.

DROP TABLE IF EXISTS vehicle_provenance_attestations CASCADE;
DROP TABLE IF EXISTS vehicle_provenance_anchors      CASCADE;
DROP TABLE IF EXISTS vehicle_provenance_events       CASCADE;
