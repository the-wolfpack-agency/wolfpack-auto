#!/usr/bin/env npx tsx
/**
 * Test Dealer Seed Script
 *
 * Creates a complete "Apex Motors" test dealer with realistic data across
 * every module: inventory, leads, deals, service, reviews, comms, webhooks,
 * and analytics events.
 *
 * Usage:
 *   npx tsx scripts/seed-test-dealer.ts
 *
 * Requires DATABASE_URL in environment (reads .env.local automatically).
 */

import { randomUUID } from "crypto";
import { Client } from "pg";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Load .env.local if present
// ---------------------------------------------------------------------------

const envPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_DEALER_ID = "00000000-0000-4000-b000-000000000099";
const TEST_DEALER_SLUG = "apex-motors";

// ---------------------------------------------------------------------------
// Dealer definition
// ---------------------------------------------------------------------------

const DEALER = {
  id: TEST_DEALER_ID,
  name: "Apex Motors",
  slug: TEST_DEALER_SLUG,
  subdomain: TEST_DEALER_SLUG,
  phone: "(919) 555-0200",
  email: "sales@apexmotors.com",
  website_url: "https://apexmotors.com",
  address: {
    street: "8200 Capital Blvd",
    city: "Raleigh",
    state: "NC",
    zip: "27616",
  },
  sales_hours: [
    { day: "monday", open: "09:00", close: "20:00", closed: false },
    { day: "tuesday", open: "09:00", close: "20:00", closed: false },
    { day: "wednesday", open: "09:00", close: "20:00", closed: false },
    { day: "thursday", open: "09:00", close: "20:00", closed: false },
    { day: "friday", open: "09:00", close: "20:00", closed: false },
    { day: "saturday", open: "09:00", close: "18:00", closed: false },
    { day: "sunday", open: "12:00", close: "17:00", closed: false },
  ],
  service_hours: [
    { day: "monday", open: "07:30", close: "18:00", closed: false },
    { day: "tuesday", open: "07:30", close: "18:00", closed: false },
    { day: "wednesday", open: "07:30", close: "18:00", closed: false },
    { day: "thursday", open: "07:30", close: "18:00", closed: false },
    { day: "friday", open: "07:30", close: "18:00", closed: false },
    { day: "saturday", open: "08:00", close: "14:00", closed: false },
    { day: "sunday", open: "00:00", close: "00:00", closed: true },
  ],
  branding: {
    primary_color: "#1E40AF",
    secondary_color: "#F59E0B",
    accent_color: "#3B82F6",
    logo_url: null,
    font_family: "Inter",
  },
  has_service_center: true,
  has_financing: true,
  has_trade_in: true,
};

// ---------------------------------------------------------------------------
// Vehicles (15)
// ---------------------------------------------------------------------------

