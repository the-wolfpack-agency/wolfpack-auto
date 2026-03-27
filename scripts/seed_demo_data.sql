-- seed_demo_data.sql
-- Inserts a complete demo dealer (Wolfpack Motors) with vehicles and leads.
-- Safe to run multiple times: all inserts use ON CONFLICT DO NOTHING.
--
-- Demo dealer ID: 00000000-0000-4000-a000-000000000001
-- Subdomain:      wolfpack-motors.wolfpackauto.com
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/seed_demo_data.sql

-- =============================================================================
-- Dealer record
-- =============================================================================

INSERT INTO dealers (
  id,
  name,
  slug,
  subdomain,
  phone,
  email,
  address,
  branding,
  has_service_center,
  has_financing,
  has_trade_in,
  is_active,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-4000-a000-000000000001',
  'Wolfpack Motors',
  'wolfpack-motors',
  'wolfpack-motors',
  '(303) 555-1234',
  'hello@wolfpackmotors.com',
  '{
    "street": "1234 Auto Drive",
    "city":   "Denver",
    "state":  "CO",
    "zip":    "80202"
  }'::jsonb,
  '{
    "tagline":         "Find Your Perfect Vehicle",
    "primary_color":   "#0070c7",
    "secondary_color": "#0c8de9",
    "accent_color":    "#f97316",
    "logo_url":        null,
    "business_hours": {
      "Monday - Friday": "9:00 AM - 8:00 PM",
      "Saturday":        "9:00 AM - 6:00 PM",
      "Sunday":          "10:00 AM - 5:00 PM"
    }
  }'::jsonb,
  true,   -- has_service_center
  true,   -- has_financing
  true,   -- has_trade_in
  true,   -- is_active
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- Vehicles (5 realistic listings — Denver, CO pricing)
-- =============================================================================

-- 1. Toyota Camry — bestseller, certified pre-owned
INSERT INTO vehicles (
  id, dealer_id,
  vin, stock_number,
  year, make, model, trim,
  body_style, exterior_color, interior_color,
  engine, transmission, drivetrain, fuel_type,
  mpg_city, mpg_highway,
  msrp, price, internet_price,
  condition, mileage, status, days_on_lot,
  description, features,
  is_featured, arrival_status
) VALUES (
  '00000000-0000-4000-b000-000000000001',
  '00000000-0000-4000-a000-000000000001',
  '4T1B11HK5JU100001', 'W-2024-001',
  2024, 'Toyota', 'Camry', 'XSE V6',
  'Sedan', 'Midnight Black Metallic', 'Black',
  '3.5L V6 301hp', 'automatic', 'fwd', 'gasoline',
  22, 33,
  32450.00, 30995.00, 29988.00,
  'new', 0, 'available', 4,
  'Brand new 2024 Toyota Camry XSE V6. Sporty styling meets V6 performance. Features sport-tuned suspension, 19" alloy wheels, and the latest Toyota Safety Sense 3.0.',
  '["Toyota Safety Sense 3.0", "Apple CarPlay", "Android Auto", "Wireless Charging", "Sport-Tuned Suspension", "19-Inch Alloy Wheels", "Dual-Zone Climate Control", "JBL Premium Audio", "Blind Spot Monitor", "Rear Cross-Traffic Alert"]'::jsonb,
  true, 'in_stock'
)
ON CONFLICT (dealer_id, vin) DO NOTHING;

