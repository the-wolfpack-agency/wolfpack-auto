/**
 * Seed script for Wolfpack Auto.
 *
 * Creates a demo dealer ("Wolfpack Motors") with 20 sample vehicles
 * and 5 sample leads.
 *
 * Usage:
 *   npx tsx src/db/seed.ts
 */

import { pool } from "@/lib/db";

const DEMO_DEALER_ID = "00000000-0000-4000-a000-000000000001";

const DEALER = {
  id: DEMO_DEALER_ID,
  name: "Wolfpack Motors",
  slug: "wolfpack-motors",
  subdomain: "wolfpack",
  phone: "(919) 555-0100",
  email: "sales@wolfpackmotors.com",
  website_url: "https://wolfpackmotors.com",
  address: JSON.stringify({
    street: "4200 Six Forks Rd",
    city: "Raleigh",
    state: "NC",
    zip: "27609",
    lat: 35.8428,
    lng: -78.6414,
  }),
  sales_hours: JSON.stringify([
    { day: "monday", open: "09:00", close: "19:00", closed: false },
    { day: "tuesday", open: "09:00", close: "19:00", closed: false },
    { day: "wednesday", open: "09:00", close: "19:00", closed: false },
    { day: "thursday", open: "09:00", close: "19:00", closed: false },
    { day: "friday", open: "09:00", close: "19:00", closed: false },
    { day: "saturday", open: "09:00", close: "17:00", closed: false },
    { day: "sunday", open: "12:00", close: "17:00", closed: false },
  ]),
  service_hours: JSON.stringify([
    { day: "monday", open: "07:30", close: "18:00", closed: false },
    { day: "tuesday", open: "07:30", close: "18:00", closed: false },
    { day: "wednesday", open: "07:30", close: "18:00", closed: false },
    { day: "thursday", open: "07:30", close: "18:00", closed: false },
    { day: "friday", open: "07:30", close: "18:00", closed: false },
    { day: "saturday", open: "08:00", close: "14:00", closed: false },
    { day: "sunday", open: "00:00", close: "00:00", closed: true },
  ]),
  branding: JSON.stringify({
    primary_color: "#CC0000",
    secondary_color: "#1A1A1A",
    accent_color: "#FF4444",
    logo_url: "/images/wolfpack-logo.svg",
    favicon_url: "/favicon.ico",
    font_family: "Inter",
  }),
  has_service_center: true,
  has_financing: true,
  has_trade_in: true,
};

interface SeedVehicle {
  vin: string;
  stock_number: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  body_style: string;
  exterior_color: string;
  interior_color: string;
  engine: string;
  transmission: string;
  drivetrain: string;
  fuel_type: string;
  mpg_city: number | null;
  mpg_highway: number | null;
  msrp: number | null;
  price: number;
  internet_price: number | null;
  condition: string;
  mileage: number;
  status: string;
  description: string;
  features: string[];
}

