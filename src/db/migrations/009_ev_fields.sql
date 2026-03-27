-- EV Readiness Module: Add EV-specific fields to vehicles table
-- Migration 009 — 2026-03-27

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_ev BOOLEAN DEFAULT false;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ev_range_miles INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ev_battery_kwh NUMERIC(6,2);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ev_charge_time_l2_hours NUMERIC(4,1);
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ev_charge_time_dc_minutes INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ev_drivetrain TEXT CHECK (ev_drivetrain IN ('BEV', 'PHEV', 'FCEV', NULL));
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS federal_tax_credit_eligible BOOLEAN DEFAULT false;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS federal_tax_credit_amount NUMERIC(8,2) DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS msrp NUMERIC(10,2);
CREATE INDEX IF NOT EXISTS idx_vehicles_is_ev ON vehicles(is_ev) WHERE is_ev = true;