-- 2. Ford F-150 — best-selling truck, used
INSERT INTO vehicles (
  id, dealer_id,
  vin, stock_number,
  year, make, model, trim,
  body_style, exterior_color, interior_color,
  engine, transmission, drivetrain, fuel_type,
  mpg_city, mpg_highway,
  msrp, price, internet_price,
  condition, mileage, status, days_on_lot,
  description, features,
  is_featured, arrival_status
) VALUES (
  '00000000-0000-4000-b000-000000000002',
  '00000000-0000-4000-a000-000000000001',
  '1FTFW1ET5EKE10002', 'W-2022-002',
  2022, 'Ford', 'F-150', 'Lariat',
  'Truck', 'Agate Black', 'Medium Dark Slate',
  '3.5L EcoBoost V6 400hp', 'automatic', '4wd', 'gasoline',
  17, 23,
  56900.00, 48750.00, 47500.00,
  'used', 31200, 'available', 18,
  'One-owner 2022 Ford F-150 Lariat 4x4 with 3.5L EcoBoost. Loaded with Lariat content including leather seats, power running boards, and SYNC 4A with 12" touchscreen. Clean CARFAX.',
  '["3.5L EcoBoost V6", "4x4 Four-Wheel Drive", "SYNC 4A", "12-Inch Touchscreen", "FordPass Connect", "Heated & Cooled Front Seats", "Power Running Boards", "Trailer Tow Package", "360-Degree Camera", "B&O Sound System"]'::jsonb,
  true, 'in_stock'
)
ON CONFLICT (dealer_id, vin) DO NOTHING;

-- 3. Honda CR-V — compact SUV, hybrid, CPO
INSERT INTO vehicles (
  id, dealer_id,
  vin, stock_number,
  year, make, model, trim,
  body_style, exterior_color, interior_color,
  engine, transmission, drivetrain, fuel_type,
  mpg_city, mpg_highway,
  msrp, price, internet_price,
  condition, mileage, status, days_on_lot,
  description, features,
  is_featured, arrival_status
) VALUES (
  '00000000-0000-4000-b000-000000000003',
  '00000000-0000-4000-a000-000000000001',
  '5J6RW2H8XNA100003', 'W-2022-003',
  2022, 'Honda', 'CR-V', 'EX-L Hybrid',
  'SUV', 'Sonic Gray Pearl', 'Black',
  '2.0L i-MMD Hybrid 212hp', 'eCVT', 'awd', 'hybrid',
  40, 35,
  38350.00, 34500.00, 33750.00,
  'used', 22800, 'available', 11,
  'Certified Pre-Owned 2022 Honda CR-V EX-L Hybrid AWD. Exceptional fuel economy with all-weather capability. Honda Sensing suite, leather interior, and panoramic moonroof. Honda CPO warranty included.',
  '["Honda Sensing Safety Suite", "Honda Certified Pre-Owned", "Panoramic Moonroof", "Leather-Trimmed Seats", "Heated Front Seats", "Apple CarPlay / Android Auto", "AWD Real Time 4WD", "Power Liftgate", "Remote Engine Start", "12-Month / 12,000-Mile Powertrain Warranty Extension"]'::jsonb,
  false, 'in_stock'
)
ON CONFLICT (dealer_id, vin) DO NOTHING;

-- 4. BMW 3 Series — luxury sedan, pre-owned
INSERT INTO vehicles (
  id, dealer_id,
  vin, stock_number,
  year, make, model, trim,
  body_style, exterior_color, interior_color,
  engine, transmission, drivetrain, fuel_type,
  mpg_city, mpg_highway,
  msrp, price, internet_price,
  condition, mileage, status, days_on_lot,
  description, features,
  is_featured, arrival_status
) VALUES (
  '00000000-0000-4000-b000-000000000004',
  '00000000-0000-4000-a000-000000000001',
  'WBA5R7C59ND100004', 'W-2022-004',
  2022, 'BMW', '3 Series', '330i xDrive',
  'Sedan', 'Alpine White', 'Black w/ SensaTec',
  '2.0L TwinPower Turbo I4 255hp', 'automatic', 'awd', 'gasoline',
  26, 36,
  46595.00, 41800.00, 40995.00,
  'used', 19450, 'available', 7,
  '2022 BMW 330i xDrive — the benchmark sport sedan. Features M Sport Package, Harman Kardon sound system, and BMW''s latest iDrive 7 infotainment. One owner, no accidents on CARFAX.',
  '["M Sport Package", "xDrive All-Wheel Drive", "Harman Kardon Sound System", "iDrive 7 with 10.25-Inch Display", "Wireless Apple CarPlay", "Heated Front Seats", "Parking Assistant", "Driving Assistance Package", "19-Inch M Sport Wheels", "Adaptive M Suspension"]'::jsonb,
  false, 'in_stock'
)
ON CONFLICT (dealer_id, vin) DO NOTHING;