const VEHICLES: SeedVehicle[] = [
  {
    vin: "1HGCV1F34PA000001", stock_number: "WP-001",
    year: 2025, make: "Honda", model: "Accord", trim: "Sport",
    body_style: "Sedan", exterior_color: "Crystal Black Pearl", interior_color: "Black",
    engine: "1.5L Turbo I4", transmission: "cvt", drivetrain: "fwd", fuel_type: "gasoline",
    mpg_city: 29, mpg_highway: 37, msrp: 31490, price: 30495, internet_price: 29999,
    condition: "new", mileage: 12, status: "available",
    description: "Brand new 2025 Accord Sport with turbocharged engine and Honda Sensing suite.",
    features: ["Apple CarPlay", "Android Auto", "Honda Sensing", "LED Headlights", "Wireless Charging"],
  },
  {
    vin: "5YJSA1E26PF000002", stock_number: "WP-002",
    year: 2025, make: "Tesla", model: "Model 3", trim: "Long Range",
    body_style: "Sedan", exterior_color: "Pearl White", interior_color: "White",
    engine: "Dual Motor Electric", transmission: "automatic", drivetrain: "awd", fuel_type: "electric",
    mpg_city: null, mpg_highway: null, msrp: 47490, price: 46990, internet_price: 46490,
    condition: "new", mileage: 5, status: "available",
    description: "2025 Model 3 Long Range with 358-mile range and full self-driving capability.",
    features: ["Autopilot", "Full Self-Driving", "Glass Roof", "15\" Touchscreen", "Premium Audio"],
  },
  {
    vin: "1N4BL4BV8PN000003", stock_number: "WP-003",
    year: 2025, make: "Nissan", model: "Altima", trim: "SR",
    body_style: "Sedan", exterior_color: "Scarlet Ember", interior_color: "Charcoal",
    engine: "2.5L I4", transmission: "cvt", drivetrain: "fwd", fuel_type: "gasoline",
    mpg_city: 28, mpg_highway: 39, msrp: 29690, price: 28495, internet_price: 27999,
    condition: "new", mileage: 8, status: "available",
    description: "Sporty 2025 Altima SR with aggressive styling and ProPILOT Assist.",
    features: ["ProPILOT Assist", "Bose Audio", "Sport Seats", "19\" Wheels", "Remote Start"],
  },
  {
    vin: "3GNKBBRS8PS000004", stock_number: "WP-004",
    year: 2024, make: "Chevrolet", model: "Equinox", trim: "RS",
    body_style: "SUV", exterior_color: "Summit White", interior_color: "Jet Black",
    engine: "1.5L Turbo I4", transmission: "automatic", drivetrain: "awd", fuel_type: "gasoline",
    mpg_city: 26, mpg_highway: 31, msrp: 34195, price: 32500, internet_price: 31999,
    condition: "new", mileage: 45, status: "available",
    description: "Versatile 2024 Equinox RS with AWD and sport-tuned suspension.",
    features: ["Chevrolet Safety Assist", "WiFi Hotspot", "Wireless Charging", "Panoramic Sunroof"],
  },
  {
    vin: "5TDKK3DC4PS000005", stock_number: "WP-005",
    year: 2024, make: "Toyota", model: "Highlander", trim: "XLE",
    body_style: "SUV", exterior_color: "Celestial Silver", interior_color: "Graphite",
    engine: "2.4L Turbo I4", transmission: "automatic", drivetrain: "awd", fuel_type: "gasoline",
    mpg_city: 22, mpg_highway: 29, msrp: 43470, price: 42500, internet_price: 41995,
    condition: "new", mileage: 22, status: "available",
    description: "Family-ready 2024 Highlander XLE with third row and Toyota Safety Sense 3.0.",
    features: ["Toyota Safety Sense 3.0", "3rd Row", "JBL Audio", "Power Liftgate", "Leather Seats"],
  },
  {
    vin: "WBA53BJ06PCR00006", stock_number: "WP-006",
    year: 2024, make: "BMW", model: "330i", trim: "xDrive",
    body_style: "Sedan", exterior_color: "Alpine White", interior_color: "Cognac",
    engine: "2.0L Turbo I4", transmission: "automatic", drivetrain: "awd", fuel_type: "gasoline",
    mpg_city: 25, mpg_highway: 34, msrp: 47600, price: 45990, internet_price: 44995,
    condition: "new", mileage: 18, status: "available",
    description: "Luxury 2024 BMW 330i xDrive with sport handling and premium interior.",
    features: ["Live Cockpit Pro", "Harman Kardon", "Sport Seats", "Parking Assistant", "Gesture Control"],
  },
  {
    vin: "1FTEW1EP0PFA00007", stock_number: "WP-007",
    year: 2025, make: "Ford", model: "F-150", trim: "XLT",
    body_style: "Truck", exterior_color: "Area 51 Blue", interior_color: "Medium Dark Slate",
    engine: "2.7L EcoBoost V6", transmission: "automatic", drivetrain: "4wd", fuel_type: "gasoline",
    mpg_city: 20, mpg_highway: 26, msrp: 47595, price: 46250, internet_price: 45499,
    condition: "new", mileage: 30, status: "available",
    description: "America's best-selling truck. 2025 F-150 XLT with EcoBoost power.",
    features: ["Co-Pilot360", "SYNC 4", "Pro Trailer Backup", "LED Bed Lights", "Spray-In Liner"],
  },
  {
    vin: "JN1AZ4EH0PM000008", stock_number: "WP-008",
    year: 2024, make: "Nissan", model: "Z", trim: "Performance",
    body_style: "Coupe", exterior_color: "Ikazuchi Yellow", interior_color: "Black",
    engine: "3.0L Twin-Turbo V6", transmission: "manual", drivetrain: "rwd", fuel_type: "gasoline",
    mpg_city: 19, mpg_highway: 28, msrp: 53940, price: 52500, internet_price: null,
    condition: "new", mileage: 7, status: "available",
    description: "Legendary Nissan Z Performance with 400hp twin-turbo V6 and 6-speed manual.",
    features: ["Launch Control", "Sport Brakes", "RAYS Wheels", "Bose Audio", "Sport Exhaust"],
  },
  {
    vin: "WVWZZZ3CZPE000009", stock_number: "WP-009",
    year: 2024, make: "Volkswagen", model: "ID.4", trim: "Pro S Plus",
    body_style: "SUV", exterior_color: "Moonstone Grey", interior_color: "Galaxy Black",
    engine: "Dual Motor Electric", transmission: "automatic", drivetrain: "awd", fuel_type: "electric",
    mpg_city: null, mpg_highway: null, msrp: 52795, price: 49990, internet_price: 49490,
    condition: "new", mileage: 15, status: "available",
    description: "All-electric 2024 ID.4 Pro S Plus with 275-mile range and AWD.",
    features: ["IQ.DRIVE", "12\" Touchscreen", "Augmented Reality HUD", "Heated Seats", "360 Camera"],
  },
  {
    vin: "JTDKN3DU6A0000010", stock_number: "WP-010",
    year: 2023, make: "Toyota", model: "Camry", trim: "SE",
    body_style: "Sedan", exterior_color: "Midnight Black", interior_color: "Black/Red",
    engine: "2.5L I4", transmission: "automatic", drivetrain: "fwd", fuel_type: "gasoline",
    mpg_city: 28, mpg_highway: 39, msrp: 28855, price: 24990, internet_price: 24495,
    condition: "certified", mileage: 18200, status: "available",
    description: "Toyota Certified Pre-Owned 2023 Camry SE. One owner, clean CARFAX.",
    features: ["Toyota Safety Sense 2.5", "Apple CarPlay", "Android Auto", "Sport Tuned Suspension"],
  },
  {
    vin: "1G1YY22G655000011", stock_number: "WP-011",
    year: 2022, make: "Chevrolet", model: "Corvette", trim: "3LT",
    body_style: "Coupe", exterior_color: "Torch Red", interior_color: "Adrenaline Red",
    engine: "6.2L V8", transmission: "automatic", drivetrain: "rwd", fuel_type: "gasoline",
    mpg_city: 15, mpg_highway: 27, msrp: 73740, price: 68995, internet_price: null,
    condition: "used", mileage: 8400, status: "available",
    description: "Mid-engine masterpiece. 2022 C8 Corvette 3LT with Z51 performance package.",
    features: ["Z51 Package", "Magnetic Ride", "Front Lift", "Performance Exhaust", "Carbon Fiber Trim"],
  },
  {
    vin: "5UXCR6C09P9000012", stock_number: "WP-012",
    year: 2023, make: "BMW", model: "X3", trim: "xDrive30i",
    body_style: "SUV", exterior_color: "Phytonic Blue", interior_color: "Oyster",
    engine: "2.0L Turbo I4", transmission: "automatic", drivetrain: "awd", fuel_type: "gasoline",
    mpg_city: 24, mpg_highway: 29, msrp: 49595, price: 41990, internet_price: 41490,
    condition: "certified", mileage: 22100, status: "available",
    description: "BMW Certified 2023 X3 with premium package and low miles.",
    features: ["Panoramic Sunroof", "Vernasca Leather", "Parking Assistant", "Wireless CarPlay"],
  },
  {
    vin: "1C4RJFBG0PC000013", stock_number: "WP-013",
    year: 2024, make: "Jeep", model: "Grand Cherokee", trim: "Limited",
    body_style: "SUV", exterior_color: "Diamond Black", interior_color: "Global Black",
    engine: "3.6L V6", transmission: "automatic", drivetrain: "4wd", fuel_type: "gasoline",
    mpg_city: 19, mpg_highway: 26, msrp: 49240, price: 47490, internet_price: 46995,
    condition: "new", mileage: 35, status: "available",
    description: "2024 Grand Cherokee Limited with Quadra-Trac II 4WD and luxury interior.",
    features: ["Quadra-Trac II", "Uconnect 5", "Nappa Leather", "Advanced Safety Group", "Tow Package"],
  },
  {
    vin: "KNAE35L17P5000014", stock_number: "WP-014",
    year: 2024, make: "Kia", model: "EV6", trim: "GT-Line",
    body_style: "SUV", exterior_color: "Snow White Pearl", interior_color: "Black/Green",
    engine: "Dual Motor Electric", transmission: "automatic", drivetrain: "awd", fuel_type: "electric",
    mpg_city: null, mpg_highway: null, msrp: 56990, price: 52990, internet_price: 52490,
    condition: "new", mileage: 10, status: "available",
    description: "Ultra-fast charging Kia EV6 GT-Line. 0-80% in 18 minutes.",
    features: ["800V Architecture", "V2L Capability", "Augmented Reality HUD", "Meridian Audio"],
  },
  {
    vin: "2T1BURHE8PC000015", stock_number: "WP-015",
    year: 2022, make: "Toyota", model: "Corolla", trim: "LE",
    body_style: "Sedan", exterior_color: "Classic Silver", interior_color: "Light Gray",
    engine: "1.8L I4", transmission: "cvt", drivetrain: "fwd", fuel_type: "gasoline",
    mpg_city: 31, mpg_highway: 40, msrp: 22050, price: 18490, internet_price: 17995,
    condition: "used", mileage: 34500, status: "available",
    description: "Reliable 2022 Corolla LE. Great fuel economy, one owner, service records available.",
    features: ["Toyota Safety Sense 2.0", "Apple CarPlay", "Adaptive Cruise Control", "Lane Departure Alert"],
  },
  {
    vin: "1GCUYEED2PZ000016", stock_number: "WP-016",
    year: 2024, make: "Chevrolet", model: "Silverado 1500", trim: "LT Trail Boss",
    body_style: "Truck", exterior_color: "Oxford Brown", interior_color: "Jet Black",
    engine: "5.3L V8", transmission: "automatic", drivetrain: "4wd", fuel_type: "gasoline",
    mpg_city: 16, mpg_highway: 22, msrp: 54295, price: 52990, internet_price: 51995,
    condition: "new", mileage: 28, status: "available",
    description: "Off-road ready 2024 Silverado Trail Boss with Z71 suspension.",
    features: ["Z71 Off-Road Package", "Trailer Camera", "Multi-Flex Tailgate", "Bose Audio", "Skid Plates"],
  },
  {
    vin: "WBAPH5C50BA000017", stock_number: "WP-017",
    year: 2021, make: "BMW", model: "530i", trim: "xDrive",
    body_style: "Sedan", exterior_color: "Black Sapphire", interior_color: "Canberra Beige",
    engine: "2.0L Turbo I4", transmission: "automatic", drivetrain: "awd", fuel_type: "gasoline",
    mpg_city: 25, mpg_highway: 33, msrp: 56695, price: 35990, internet_price: 35490,
    condition: "used", mileage: 41200, status: "available",
    description: "Executive sedan. 2021 BMW 530i xDrive with M Sport package.",
    features: ["M Sport Package", "Gesture Control", "Soft-Close Doors", "Comfort Access", "Ambient Lighting"],
  },
  {
    vin: "5NMS3DAJ2PH000018", stock_number: "WP-018",
    year: 2024, make: "Hyundai", model: "Santa Fe", trim: "SEL",
    body_style: "SUV", exterior_color: "Hampton Grey", interior_color: "Dark Grey",
    engine: "2.5L I4", transmission: "automatic", drivetrain: "awd", fuel_type: "gasoline",
    mpg_city: 26, mpg_highway: 29, msrp: 38050, price: 36990, internet_price: 36490,
    condition: "new", mileage: 20, status: "available",
    description: "All-new 2024 Santa Fe SEL with bold design and Hyundai SmartSense.",
    features: ["SmartSense Safety", "12.3\" Display", "Digital Key 2", "Blind-Spot View Monitor"],
  },
  {
    vin: "3MW5R1J04P8000019", stock_number: "WP-019",
    year: 2023, make: "Honda", model: "CR-V", trim: "EX-L",
    body_style: "SUV", exterior_color: "Canyon River Blue", interior_color: "Black Leather",
    engine: "1.5L Turbo I4", transmission: "cvt", drivetrain: "awd", fuel_type: "gasoline",
    mpg_city: 28, mpg_highway: 34, msrp: 37750, price: 33490, internet_price: 32995,
    condition: "certified", mileage: 15800, status: "available",
    description: "Honda Certified 2023 CR-V EX-L. Leather, sunroof, AWD. Excellent condition.",
    features: ["Honda Sensing", "Leather Seats", "Moonroof", "Wireless CarPlay", "Power Tailgate"],
  },
  {
    vin: "1G1FE1R70P0000020", stock_number: "WP-020",
    year: 2024, make: "Chevrolet", model: "Camaro", trim: "LT1",
    body_style: "Coupe", exterior_color: "Vivid Orange", interior_color: "Jet Black",
    engine: "6.2L V8", transmission: "manual", drivetrain: "rwd", fuel_type: "gasoline",
    mpg_city: 16, mpg_highway: 27, msrp: 42695, price: 41990, internet_price: null,
    condition: "new", mileage: 11, status: "pending",
    description: "Final edition 2024 Camaro LT1. V8 power with 6-speed manual. Collector potential.",
    features: ["6-Speed Manual", "Brembo Brakes", "Performance Exhaust", "Recaro Seats", "HUD"],
  },
];

