-- Multi-location support: dealer groups with sub-locations
CREATE TABLE IF NOT EXISTS dealer_locations (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL REFERENCES dealers(id),
  name TEXT NOT NULL,
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  phone TEXT,
  email TEXT,
  is_primary BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dealer_locations_dealer ON dealer_locations(dealer_id);
-- Each vehicle can be at a specific location
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS location_id TEXT REFERENCES dealer_locations(id);
CREATE INDEX IF NOT EXISTS idx_vehicles_location ON vehicles(location_id);