-- 5. Tesla Model 3 — EV, in transit (pre-arrival)
INSERT INTO vehicles (
  id, dealer_id,
  vin, stock_number,
  year, make, model, trim,
  body_style, exterior_color, interior_color,
  engine, transmission, drivetrain, fuel_type,
  mpg_city, mpg_highway,
  msrp, price, internet_price,
  condition, mileage, status, days_on_lot,
  description, features,
  is_featured, arrival_status, expected_arrival_date
) VALUES (
  '00000000-0000-4000-b000-000000000005',
  '00000000-0000-4000-a000-000000000001',
  '5YJ3E1EA4PF100005', 'W-2023-005',
  2023, 'Tesla', 'Model 3', 'Long Range AWD',
  'Sedan', 'Pearl White Multi-Coat', 'Black',
  'Dual Electric Motors 358hp', 'single-speed', 'awd', 'electric',
  134, 126,   -- MPGe city/highway
  52990.00, 47500.00, 46800.00,
  'used', 8100, 'available', 0,
  '2023 Tesla Model 3 Long Range AWD. 358 miles of EPA-estimated range. Over-the-air software updates, Autopilot, and Tesla''s minimalist glass interior. Arrives April 2, 2026.',
  '["Autopilot", "358-Mile EPA Range", "Dual Motor AWD", "15-Inch Touchscreen", "Over-The-Air Updates", "Premium Audio", "Heated Seats Front & Rear", "Supercharger Network Access", "Sentry Mode", "Mobile App Remote Control"]'::jsonb,
  true, 'in_transit', '2026-04-02'
)
ON CONFLICT (dealer_id, vin) DO NOTHING;

-- =============================================================================
-- Sample leads
-- =============================================================================

-- Lead 1: Interested in the F-150, new inquiry
INSERT INTO leads (
  id, dealer_id, vehicle_id,
  first_name, last_name, email, phone,
  vehicle_interest, source, status, notes,
  lead_score
) VALUES (
  '00000000-0000-4000-c000-000000000001',
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-b000-000000000002',   -- F-150
  'Marcus', 'Rodriguez',
  'marcus.rodriguez@email.com', '(303) 555-8821',
  '2022 Ford F-150 Lariat 4x4',
  'website_form', 'new',
  'Customer asked about towing capacity and whether 4x4 package includes transfer case skid plates.',
  72
)
ON CONFLICT (id) DO NOTHING;

-- Lead 2: Test drive scheduled for Camry, in progress
INSERT INTO leads (
  id, dealer_id, vehicle_id,
  first_name, last_name, email, phone,
  vehicle_interest, source, status, notes,
  lead_score, first_response_at
) VALUES (
  '00000000-0000-4000-c000-000000000002',
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-b000-000000000001',   -- Camry
  'Priya', 'Sharma',
  'priya.sharma@gmail.com', '(720) 555-3392',
  '2024 Toyota Camry XSE V6',
  'third_party', 'contacted',
  'Test drive scheduled for Saturday 10am. Customer is comparing against Honda Accord Sport. Pre-approved for financing up to $35K.',
  88,
  now() - interval '2 hours'
)
ON CONFLICT (id) DO NOTHING;

-- Lead 3: Tesla inquiry — signed, awaiting delivery
INSERT INTO leads (
  id, dealer_id, vehicle_id,
  first_name, last_name, email, phone,
  vehicle_interest, source, status, notes,
  lead_score, first_response_at, converted_at, deal_value
) VALUES (
  '00000000-0000-4000-c000-000000000003',
  '00000000-0000-4000-a000-000000000001',
  '00000000-0000-4000-b000-000000000005',   -- Tesla Model 3
  'Jordan', 'Kim',
  'jordan.kim@techcorp.io', '(303) 555-6644',
  '2023 Tesla Model 3 Long Range AWD',
  'referral', 'won',
  'Deposit taken. Customer sold on range and Supercharger network. Waiting for vehicle to arrive from transit. Delivery scheduled April 3.',
  95,
  now() - interval '3 days',
  now() - interval '1 day',
  46800.00
)
ON CONFLICT (id) DO NOTHING;