const VEHICLES = [
  {
    vin: "1HGCV1F34TA100001", stock_number: "AX-001",
    year: 2025, make: "Toyota", model: "Camry", trim: "XSE",
    body_style: "Sedan", exterior_color: "Wind Chill Pearl", interior_color: "Black/Red",
    engine: "2.5L I4 Hybrid", transmission: "cvt", drivetrain: "fwd", fuel_type: "hybrid",
    mpg_city: 51, mpg_highway: 53, msrp: 32340, price: 31495, internet_price: 30999,
    condition: "new", mileage: 8, status: "available",
    description: "2025 Toyota Camry XSE Hybrid with sport-tuned suspension and JBL premium audio.",
    features: ["Toyota Safety Sense 3.0", "JBL Audio", "Wireless CarPlay", "Panoramic Roof", "Heated Seats"],
  },
  {
    vin: "2HKRW2H53TA200002", stock_number: "AX-002",
    year: 2025, make: "Honda", model: "CR-V", trim: "Sport Touring",
    body_style: "SUV", exterior_color: "Canyon River Blue", interior_color: "Black Leather",
    engine: "1.5L Turbo I4", transmission: "cvt", drivetrain: "awd", fuel_type: "gasoline",
    mpg_city: 28, mpg_highway: 34, msrp: 39845, price: 38990, internet_price: 38490,
    condition: "new", mileage: 15, status: "available",
    description: "Fully loaded 2025 CR-V Sport Touring with leather, moonroof, and AWD.",
    features: ["Honda Sensing", "Leather Seats", "Moonroof", "Wireless CarPlay", "Power Tailgate"],
  },
  {
    vin: "1FTEW1EP5TFA30003", stock_number: "AX-003",
    year: 2025, make: "Ford", model: "F-150", trim: "Lariat",
    body_style: "Truck", exterior_color: "Antimatter Blue", interior_color: "Black Onyx",
    engine: "3.5L EcoBoost V6", transmission: "automatic", drivetrain: "4wd", fuel_type: "gasoline",
    mpg_city: 18, mpg_highway: 24, msrp: 58865, price: 56990, internet_price: 55999,
    condition: "new", mileage: 22, status: "available",
    description: "2025 F-150 Lariat with Max Tow Package and 360-degree camera.",
    features: ["Co-Pilot360", "SYNC 4", "Max Tow Package", "360 Camera", "B&O Audio"],
  },
  {
    vin: "WBA53BJ09TCR40004", stock_number: "AX-004",
    year: 2025, make: "BMW", model: "330i", trim: "M Sport",
    body_style: "Sedan", exterior_color: "Portimao Blue", interior_color: "Oyster Vernasca",
    engine: "2.0L Turbo I4", transmission: "automatic", drivetrain: "rwd", fuel_type: "gasoline",
    mpg_city: 26, mpg_highway: 36, msrp: 48750, price: 47490, internet_price: 46995,
    condition: "new", mileage: 12, status: "available",
    description: "2025 BMW 330i M Sport with adaptive suspension and Live Cockpit Professional.",
    features: ["M Sport Package", "Adaptive Suspension", "Live Cockpit Pro", "Harman Kardon", "Parking Assistant Plus"],
  },
  {
    vin: "5YJ3E1EA5TF500005", stock_number: "AX-005",
    year: 2025, make: "Tesla", model: "Model Y", trim: "Long Range AWD",
    body_style: "SUV", exterior_color: "Ultra White", interior_color: "White",
    engine: "Dual Motor Electric", transmission: "automatic", drivetrain: "awd", fuel_type: "electric",
    mpg_city: null, mpg_highway: null, msrp: 49990, price: 49490, internet_price: 48990,
    condition: "new", mileage: 5, status: "available",
    description: "2025 Model Y Long Range with 310-mile range and Enhanced Autopilot.",
    features: ["Enhanced Autopilot", "Glass Roof", "15\" Touchscreen", "Premium Audio", "Heated All Seats"],
  },
  {
    vin: "3GNKBBRS9TS600006", stock_number: "AX-006",
    year: 2024, make: "Chevrolet", model: "Equinox EV", trim: "2RS",
    body_style: "SUV", exterior_color: "Radiant Red", interior_color: "Jet Black",
    engine: "Single Motor Electric", transmission: "automatic", drivetrain: "fwd", fuel_type: "electric",
    mpg_city: null, mpg_highway: null, msrp: 39900, price: 37990, internet_price: 37490,
    condition: "new", mileage: 18, status: "available",
    description: "All-new 2024 Equinox EV with 319-mile range and GM Ultium platform.",
    features: ["Super Cruise", "17.7\" Touchscreen", "Ultium Platform", "One Pedal Driving", "Wireless Charging"],
  },
  {
    vin: "5NMS3DAJ8TH700007", stock_number: "AX-007",
    year: 2025, make: "Hyundai", model: "Tucson", trim: "Limited",
    body_style: "SUV", exterior_color: "Amazon Grey", interior_color: "Dark Grey",
    engine: "1.6L Turbo Hybrid I4", transmission: "automatic", drivetrain: "awd", fuel_type: "hybrid",
    mpg_city: 38, mpg_highway: 38, msrp: 40795, price: 39490, internet_price: 38995,
    condition: "new", mileage: 10, status: "available",
    description: "2025 Tucson Limited Hybrid with SmartSense and panoramic sunroof.",
    features: ["SmartSense Safety", "Panoramic Sunroof", "Bose Audio", "Blind Spot View Monitor", "Digital Key"],
  },
  {
    vin: "JTDKN3DU8T0800008", stock_number: "AX-008",
    year: 2023, make: "Toyota", model: "RAV4", trim: "XLE Premium",
    body_style: "SUV", exterior_color: "Blueprint", interior_color: "Light Gray",
    engine: "2.5L I4", transmission: "automatic", drivetrain: "awd", fuel_type: "gasoline",
    mpg_city: 27, mpg_highway: 35, msrp: 35585, price: 29990, internet_price: 29490,
    condition: "certified", mileage: 21400, status: "available",
    description: "Toyota Certified Pre-Owned 2023 RAV4 XLE Premium. One owner, accident-free.",
    features: ["Toyota Safety Sense 2.5", "Power Moonroof", "SofTex Seats", "Wireless CarPlay", "Dual-Zone Climate"],
  },
  {
    vin: "1G1YY22G6T5900009", stock_number: "AX-009",
    year: 2023, make: "Honda", model: "Civic", trim: "Sport",
    body_style: "Sedan", exterior_color: "Rallye Red", interior_color: "Black",
    engine: "2.0L I4", transmission: "cvt", drivetrain: "fwd", fuel_type: "gasoline",
    mpg_city: 31, mpg_highway: 40, msrp: 27600, price: 23990, internet_price: 23490,
    condition: "certified", mileage: 18700, status: "available",
    description: "Honda Certified 2023 Civic Sport. Sharp styling, excellent fuel economy.",
    features: ["Honda Sensing", "Apple CarPlay", "Sport Pedals", "18\" Alloys", "Active Noise Cancellation"],
  },
  {
    vin: "1FTEW1EP0TFA00010", stock_number: "AX-010",
    year: 2023, make: "Ford", model: "Bronco Sport", trim: "Outer Banks",
    body_style: "SUV", exterior_color: "Area 51 Blue", interior_color: "Navy Pier",
    engine: "2.0L EcoBoost I4", transmission: "automatic", drivetrain: "4wd", fuel_type: "gasoline",
    mpg_city: 25, mpg_highway: 28, msrp: 38465, price: 31990, internet_price: 31490,
    condition: "used", mileage: 27800, status: "available",
    description: "2023 Bronco Sport Outer Banks with leather and SYNC 3. Adventure-ready.",
    features: ["SYNC 3", "Leather Seats", "Terrain Management System", "Roof Rails", "B&O Audio"],
  },
  {
    vin: "5UXCR6C05T9000011", stock_number: "AX-011",
    year: 2024, make: "BMW", model: "X5", trim: "xDrive40i",
    body_style: "SUV", exterior_color: "Alpine White", interior_color: "Cognac Vernasca",
    engine: "3.0L Turbo I6", transmission: "automatic", drivetrain: "awd", fuel_type: "gasoline",
    mpg_city: 21, mpg_highway: 27, msrp: 67900, price: 65490, internet_price: 64995,
    condition: "new", mileage: 30, status: "available",
    description: "Luxury 2024 BMW X5 xDrive40i with Executive Package and 3rd row.",
    features: ["Executive Package", "Panoramic Sunroof", "Harman Kardon", "Soft Close Doors", "Gesture Control"],
  },
  {
    vin: "2T1BURHE0TC000012", stock_number: "AX-012",
    year: 2022, make: "Toyota", model: "Corolla", trim: "SE",
    body_style: "Sedan", exterior_color: "Classic Silver", interior_color: "Black",
    engine: "2.0L I4", transmission: "cvt", drivetrain: "fwd", fuel_type: "gasoline",
    mpg_city: 31, mpg_highway: 40, msrp: 24525, price: 19490, internet_price: 18995,
    condition: "used", mileage: 38200, status: "available",
    description: "Reliable 2022 Corolla SE. Sport-tuned suspension, great commuter car.",
    features: ["Toyota Safety Sense 2.0", "Apple CarPlay", "Sport Suspension", "LED Headlights"],
  },
  {
    vin: "1N4BL4CV0TC000013", stock_number: "AX-013",
    year: 2024, make: "Chevrolet", model: "Silverado 1500", trim: "RST",
    body_style: "Truck", exterior_color: "Black", interior_color: "Jet Black",
    engine: "5.3L V8", transmission: "automatic", drivetrain: "4wd", fuel_type: "gasoline",
    mpg_city: 16, mpg_highway: 22, msrp: 54400, price: 51990, internet_price: 50995,
    condition: "new", mileage: 35, status: "pending",
    description: "2024 Silverado RST with Z71 Off-Road and Technology Package.",
    features: ["Z71 Off-Road", "13.4\" Touchscreen", "Multi-Flex Tailgate", "Bose Audio", "Trailer Camera"],
  },
  {
    vin: "KNAE35L19T5000014", stock_number: "AX-014",
    year: 2024, make: "Hyundai", model: "Ioniq 5", trim: "SEL",
    body_style: "SUV", exterior_color: "Lucid Blue", interior_color: "Dark Pebble Grey",
    engine: "Dual Motor Electric", transmission: "automatic", drivetrain: "awd", fuel_type: "electric",
    mpg_city: null, mpg_highway: null, msrp: 49350, price: 46990, internet_price: 46490,
    condition: "new", mileage: 7, status: "available",
    description: "Ultra-fast charging Ioniq 5 SEL. 10-80% in 18 minutes on 800V.",
    features: ["800V Architecture", "V2L Capability", "Bose Audio", "Digital Side Mirrors", "Remote Smart Park"],
  },
  {
    vin: "3MW5R1J00T8000015", stock_number: "AX-015",
    year: 2023, make: "Ford", model: "Mustang Mach-E", trim: "Premium",
    body_style: "SUV", exterior_color: "Grabber Blue", interior_color: "Space Gray",
    engine: "Extended Range Electric", transmission: "automatic", drivetrain: "awd", fuel_type: "electric",
    mpg_city: null, mpg_highway: null, msrp: 55475, price: 42990, internet_price: 42490,
    condition: "used", mileage: 14200, status: "sold",
    description: "2023 Mach-E Premium AWD with extended range battery. 312-mile range.",
    features: ["BlueCruise", "B&O Audio", "Glass Roof", "15.5\" Touchscreen", "Comfort Package"],
  },
];