interface SeedLead {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  vehicle_interest: string;
  source: string;
  status: string;
  notes: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

const LEADS: SeedLead[] = [
  {
    first_name: "Sarah", last_name: "Chen",
    email: "sarah.chen@example.com", phone: "(919) 555-0201",
    vehicle_interest: "2025 Honda Accord Sport",
    source: "website_form", status: "new", notes: "Interested in test drive this weekend.",
    utm_source: "google", utm_medium: "cpc", utm_campaign: "spring-sale-2025",
  },
  {
    first_name: "Marcus", last_name: "Williams",
    email: "m.williams@example.com", phone: "(919) 555-0202",
    vehicle_interest: "2025 Tesla Model 3 Long Range",
    source: "vdp_inquiry", status: "contacted", notes: "Called back, wants financing info.",
    utm_source: "facebook", utm_medium: "social", utm_campaign: null,
  },
  {
    first_name: "Jennifer", last_name: "Park",
    email: "jpark@example.com", phone: null,
    vehicle_interest: "Used SUV under $45,000",
    source: "chat", status: "qualified", notes: "Budget is firm. Considering X3 or CR-V.",
    utm_source: null, utm_medium: null, utm_campaign: null,
  },
  {
    first_name: "Robert", last_name: "Garcia",
    email: "rgarcia@example.com", phone: "(919) 555-0204",
    vehicle_interest: "2024 Chevrolet Camaro LT1",
    source: "phone", status: "appointment_set", notes: "Appointment set for Saturday 10 AM.",
    utm_source: "google", utm_medium: "organic", utm_campaign: null,
  },
  {
    first_name: "Emily", last_name: "Thompson",
    email: "emily.t@example.com", phone: "(919) 555-0205",
    vehicle_interest: "2024 Kia EV6 GT-Line",
    source: "third_party", status: "new", notes: "Came from Cars.com listing.",
    utm_source: "cars_com", utm_medium: "referral", utm_campaign: "ev-listings",
  },
];

async function seed(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // -- Dealer ---------------------------------------------------------------
    await client.query(
      `INSERT INTO dealers (
        id, name, slug, subdomain, phone, email, website_url,
        address, sales_hours, service_hours, branding,
        has_service_center, has_financing, has_trade_in
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (slug) DO NOTHING`,
      [
        DEALER.id, DEALER.name, DEALER.slug, DEALER.subdomain,
        DEALER.phone, DEALER.email, DEALER.website_url,
        DEALER.address, DEALER.sales_hours, DEALER.service_hours, DEALER.branding,
        DEALER.has_service_center, DEALER.has_financing, DEALER.has_trade_in,
      ],
    );

    console.log(`[seed] Dealer "${DEALER.name}" created (${DEMO_DEALER_ID}).`);

    // -- Vehicles -------------------------------------------------------------
    for (const v of VEHICLES) {
      await client.query(
        `INSERT INTO vehicles (
          dealer_id, vin, stock_number,
          year, make, model, trim, body_style, exterior_color, interior_color,
          engine, transmission, drivetrain, fuel_type, mpg_city, mpg_highway,
          msrp, price, internet_price,
          condition, mileage, status,
          description, features
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24
        )
        ON CONFLICT (dealer_id, vin) DO NOTHING`,
        [
          DEMO_DEALER_ID, v.vin, v.stock_number,
          v.year, v.make, v.model, v.trim, v.body_style, v.exterior_color, v.interior_color,
          v.engine, v.transmission, v.drivetrain, v.fuel_type, v.mpg_city, v.mpg_highway,
          v.msrp, v.price, v.internet_price,
          v.condition, v.mileage, v.status,
          v.description, JSON.stringify(v.features),
        ],
      );
    }

    console.log(`[seed] ${VEHICLES.length} vehicles inserted.`);

    // -- Leads ----------------------------------------------------------------
    for (const l of LEADS) {
      await client.query(
        `INSERT INTO leads (
          dealer_id, first_name, last_name, email, phone,
          vehicle_interest, source, status, notes,
          utm_source, utm_medium, utm_campaign
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          DEMO_DEALER_ID, l.first_name, l.last_name, l.email, l.phone,
          l.vehicle_interest, l.source, l.status, l.notes,
          l.utm_source, l.utm_medium, l.utm_campaign,
        ],
      );
    }

    console.log(`[seed] ${LEADS.length} leads inserted.`);

    // -- Customers (needed by equity-mining + households) -----------------------
    const DEMO_CUSTOMERS = [
      { first_name: "Sarah", last_name: "Chen", email: "sarah.chen@example.com", phone: "(919) 555-0201", address: "100 Fayetteville St", zip: "27601" },
      { first_name: "Marcus", last_name: "Williams", email: "m.williams@example.com", phone: "(919) 555-0202", address: "200 Hillsborough St", zip: "27603" },
      { first_name: "Jennifer", last_name: "Park", email: "jpark@example.com", phone: "(919) 555-0203", address: "300 Glenwood Ave", zip: "27603" },
      { first_name: "Robert", last_name: "Garcia", email: "rgarcia@example.com", phone: "(919) 555-0204", address: "400 Capital Blvd", zip: "27604" },
      { first_name: "Emily", last_name: "Thompson", email: "emily.t@example.com", phone: "(919) 555-0205", address: "500 Six Forks Rd", zip: "27609" },
    ];

    for (const c of DEMO_CUSTOMERS) {
      await client.query(
        `UPDATE customers SET first_name = $2, last_name = $3, phone = COALESCE(phone, $4), address = $5, zip = $6
         WHERE dealer_id = $1 AND email = $7`,
        [DEMO_DEALER_ID, c.first_name, c.last_name, c.phone, c.address, c.zip, c.email],
      );
    }
    console.log(`[seed] ${DEMO_CUSTOMERS.length} customers enriched.`);

    // -- Customer vehicles (equity mining) -------------------------------------
    await client.query(
      `INSERT INTO customer_vehicles (dealer_id, customer_id, vin, year, make, model, mileage, condition, loan_balance, monthly_payment, last_service_date)
       SELECT $1, c.id, $2, $3, $4, $5, $6, $7, $8, $9, $10::date
       FROM customers c WHERE c.dealer_id = $1 AND c.email = $11
       ON CONFLICT DO NOTHING`,
      [DEMO_DEALER_ID, "1HGCV1F30PA100001", 2021, "Honda", "Civic", 42000, "good", 8500, 325, "2026-01-15", "sarah.chen@example.com"],
    );
    await client.query(
      `INSERT INTO customer_vehicles (dealer_id, customer_id, vin, year, make, model, mileage, condition, loan_balance, monthly_payment, last_service_date)
       SELECT $1, c.id, $2, $3, $4, $5, $6, $7, $8, $9, $10::date
       FROM customers c WHERE c.dealer_id = $1 AND c.email = $11
       ON CONFLICT DO NOTHING`,
      [DEMO_DEALER_ID, "5YJSA1E20MF100002", 2022, "Tesla", "Model 3", 28000, "excellent", 22000, 550, "2026-02-20", "m.williams@example.com"],
    );
    console.log("[seed] 2 customer vehicles inserted.");

    // -- Households ------------------------------------------------------------
    const householdId = "hh-demo-001";
    await client.query(
      `INSERT INTO households (id, dealer_id, family_name)
       VALUES ($1, $2, 'Garcia-Thompson')
       ON CONFLICT DO NOTHING`,
      [householdId, DEMO_DEALER_ID],
    );
    console.log("[seed] 1 household inserted.");

    // -- Surveys ---------------------------------------------------------------
    await client.query(
      `INSERT INTO surveys (id, dealer_id, title, description, questions, trigger, active)
       VALUES ($1, $2, 'Post-Purchase NPS', 'How likely are you to recommend us?', $3, $4, true)
       ON CONFLICT DO NOTHING`,
      [
        "survey-demo-001", DEMO_DEALER_ID,
        JSON.stringify([{ id: "q1", type: "nps", text: "How likely are you to recommend Wolfpack Motors?" }]),
        JSON.stringify({ event: "deal.funded", delay_hours: 48 }),
      ],
    );
    console.log("[seed] 1 survey inserted.");

    // -- Reinsurance -----------------------------------------------------------
    await client.query(
      `INSERT INTO reinsurance_programs (id, dealer_id, name, type, status, inception_date, cession_rate, admin_fee_rate, total_premiums, total_claims, total_admin_costs, retained_reserves)
       VALUES ($1, $2, 'Wolfpack CFC Program', 'CFC', 'active', '2025-01-01', 0.65, 0.05, 245000, 62000, 12250, 170750)
       ON CONFLICT DO NOTHING`,
      ["reins-demo-001", DEMO_DEALER_ID],
    );
    console.log("[seed] 1 reinsurance program inserted.");

    // -- Dashboard annotations -------------------------------------------------
    await client.query(
      `INSERT INTO dashboard_annotations (id, dealer_id, dashboard_id, date, text, type, created_by)
       VALUES ($1, $2, 'main', '2026-04-01', 'Spring Sale launched — 2x ad spend', 'campaign', 'admin')
       ON CONFLICT DO NOTHING`,
      ["anno-demo-001", DEMO_DEALER_ID],
    );
    console.log("[seed] 1 dashboard annotation inserted.");

    // -- Lead ingestion feeds --------------------------------------------------
    await client.query(
      `INSERT INTO lead_ingestion_feeds (id, dealer_id, name, source, active)
       VALUES ($1, $2, 'AutoTrader Feed', 'autotrader', true),
              ($3, $2, 'Cars.com Feed', 'cars_com', true)
       ON CONFLICT DO NOTHING`,
      ["feed-demo-001", DEMO_DEALER_ID, "feed-demo-002"],
    );
    console.log("[seed] 2 lead ingestion feeds inserted.");

    // -- Drip campaigns --------------------------------------------------------
    await client.query(
      `INSERT INTO drip_campaigns (id, dealer_id, name, trigger, steps, active, stats)
       VALUES ($1, $2, 'New Lead Welcome', 'lead_created', $3, true, $4)
       ON CONFLICT DO NOTHING`,
      [
        "drip-demo-001", DEMO_DEALER_ID,
        JSON.stringify([
          { stepNumber: 1, subject: "Welcome to Wolfpack Motors!", bodyTemplate: "Hi {{first_name}}, thanks for your interest...", delayHours: 0 },
          { stepNumber: 2, subject: "Special offer just for you", bodyTemplate: "We have a great deal on the {{vehicle}}...", delayHours: 48 },
        ]),
        JSON.stringify({ totalEnrolled: 47, totalConverted: 8, emailsSent: 94, conversionRate: 17 }),
      ],
    );
    console.log("[seed] 1 drip campaign inserted.");

    // -- SMS messages -------------------------------------------------------------
    await client.query(
      `INSERT INTO sms_messages (id, dealer_id, lead_id, direction, "from", "to", body, status, created_at)
       SELECT $1, $2, l.id, 'outbound', '(919) 555-0100', '(919) 555-0201', 'Hi Sarah! Your Honda Accord is ready for a test drive.', 'delivered', NOW() - INTERVAL '2 days'
       FROM leads l WHERE l.dealer_id = $2 AND l.email = 'sarah.chen@example.com' LIMIT 1
       ON CONFLICT DO NOTHING`,
      ["sms-demo-001", DEMO_DEALER_ID],
    );
    await client.query(
      `INSERT INTO sms_messages (id, dealer_id, lead_id, direction, "from", "to", body, status, created_at)
       SELECT $1, $2, l.id, 'inbound', '(919) 555-0201', '(919) 555-0100', 'Sounds great! What time Saturday?', 'delivered', NOW() - INTERVAL '2 days' + INTERVAL '30 minutes'
       FROM leads l WHERE l.dealer_id = $2 AND l.email = 'sarah.chen@example.com' LIMIT 1
       ON CONFLICT DO NOTHING`,
      ["sms-demo-002", DEMO_DEALER_ID],
    );
    console.log("[seed] 2 SMS messages inserted.");

    // -- Session replays ----------------------------------------------------------
    await client.query(
      `INSERT INTO session_replays (session_id, dealer_id, started_at, ended_at, duration_ms, pages_visited, event_count, conversion, user_agent, viewport)
       VALUES ($1, $2, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2.5 hours', 1800000, $3, 342, true, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)', $4)
       ON CONFLICT DO NOTHING`,
      [
        "replay-seed-001", DEMO_DEALER_ID,
        JSON.stringify(["/", "/inventory", "/inventory/2025-honda-accord", "/financing"]),
        JSON.stringify({ width: 390, height: 844 }),
      ],
    );
    console.log("[seed] 1 session replay inserted.");

    // -- Client errors ------------------------------------------------------------
    await client.query(
      `INSERT INTO client_errors (id, dealer_id, fingerprint, message, stack, page_url, session_id, captured_at)
       VALUES ($1, $2, 'err-fp-001', 'Cannot read properties of undefined (reading ''price'')', 'TypeError at VDP.tsx:42', '/inventory/VIN123', 'sess-001', NOW() - INTERVAL '1 day')
       ON CONFLICT DO NOTHING`,
      ["err-demo-001", DEMO_DEALER_ID],
    );
    console.log("[seed] 1 client error inserted.");

    // -- Deliveries ---------------------------------------------------------------
    await client.query(
      `INSERT INTO deliveries (id, dealer_id, vehicle_vin, customer_name, customer_phone, delivery_address, status, slot_date, slot_time, fee, distance_miles)
       VALUES ($1, $2, '1HGCV1F34PA000001', 'Sarah Chen', '(919) 555-0201', '100 Fayetteville St, Raleigh NC 27601', 'scheduled', CURRENT_DATE + 3, '10:00 AM', 199.00, 12.5)
       ON CONFLICT DO NOTHING`,
      ["del-demo-001", DEMO_DEALER_ID],
    );
    console.log("[seed] 1 delivery inserted.");

    // -- Vehicle delivery tracker -------------------------------------------------
    await client.query(
      `INSERT INTO vehicle_delivery_tracker (id, dealer_id, vin, current_stage, milestones, vehicle_info, acquired_at)
       VALUES ($1, $2, '5YJSA1E26PF000002', 'photos', $3, $4, NOW() - INTERVAL '5 days')
       ON CONFLICT DO NOTHING`,
      [
        "vdt-demo-001", DEMO_DEALER_ID,
        JSON.stringify([
          { stage: "acquired", timestamp: new Date(Date.now() - 5 * 86400000).toISOString() },
          { stage: "in_transit", timestamp: new Date(Date.now() - 4 * 86400000).toISOString() },
          { stage: "arrived", timestamp: new Date(Date.now() - 3 * 86400000).toISOString() },
          { stage: "inspection", timestamp: new Date(Date.now() - 2 * 86400000).toISOString() },
          { stage: "reconditioning", timestamp: new Date(Date.now() - 1 * 86400000).toISOString() },
          { stage: "photos", timestamp: new Date().toISOString() },
        ]),
        JSON.stringify({ year: 2025, make: "Tesla", model: "Model 3", stockNumber: "WP-002" }),
      ],
    );
    console.log("[seed] 1 vehicle pipeline entry inserted.");

    // -- Walkarounds + segments ---------------------------------------------------
    await client.query(
      `INSERT INTO walkarounds (id, dealer_id, vin, status, metadata, created_by, published_at)
       VALUES ($1, $2, '1FTEW1EP0PFA00007', 'published', $3, 'admin', NOW() - INTERVAL '1 day')
       ON CONFLICT DO NOTHING`,
      [
        "wk-demo-001", DEMO_DEALER_ID,
        JSON.stringify({ totalDuration: 120, segmentCount: 3, completeness: 37.5, lastUpdated: new Date().toISOString() }),
      ],
    );
    await client.query(
      `INSERT INTO walkaround_segments (id, walkaround_id, segment_type, url, thumbnail_url, duration_seconds)
       VALUES ('wks-001', 'wk-demo-001', 'exterior_front', '/videos/f150-front.mp4', '/thumbs/f150-front.jpg', 45),
              ('wks-002', 'wk-demo-001', 'interior', '/videos/f150-interior.mp4', '/thumbs/f150-interior.jpg', 40),
              ('wks-003', 'wk-demo-001', 'engine', '/videos/f150-engine.mp4', '/thumbs/f150-engine.jpg', 35)
       ON CONFLICT DO NOTHING`,
    );
    console.log("[seed] 1 walkaround + 3 segments inserted.");

    // -- Customer touchpoints (omnichannel) ---------------------------------------
    await client.query(
      `INSERT INTO customer_touchpoints (id, dealer_id, customer_id, channel, timestamp, summary, metadata)
       VALUES ($1, $2, 'cust-seed-001', 'online', NOW() - INTERVAL '7 days', 'Browsed inventory, viewed 3 vehicles', $3),
              ($4, $2, 'cust-seed-001', 'phone', NOW() - INTERVAL '5 days', 'Called about F-150 pricing', $5),
              ($6, $2, 'cust-seed-001', 'in_store', NOW() - INTERVAL '2 days', 'Visited for test drive', $7)
       ON CONFLICT DO NOTHING`,
      [
        "tp-demo-001", DEMO_DEALER_ID, JSON.stringify({ vehicles_viewed: 3, time_on_site: 420 }),
        "tp-demo-002", JSON.stringify({ duration_seconds: 180, outcome: "appointment_set" }),
        "tp-demo-003", JSON.stringify({ vehicles_driven: ["F-150 XLT"], salesperson: "Mike" }),
      ],
    );
    console.log("[seed] 3 customer touchpoints inserted.");

    // -- Call recordings ----------------------------------------------------------
    await client.query(
      `INSERT INTO call_recordings (id, dealer_id, phone_number, direction, duration_sec, transcript, sentiment, quality_score, keywords, outcome, recorded_at)
       VALUES ($1, $2, '(919) 555-0201', 'inbound', 245, 'Customer called about the F-150 XLT pricing. Discussed financing options and scheduled a test drive for Saturday.', 'positive', 82.5, $3, 'appointment_set', NOW() - INTERVAL '3 days')
       ON CONFLICT DO NOTHING`,
      [
        "call-demo-001", DEMO_DEALER_ID,
        JSON.stringify(["F-150", "financing", "test drive", "Saturday"]),
      ],
    );
    console.log("[seed] 1 call recording inserted.");

    await client.query("COMMIT");
    console.log("[seed] Done.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// CLI entry point
if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[seed] Error:", err);
      process.exit(1);
    });
}