// ---------------------------------------------------------------------------
// Leads (12)
// ---------------------------------------------------------------------------

const LEADS = [
  {
    first_name: "Amanda", last_name: "Richardson",
    email: "a.richardson@example.com", phone: "(919) 555-0301",
    vehicle_interest: "2025 Toyota Camry XSE Hybrid",
    source: "website_form", status: "new", temperature: "hot",
    assigned_to: null,
    notes: "Wants test drive ASAP. Trading in 2020 Camry LE.",
  },
  {
    first_name: "David", last_name: "Kim",
    email: "dkim@example.com", phone: "(919) 555-0302",
    vehicle_interest: "2025 Tesla Model Y Long Range",
    source: "website_form", status: "contacted", temperature: "hot",
    assigned_to: null,
    notes: "Called back. Pre-approved for $52K. Wants to see white exterior.",
  },
  {
    first_name: "Jessica", last_name: "Morales",
    email: "jmorales@example.com", phone: "(919) 555-0303",
    vehicle_interest: "Used SUV under $35,000",
    source: "phone", status: "qualified", temperature: "warm",
    assigned_to: null,
    notes: "Budget firm at $35K. Considering RAV4 and Bronco Sport.",
  },
  {
    first_name: "Brian", last_name: "O'Connor",
    email: "boconnor@example.com", phone: "(919) 555-0304",
    vehicle_interest: "2025 Ford F-150 Lariat",
    source: "walk_in", status: "appointment_set", temperature: "hot",
    assigned_to: null,
    notes: "Appointment Saturday 10 AM. Needs tow package. Has trade-in truck.",
  },
  {
    first_name: "Linda", last_name: "Washington",
    email: "lwashington@example.com", phone: "(919) 555-0305",
    vehicle_interest: "2025 BMW 330i M Sport",
    source: "website_form", status: "new", temperature: "warm",
    assigned_to: null,
    notes: "Requested pricing information and available colors.",
  },
  {
    first_name: "Michael", last_name: "Zhang",
    email: "mzhang@example.com", phone: null,
    vehicle_interest: "Electric vehicle with AWD",
    source: "third_party", status: "contacted", temperature: "warm",
    assigned_to: null,
    notes: "From Cars.com. Interested in Ioniq 5 and Model Y comparison.",
  },
  {
    first_name: "Patricia", last_name: "Nguyen",
    email: "pnguyen@example.com", phone: "(919) 555-0307",
    vehicle_interest: "2025 Honda CR-V Sport Touring",
    source: "website_form", status: "qualified", temperature: "hot",
    assigned_to: null,
    notes: "Pre-approved. Wants blue exterior. Ready to buy this week.",
  },
  {
    first_name: "James", last_name: "Carter",
    email: "jcarter@example.com", phone: "(919) 555-0308",
    vehicle_interest: "2024 BMW X5 xDrive40i",
    source: "phone", status: "appointment_set", temperature: "hot",
    assigned_to: null,
    notes: "Coming in Tuesday. Current lease ending. Wants to compare X5 vs GLE.",
  },
  {
    first_name: "Karen", last_name: "Brown",
    email: "kbrown@example.com", phone: "(919) 555-0309",
    vehicle_interest: "2022 Toyota Corolla SE",
    source: "website_form", status: "sold", temperature: "cold",
    assigned_to: null,
    notes: "Purchased Corolla SE. Financed at 4.9% for 60 months.",
  },
  {
    first_name: "Robert", last_name: "Jackson",
    email: "rjackson@example.com", phone: "(919) 555-0310",
    vehicle_interest: "Truck with 4WD capability",
    source: "walk_in", status: "lost", temperature: "cold",
    assigned_to: null,
    notes: "Visited lot but purchased from competitor. Price was $2K lower.",
  },
  {
    first_name: "Emily", last_name: "Davis",
    email: "edavis@example.com", phone: "(919) 555-0311",
    vehicle_interest: "2024 Chevrolet Equinox EV",
    source: "third_party", status: "new", temperature: "cool",
    assigned_to: null,
    notes: "From Edmunds. Asking about EV incentives and charging options.",
  },
  {
    first_name: "Thomas", last_name: "Martinez",
    email: "tmartinez@example.com", phone: "(919) 555-0312",
    vehicle_interest: "2025 Hyundai Tucson Limited Hybrid",
    source: "website_form", status: "contacted", temperature: "warm",
    assigned_to: null,
    notes: "Emailed back with pricing. Wants to compare with RAV4 Hybrid.",
  },
];

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL environment variable is required.");
    console.error("  Set it in .env.local or export it before running.");
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const counts: Record<string, number> = {};

  try {
    await client.query("BEGIN");

    // ---- Dealer -----------------------------------------------------------
    await client.query(
      `INSERT INTO dealers (
        id, name, slug, subdomain, phone, email, website_url,
        address, sales_hours, service_hours, branding,
        has_service_center, has_financing, has_trade_in
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        address = EXCLUDED.address,
        sales_hours = EXCLUDED.sales_hours,
        service_hours = EXCLUDED.service_hours,
        branding = EXCLUDED.branding,
        has_service_center = EXCLUDED.has_service_center,
        has_financing = EXCLUDED.has_financing,
        has_trade_in = EXCLUDED.has_trade_in,
        updated_at = NOW()`,
      [
        DEALER.id, DEALER.name, DEALER.slug, DEALER.subdomain,
        DEALER.phone, DEALER.email, DEALER.website_url,
        JSON.stringify(DEALER.address), JSON.stringify(DEALER.sales_hours),
        JSON.stringify(DEALER.service_hours), JSON.stringify(DEALER.branding),
        DEALER.has_service_center, DEALER.has_financing, DEALER.has_trade_in,
      ],
    );
    console.log(`[seed] Dealer "${DEALER.name}" upserted (${TEST_DEALER_ID}).`);

    // ---- Vehicles ---------------------------------------------------------
    const vehicleIds: string[] = [];
    for (const v of VEHICLES) {
      const result = await client.query(
        `INSERT INTO vehicles (
          id, dealer_id, vin, stock_number,
          year, make, model, trim, body_style, exterior_color, interior_color,
          engine, transmission, drivetrain, fuel_type, mpg_city, mpg_highway,
          msrp, price, internet_price,
          condition, mileage, status,
          description, features
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
        )
        ON CONFLICT (dealer_id, vin) DO UPDATE SET
          price = EXCLUDED.price,
          status = EXCLUDED.status,
          mileage = EXCLUDED.mileage,
          updated_at = NOW()
        RETURNING id`,
        [
          randomUUID(), TEST_DEALER_ID, v.vin, v.stock_number,
          v.year, v.make, v.model, v.trim, v.body_style, v.exterior_color, v.interior_color,
          v.engine, v.transmission, v.drivetrain, v.fuel_type, v.mpg_city, v.mpg_highway,
          v.msrp, v.price, v.internet_price,
          v.condition, v.mileage, v.status,
          v.description, JSON.stringify(v.features),
        ],
      );
      vehicleIds.push(result.rows[0].id);
    }
    counts.vehicles = VEHICLES.length;
    console.log(`[seed] ${VEHICLES.length} vehicles inserted.`);

    // ---- Leads ------------------------------------------------------------
    const leadIds: string[] = [];
    for (const l of LEADS) {
      const result = await client.query(
        `INSERT INTO leads (
          id, dealer_id, first_name, last_name, email, phone,
          vehicle_interest, source, status, temperature, assigned_to, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING id`,
        [
          randomUUID(), TEST_DEALER_ID,
          l.first_name, l.last_name, l.email, l.phone,
          l.vehicle_interest, l.source, l.status, l.temperature,
          l.assigned_to, l.notes,
        ],
      );
      leadIds.push(result.rows[0].id);
    }
    counts.leads = LEADS.length;
    console.log(`[seed] ${LEADS.length} leads inserted.`);

    // ---- Deal Worksheets (5) ----------------------------------------------
    const dealDefs = [
      {
        lead_idx: 8, vehicle_idx: 11, deal_type: "retail",
        selling_price: 19490, invoice_cost: 17200, trade_value: 8500, trade_payoff: 3200,
        down_payment: 3000, rebates: 500, term_months: 60, apr: 4.9,
        monthly_payment: 285.42, fi_products: [
          { name: "Extended Warranty", cost: 450, retail: 1295, term: 60 },
          { name: "GAP Coverage", cost: 200, retail: 695, term: 60 },
        ],
        fi_total: 1990, front_gross: 2290, back_gross: 1340, total_gross: 3630,
        status: "funded", salesperson: "Mike Torres", fi_manager: "Lisa Park",
      },
      {
        lead_idx: 3, vehicle_idx: 2, deal_type: "retail",
        selling_price: 56990, invoice_cost: 52100, trade_value: 22000, trade_payoff: 8500,
        down_payment: 5000, rebates: 1000, term_months: 72, apr: 5.49,
        monthly_payment: 498.33, fi_products: [
          { name: "Paint Protection Film", cost: 300, retail: 995, term: 0 },
          { name: "Extended Warranty", cost: 680, retail: 2495, term: 72 },
          { name: "Tire & Wheel", cost: 180, retail: 599, term: 60 },
        ],
        fi_total: 4089, front_gross: 4890, back_gross: 2429, total_gross: 7319,
        status: "presented", salesperson: "Mike Torres", fi_manager: "Lisa Park",
      },
      {
        lead_idx: 6, vehicle_idx: 1, deal_type: "retail",
        selling_price: 38990, invoice_cost: 35200, trade_value: 0, trade_payoff: 0,
        down_payment: 8000, rebates: 0, term_months: 60, apr: 3.99,
        monthly_payment: 572.15, fi_products: [
          { name: "Extended Warranty", cost: 520, retail: 1895, term: 60 },
        ],
        fi_total: 1895, front_gross: 3790, back_gross: 1375, total_gross: 5165,
        status: "accepted", salesperson: "Sarah Chen", fi_manager: "Lisa Park",
      },
      {
        lead_idx: 1, vehicle_idx: 4, deal_type: "lease",
        selling_price: 49490, invoice_cost: 46200, trade_value: 15000, trade_payoff: 0,
        down_payment: 3500, rebates: 0, term_months: 36, apr: null,
        monthly_payment: 489.00, residual_value: 29694, money_factor: 0.00125,
        fi_products: [], fi_total: 0,
        front_gross: 3290, back_gross: 0, total_gross: 3290,
        status: "draft", salesperson: "Mike Torres", fi_manager: null,
      },
      {
        lead_idx: 7, vehicle_idx: 10, deal_type: "cash",
        selling_price: 65490, invoice_cost: 60100, trade_value: 32000, trade_payoff: 12000,
        down_payment: 33490, rebates: 0, term_months: 0, apr: null,
        monthly_payment: null, fi_products: [
          { name: "Paint Protection Film", cost: 300, retail: 995, term: 0 },
          { name: "Ceramic Coating", cost: 200, retail: 799, term: 0 },
        ],
        fi_total: 1794, front_gross: 5390, back_gross: 1294, total_gross: 6684,
        status: "funded", salesperson: "Sarah Chen", fi_manager: "Lisa Park",
      },
    ];

    for (const d of dealDefs) {
      await client.query(
        `INSERT INTO deal_worksheets (
          id, dealer_id, lead_id, vehicle_vin, deal_type,
          selling_price, invoice_cost, trade_value, trade_payoff,
          down_payment, rebates, term_months, apr, monthly_payment,
          residual_value, money_factor,
          fi_products, fi_total, front_gross, back_gross, total_gross,
          status, salesperson, fi_manager, notes
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
        )`,
        [
          randomUUID(), TEST_DEALER_ID,
          leadIds[d.lead_idx], VEHICLES[d.vehicle_idx].vin, d.deal_type,
          d.selling_price, d.invoice_cost, d.trade_value, d.trade_payoff,
          d.down_payment, d.rebates, d.term_months, d.apr, d.monthly_payment,
          (d as Record<string, unknown>).residual_value ?? null,
          (d as Record<string, unknown>).money_factor ?? null,
          JSON.stringify(d.fi_products), d.fi_total,
          d.front_gross, d.back_gross, d.total_gross,
          d.status, d.salesperson, d.fi_manager,
          `Deal for ${LEADS[d.lead_idx].first_name} ${LEADS[d.lead_idx].last_name}`,
        ],
      );
    }
    counts.deal_worksheets = dealDefs.length;
    console.log(`[seed] ${dealDefs.length} deal worksheets inserted.`);

    // ---- Service Appointments (8) -----------------------------------------
    const now = new Date();
    const serviceAppts = [
      {
        customer_name: "Karen Brown", customer_email: "kbrown@example.com",
        customer_phone: "(919) 555-0309", vehicle_vin: VEHICLES[11].vin,
        vehicle_desc: "2022 Toyota Corolla SE", service_type: "maintenance",
        description: "5,000-mile maintenance — oil change, tire rotation, multi-point inspection",
        scheduled_at: addDays(now, 1, 9, 0), estimated_duration_min: 60,
        status: "scheduled", assigned_tech: "Carlos Ramirez", bay_number: null,
      },
      {
        customer_name: "Brian O'Connor", customer_email: "boconnor@example.com",
        customer_phone: "(919) 555-0304", vehicle_vin: VEHICLES[2].vin,
        vehicle_desc: "2025 Ford F-150 Lariat", service_type: "inspection",
        description: "Pre-delivery inspection and accessories installation",
        scheduled_at: addDays(now, 0, 14, 0), estimated_duration_min: 120,
        status: "checked_in", assigned_tech: "Marcus Johnson", bay_number: "B3",
      },
      {
        customer_name: "Patricia Nguyen", customer_email: "pnguyen@example.com",
        customer_phone: "(919) 555-0307", vehicle_vin: "2HKRW2H59TH100099",
        vehicle_desc: "2023 Honda CR-V EX-L", service_type: "repair",
        description: "Brake squeal — inspect front brake pads and rotors",
        scheduled_at: addDays(now, 2, 10, 30), estimated_duration_min: 90,
        status: "scheduled", assigned_tech: "Carlos Ramirez", bay_number: null,
      },
      {
        customer_name: "James Carter", customer_email: "jcarter@example.com",
        customer_phone: "(919) 555-0308", vehicle_vin: "5UXCR6C01T9200088",
        vehicle_desc: "2021 BMW X5 xDrive40i", service_type: "recall",
        description: "Recall N63-01: Software update for engine management module",
        scheduled_at: addDays(now, 3, 8, 0), estimated_duration_min: 45,
        status: "scheduled", assigned_tech: "Marcus Johnson", bay_number: null,
      },
      {
        customer_name: "Thomas Martinez", customer_email: "tmartinez@example.com",
        customer_phone: "(919) 555-0312", vehicle_vin: "5NMS3DAJ2TH300077",
        vehicle_desc: "2022 Hyundai Tucson SEL", service_type: "maintenance",
        description: "30,000-mile service — transmission fluid, filters, brakes inspection",
        scheduled_at: addDays(now, -1, 9, 30), estimated_duration_min: 120,
        status: "in_progress", assigned_tech: "Carlos Ramirez", bay_number: "B1",
      },
      {
        customer_name: "Emily Davis", customer_email: "edavis@example.com",
        customer_phone: "(919) 555-0311", vehicle_vin: "1N4BL4CV7TC400055",
        vehicle_desc: "2023 Chevrolet Bolt EUV", service_type: "recall",
        description: "Recall 21V-560: Battery module replacement",
        scheduled_at: addDays(now, 5, 8, 0), estimated_duration_min: 240,
        status: "scheduled", assigned_tech: "Marcus Johnson", bay_number: null,
      },
      {
        customer_name: "David Kim", customer_email: "dkim@example.com",
        customer_phone: "(919) 555-0302", vehicle_vin: "5YJ3E1EA7NF200033",
        vehicle_desc: "2022 Tesla Model 3", service_type: "repair",
        description: "Driver side window regulator replacement",
        scheduled_at: addDays(now, -2, 11, 0), estimated_duration_min: 90,
        status: "completed", assigned_tech: "Carlos Ramirez", bay_number: "B2",
      },
      {
        customer_name: "Robert Jackson", customer_email: "rjackson@example.com",
        customer_phone: "(919) 555-0310", vehicle_vin: "1FTEW1EP5NFA60022",
        vehicle_desc: "2020 Ford F-150 XLT", service_type: "inspection",
        description: "NC State inspection and emissions test",
        scheduled_at: addDays(now, 7, 10, 0), estimated_duration_min: 30,
        status: "scheduled", assigned_tech: "Marcus Johnson", bay_number: null,
      },
    ];

    const appointmentIds: string[] = [];
    for (const sa of serviceAppts) {
      const result = await client.query(
        `INSERT INTO service_appointments (
          id, dealer_id, customer_name, customer_email, customer_phone,
          vehicle_vin, vehicle_desc, service_type, description,
          scheduled_at, estimated_duration_min, status, assigned_tech, bay_number
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING id`,
        [
          randomUUID(), TEST_DEALER_ID,
          sa.customer_name, sa.customer_email, sa.customer_phone,
          sa.vehicle_vin, sa.vehicle_desc, sa.service_type, sa.description,
          sa.scheduled_at.toISOString(), sa.estimated_duration_min,
          sa.status, sa.assigned_tech, sa.bay_number,
        ],
      );
      appointmentIds.push(result.rows[0].id);
    }
    counts.service_appointments = serviceAppts.length;
    console.log(`[seed] ${serviceAppts.length} service appointments inserted.`);

    // ---- Repair Orders (4) ------------------------------------------------
    const repairOrders = [
      {
        ro_number: "RO-2026-0401", appointment_idx: 4,
        customer_name: "Thomas Martinez", customer_phone: "(919) 555-0312",
        vehicle_vin: "5NMS3DAJ2TH300077", vehicle_desc: "2022 Hyundai Tucson SEL",
        mileage_in: 31200, mileage_out: null,
        line_items: [
          { description: "Transmission fluid change", labor_hours: 1.0, labor_rate: 135, parts_cost: 42.50, total: 177.50 },
          { description: "Engine air filter replacement", labor_hours: 0.2, labor_rate: 135, parts_cost: 28.99, total: 55.99 },
          { description: "Cabin air filter replacement", labor_hours: 0.3, labor_rate: 135, parts_cost: 24.50, total: 65.00 },
          { description: "Brake inspection — front and rear", labor_hours: 0.5, labor_rate: 135, parts_cost: 0, total: 67.50 },
        ],
        parts_total: 95.99, labor_total: 270.00, tax: 27.87, grand_total: 393.86,
        status: "in_progress", tech_assigned: "Carlos Ramirez", advisor: "Jake Wilson",
      },
      {
        ro_number: "RO-2026-0398", appointment_idx: 6,
        customer_name: "David Kim", customer_phone: "(919) 555-0302",
        vehicle_vin: "5YJ3E1EA7NF200033", vehicle_desc: "2022 Tesla Model 3",
        mileage_in: 28400, mileage_out: 28402,
        line_items: [
          { description: "Window regulator — driver side", labor_hours: 1.5, labor_rate: 150, parts_cost: 189.00, total: 414.00 },
          { description: "Multi-point inspection", labor_hours: 0.5, labor_rate: 150, parts_cost: 0, total: 75.00 },
        ],
        parts_total: 189.00, labor_total: 300.00, tax: 37.24, grand_total: 526.24,
        status: "completed", tech_assigned: "Carlos Ramirez", advisor: "Jake Wilson",
      },
      {
        ro_number: "RO-2026-0395", appointment_idx: null,
        customer_name: "Amanda Richardson", customer_phone: "(919) 555-0301",
        vehicle_vin: "JTDKN3DU8T0800008", vehicle_desc: "2023 Toyota RAV4 XLE Premium",
        mileage_in: 21400, mileage_out: 21405,
        line_items: [
          { description: "Synthetic oil change (0W-20)", labor_hours: 0.5, labor_rate: 135, parts_cost: 52.99, total: 120.49 },
          { description: "Tire rotation", labor_hours: 0.3, labor_rate: 135, parts_cost: 0, total: 40.50 },
          { description: "Multi-point inspection", labor_hours: 0.3, labor_rate: 135, parts_cost: 0, total: 40.50 },
        ],
        parts_total: 52.99, labor_total: 148.50, tax: 15.34, grand_total: 216.83,
        status: "paid", tech_assigned: "Marcus Johnson", advisor: "Jake Wilson",
      },
      {
        ro_number: "RO-2026-0390", appointment_idx: null,
        customer_name: "Linda Washington", customer_phone: "(919) 555-0305",
        vehicle_vin: "WBA53BJ09TCR40004", vehicle_desc: "2025 BMW 330i M Sport",
        mileage_in: 1200, mileage_out: 1205,
        line_items: [
          { description: "Brake pad replacement — front", labor_hours: 1.0, labor_rate: 165, parts_cost: 145.00, total: 310.00 },
          { description: "Brake rotor resurface — front pair", labor_hours: 0.8, labor_rate: 165, parts_cost: 0, total: 132.00 },
        ],
        parts_total: 145.00, labor_total: 297.00, tax: 33.67, grand_total: 475.67,
        status: "invoiced", tech_assigned: "Carlos Ramirez", advisor: "Jake Wilson",
      },
    ];

    for (const ro of repairOrders) {
      await client.query(
        `INSERT INTO repair_orders (
          id, dealer_id, ro_number, appointment_id,
          customer_name, customer_phone, vehicle_vin, vehicle_desc,
          mileage_in, mileage_out, line_items,
          parts_total, labor_total, tax, grand_total,
          status, tech_assigned, advisor
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          randomUUID(), TEST_DEALER_ID, ro.ro_number,
          ro.appointment_idx !== null ? appointmentIds[ro.appointment_idx] : null,
          ro.customer_name, ro.customer_phone, ro.vehicle_vin, ro.vehicle_desc,
          ro.mileage_in, ro.mileage_out, JSON.stringify(ro.line_items),
          ro.parts_total, ro.labor_total, ro.tax, ro.grand_total,
          ro.status, ro.tech_assigned, ro.advisor,
        ],
      );
    }
    counts.repair_orders = repairOrders.length;
    console.log(`[seed] ${repairOrders.length} repair orders inserted.`);

    // ---- Reviews (6) ------------------------------------------------------
    const reviews = [
      {
        platform: "google", external_id: "goog-apex-001",
        reviewer_name: "Sarah M.", rating: 5,
        review_text: "Incredible experience at Apex Motors! Mike Torres was patient and knowledgeable. Got a great deal on my new CR-V. The whole process took less than 3 hours from test drive to driving off the lot.",
        sentiment: "positive",
        response_text: "Thank you Sarah! We're thrilled you had such a great experience. Mike will be delighted to hear your kind words. Enjoy your new CR-V!",
        responded_by: "Lisa Park", days_ago: 5,
      },
      {
        platform: "google", external_id: "goog-apex-002",
        reviewer_name: "Marcus T.", rating: 4,
        review_text: "Good selection of vehicles and fair pricing. The service department was quick with my inspection. Only reason for 4 stars is the wait time on Saturday — it gets busy.",
        sentiment: "positive",
        response_text: "Thanks for the feedback Marcus! We hear you on Saturday wait times — we're adding an extra tech to our Saturday crew. Hope to see you again!",
        responded_by: "Lisa Park", days_ago: 12,
      },
      {
        platform: "yelp", external_id: "yelp-apex-001",
        reviewer_name: "Jennifer P.", rating: 5,
        review_text: "Best car buying experience I've ever had. No pressure sales tactics, transparent pricing, and they matched my credit union rate. Sarah Chen was amazing to work with.",
        sentiment: "positive",
        response_text: null, responded_by: null, days_ago: 8,
      },
      {
        platform: "facebook", external_id: "fb-apex-001",
        reviewer_name: "David R.", rating: 3,
        review_text: "Decent dealership but the follow-up after my purchase has been lacking. Had to call three times to get my plates sorted out. The sales experience itself was fine.",
        sentiment: "neutral",
        response_text: "David, we sincerely apologize for the plate issue. That's not the level of service we aim for. Our GM will reach out to you directly to make this right.",
        responded_by: "Lisa Park", days_ago: 20,
      },
      {
        platform: "google", external_id: "goog-apex-003",
        reviewer_name: "Rachel K.", rating: 2,
        review_text: "Went in to see an advertised vehicle and it had already been sold. They tried to upsell me on a more expensive model. Felt like classic bait and switch.",
        sentiment: "negative",
        response_text: "Rachel, we're sorry about your experience. Popular vehicles do sell quickly, and we never intend to mislead. We'd love the chance to earn your business — please ask for our GM on your next visit.",
        responded_by: "Lisa Park", days_ago: 30,
      },
      {
        platform: "yelp", external_id: "yelp-apex-002",
        reviewer_name: "Carlos G.", rating: 5,
        review_text: "Brought my F-150 in for service. Carlos in the shop is a wizard — diagnosed a weird electrical issue that two other shops couldn't figure out. Fair pricing too.",
        sentiment: "positive",
        response_text: null, responded_by: null, days_ago: 3,
      },
    ];

    for (const r of reviews) {
      const publishedAt = new Date(now.getTime() - r.days_ago * 86400000);
      await client.query(
        `INSERT INTO reviews (
          id, dealer_id, platform, external_id, reviewer_name, rating,
          review_text, sentiment, response_text, responded_at, responded_by,
          published_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `,
        [
          randomUUID(), TEST_DEALER_ID, r.platform, r.external_id,
          r.reviewer_name, r.rating, r.review_text, r.sentiment,
          r.response_text,
          r.response_text ? new Date(publishedAt.getTime() + 86400000).toISOString() : null,
          r.responded_by,
          publishedAt.toISOString(),
        ],
      );
    }
    counts.reviews = reviews.length;
    console.log(`[seed] ${reviews.length} reviews inserted.`);

    // ---- Message Templates (3) --------------------------------------------
    const templates = [
      {
        name: "Welcome Email", channel: "email",
        subject: "Welcome to Apex Motors, {{first_name}}!",
        body: "Hi {{first_name}},\n\nThank you for reaching out to Apex Motors! We received your inquiry about {{vehicle_interest}} and would love to help you find the perfect vehicle.\n\nOur team is available Mon-Fri 9AM-8PM, Sat 9AM-6PM, and Sun 12PM-5PM. Feel free to call us at (919) 555-0200 or reply to this email.\n\nBest regards,\nThe Apex Motors Team",
        variables: ["first_name", "vehicle_interest"],
        category: "general",
      },
      {
        name: "Follow-Up SMS", channel: "sms",
        subject: null,
        body: "Hi {{first_name}}, this is {{salesperson}} from Apex Motors. Just checking in on your interest in the {{vehicle_interest}}. Have any questions I can help with? Reply STOP to opt out.",
        variables: ["first_name", "salesperson", "vehicle_interest"],
        category: "follow_up",
      },
      {
        name: "Appointment Reminder", channel: "email",
        subject: "Reminder: Your Appointment at Apex Motors",
        body: "Hi {{first_name}},\n\nThis is a friendly reminder about your appointment at Apex Motors:\n\nDate: {{appointment_date}}\nTime: {{appointment_time}}\n\nPlease arrive 10 minutes early. If you need to reschedule, call us at (919) 555-0200.\n\nSee you soon!\nApex Motors",
        variables: ["first_name", "appointment_date", "appointment_time"],
        category: "appointment",
      },
    ];

    for (const t of templates) {
      await client.query(
        `INSERT INTO message_templates (
          id, dealer_id, name, channel, subject, body, variables, category
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          randomUUID(), TEST_DEALER_ID,
          t.name, t.channel, t.subject, t.body,
          `{${t.variables.join(",")}}`, t.category,
        ],
      );
    }
    counts.message_templates = templates.length;
    console.log(`[seed] ${templates.length} message templates inserted.`);

    // ---- Analytics Events (10) --------------------------------------------
    const analyticsEvents = [
      { event_type: "deal", action: "worksheet_created", page: "/admin/deals", days_ago: 0 },
      { event_type: "service", action: "appointment_booked", page: "/service-booking", days_ago: 1 },
      { event_type: "review", action: "response_sent", page: "/admin/reviews", days_ago: 1 },
      { event_type: "comms", action: "email_sent", page: "/admin/comms", days_ago: 2 },
      { event_type: "customer", action: "lead_created", page: "/contact", days_ago: 2 },
      { event_type: "accounting", action: "deal_funded", page: "/admin/accounting", days_ago: 3 },
      { event_type: "retail", action: "payment_calculated", page: "/admin/digital-retail", days_ago: 4 },
      { event_type: "document", action: "document_uploaded", page: "/admin/documents", days_ago: 5 },
      { event_type: "compliance", action: "check_passed", page: "/admin/compliance", days_ago: 5 },
      { event_type: "security", action: "login_success", page: "/admin/login", days_ago: 6 },
    ];

    // Ensure analytics_events table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id                BIGSERIAL    PRIMARY KEY,
        event_type        TEXT         NOT NULL,
        action            TEXT         NOT NULL,
        page              TEXT         NOT NULL,
        session_id        TEXT         NOT NULL,
        user_fingerprint  TEXT         NOT NULL,
        timestamp         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        metadata          JSONB        NOT NULL DEFAULT '{}'
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events (event_type)`);

    for (const ae of analyticsEvents) {
      const ts = new Date(now.getTime() - ae.days_ago * 86400000);
      await client.query(
        `INSERT INTO analytics_events (
          event_type, action, page, session_id, user_fingerprint, timestamp, metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          ae.event_type, ae.action, ae.page,
          `test-session-${randomUUID().slice(0, 8)}`,
          `test-fp-${randomUUID().slice(0, 8)}`,
          ts.toISOString(),
          JSON.stringify({ dealer_id: TEST_DEALER_ID, source: "seed-script" }),
        ],
      );
    }
    counts.analytics_events = analyticsEvents.length;
    console.log(`[seed] ${analyticsEvents.length} analytics events inserted.`);

    // ---- Webhook Configs (2) ----------------------------------------------
    const webhooks = [
      {
        url: "https://hooks.example.com/apex-motors/all-events",
        secret: "whsec_test_all_events_" + randomUUID().slice(0, 12),
        events: "{*}",
        description: "All platform events — test endpoint",
      },
      {
        url: "https://hooks.example.com/apex-motors/leads-only",
        secret: "whsec_test_leads_only_" + randomUUID().slice(0, 12),
        events: "{lead.created,lead.updated,lead.status_changed}",
        description: "Lead events only — CRM sync",
      },
    ];

    for (const wh of webhooks) {
      await client.query(
        `INSERT INTO webhook_configs (
          id, dealer_id, url, secret, events, active, description
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          randomUUID(), TEST_DEALER_ID,
          wh.url, wh.secret, wh.events, true, wh.description,
        ],
      );
    }
    counts.webhook_configs = webhooks.length;
    console.log(`[seed] ${webhooks.length} webhook configs inserted.`);

    // ---- Commit -----------------------------------------------------------
    await client.query("COMMIT");

    // ---- Summary ----------------------------------------------------------
    console.log("");
    console.log("=".repeat(60));
    console.log("  Test Dealer Seeded Successfully");
    console.log("=".repeat(60));
    console.log("");
    console.log(`  Dealer Name  : ${DEALER.name}`);
    console.log(`  Dealer ID    : ${TEST_DEALER_ID}`);
    console.log(`  Dealer Slug  : ${TEST_DEALER_SLUG}`);
    console.log("");
    console.log("  Data Summary:");
    for (const [table, count] of Object.entries(counts)) {
      console.log(`    ${table.padEnd(25)} ${count}`);
    }
    console.log("");
    console.log("  Login (DEMO_MODE=true):");
    console.log("    URL:   http://localhost:3000/admin");
    console.log("    Email: demo@wolfpackauto.com");
    console.log("    Pass:  demo123");
    console.log("");
    console.log("  Cleanup:");
    console.log(`    npx tsx scripts/cleanup-test-dealer.ts --dealer-slug ${TEST_DEALER_SLUG}`);
    console.log("");
    console.log("=".repeat(60));

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(base: Date, days: number, hour: number, minute: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

seed()
  .then(() => {
    console.log("[seed] Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("[seed] Error:", err);
    process.exit(1);
  });
