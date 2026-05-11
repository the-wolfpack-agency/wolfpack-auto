#!/usr/bin/env npx tsx
/**
 * Comprehensive demo dealer seed.
 *
 * Creates "Wolfpack Demo Motors" (slug: wolfpack-demo) ready for sales
 * demos. Populates every module a prospect will likely click into:
 * staff, inventory, leads across the funnel, deals in flight, service
 * appointments, F&I deals, and analytics events.
 *
 * Idempotent. Re-running produces the same end state. Use --reset to
 * wipe the demo dealer's data before reseeding.
 *
 * Usage:
 *   npx tsx scripts/seed-demo-dealer.ts [--reset]
 *
 * Reads DATABASE_URL from .env.local if present.
 */

import { createHash } from "crypto";
import { Client, type ClientConfig } from "pg";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Env bootstrap (.env.local)
// ---------------------------------------------------------------------------

function loadEnvLocal(): void {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEMO_DEALER_ID = "00000000-0000-4000-c000-000000000777";
export const DEMO_DEALER_SLUG = "wolfpack-demo";
export const DEMO_DEALER_NAME = "Wolfpack Demo Motors";
export const DEMO_ADMIN_EMAIL = "demo-admin@wolfpackauto.test";

// ---------------------------------------------------------------------------
// Deterministic random helpers (so re-runs produce identical data)
// ---------------------------------------------------------------------------

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function deterministicUUID(namespace: string, idx: number): string {
  // RFC 4122 v4-shaped string built from a hash of namespace plus idx so
  // re-running the seed yields the same UUIDs. Idempotency relies on this
  // for joins between dependent rows.
  const hash = createHash("sha256")
    .update(`${namespace}:${idx}`)
    .digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),
    "a" + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

function daysAgo(n: number, hour = 10, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function daysFromNow(n: number, hour = 10, minute = 0): Date {
  return daysAgo(-n, hour, minute);
}

// ---------------------------------------------------------------------------
// Dealer record
// ---------------------------------------------------------------------------

const DEALER = {
  id: DEMO_DEALER_ID,
  name: DEMO_DEALER_NAME,
  slug: DEMO_DEALER_SLUG,
  subdomain: DEMO_DEALER_SLUG,
  phone: "(919) 555-7777",
  email: "hello@wolfpackdemo.test",
  website_url: "https://demo.wolfpackauto.test",
  address: {
    street: "1 Demo Lane",
    city: "Raleigh",
    state: "NC",
    zip: "27601",
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
    primary_color: "#0070c7",
    secondary_color: "#054c85",
    accent_color: "#f97316",
    logo_url: null,
    font_family: "Inter",
  },
  has_service_center: true,
  has_financing: true,
  has_trade_in: true,
};

// ---------------------------------------------------------------------------
// Staff (5)
// ---------------------------------------------------------------------------

interface DemoStaff {
  email: string;
  name: string;
  role: "owner" | "admin" | "manager" | "staff";
  title: string;
}

const STAFF: DemoStaff[] = [
  { email: DEMO_ADMIN_EMAIL, name: "Avery Stone", role: "owner", title: "Dealer Principal" },
  { email: "morgan.lee@wolfpackdemo.test", name: "Morgan Lee", role: "manager", title: "General Sales Manager" },
  { email: "jordan.rivera@wolfpackdemo.test", name: "Jordan Rivera", role: "manager", title: "F&I Manager" },
  { email: "casey.nguyen@wolfpackdemo.test", name: "Casey Nguyen", role: "staff", title: "Senior Sales Consultant" },
  { email: "taylor.brooks@wolfpackdemo.test", name: "Taylor Brooks", role: "staff", title: "Sales Consultant" },
];

// ---------------------------------------------------------------------------
// Vehicles (75) -- generated procedurally so the file stays maintainable
// ---------------------------------------------------------------------------

interface DemoVehicle {
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
  msrp: number;
  price: number;
  internet_price: number;
  condition: string;
  mileage: number;
  status: string;
  description: string;
  features: string[];
}

interface VehicleTemplate {
  year_base: number;
  make: string;
  model: string;
  trim: string;
  body_style: string;
  engine: string;
  transmission: string;
  drivetrain: string;
  fuel_type: string;
  mpg_city: number | null;
  mpg_highway: number | null;
  base_price: number;
}

// Synthetic templates only. Prices and trims are generic / non-rare so no
// real listing is reproducible.
const TEMPLATES: VehicleTemplate[] = [
  // Sedans
  { year_base: 2025, make: "Honda", model: "Accord", trim: "Sport", body_style: "Sedan", engine: "1.5L Turbo I4", transmission: "cvt", drivetrain: "fwd", fuel_type: "gasoline", mpg_city: 29, mpg_highway: 37, base_price: 31000 },
  { year_base: 2024, make: "Toyota", model: "Camry", trim: "LE", body_style: "Sedan", engine: "2.5L I4", transmission: "automatic", drivetrain: "fwd", fuel_type: "gasoline", mpg_city: 28, mpg_highway: 39, base_price: 27500 },
  { year_base: 2024, make: "Nissan", model: "Altima", trim: "SV", body_style: "Sedan", engine: "2.5L I4", transmission: "cvt", drivetrain: "fwd", fuel_type: "gasoline", mpg_city: 28, mpg_highway: 39, base_price: 28000 },
  { year_base: 2023, make: "Hyundai", model: "Sonata", trim: "SEL", body_style: "Sedan", engine: "2.5L I4", transmission: "automatic", drivetrain: "fwd", fuel_type: "gasoline", mpg_city: 27, mpg_highway: 36, base_price: 25500 },
  { year_base: 2024, make: "Mazda", model: "Mazda3", trim: "Premium", body_style: "Sedan", engine: "2.5L I4", transmission: "automatic", drivetrain: "fwd", fuel_type: "gasoline", mpg_city: 28, mpg_highway: 36, base_price: 26000 },
  // SUVs
  { year_base: 2025, make: "Toyota", model: "RAV4", trim: "XLE", body_style: "SUV", engine: "2.5L I4", transmission: "automatic", drivetrain: "awd", fuel_type: "gasoline", mpg_city: 27, mpg_highway: 35, base_price: 34000 },
  { year_base: 2024, make: "Honda", model: "CR-V", trim: "EX", body_style: "SUV", engine: "1.5L Turbo I4", transmission: "cvt", drivetrain: "awd", fuel_type: "gasoline", mpg_city: 28, mpg_highway: 34, base_price: 35000 },
  { year_base: 2024, make: "Chevrolet", model: "Equinox", trim: "LT", body_style: "SUV", engine: "1.5L Turbo I4", transmission: "automatic", drivetrain: "awd", fuel_type: "gasoline", mpg_city: 26, mpg_highway: 31, base_price: 30500 },
  { year_base: 2024, make: "Hyundai", model: "Tucson", trim: "SEL", body_style: "SUV", engine: "2.5L I4", transmission: "automatic", drivetrain: "awd", fuel_type: "gasoline", mpg_city: 24, mpg_highway: 29, base_price: 31000 },
  { year_base: 2023, make: "Mazda", model: "CX-5", trim: "Touring", body_style: "SUV", engine: "2.5L I4", transmission: "automatic", drivetrain: "awd", fuel_type: "gasoline", mpg_city: 25, mpg_highway: 31, base_price: 32000 },
  { year_base: 2025, make: "Subaru", model: "Outback", trim: "Premium", body_style: "SUV", engine: "2.5L I4", transmission: "cvt", drivetrain: "awd", fuel_type: "gasoline", mpg_city: 26, mpg_highway: 32, base_price: 33500 },
  // Trucks
  { year_base: 2025, make: "Ford", model: "F-150", trim: "XLT", body_style: "Truck", engine: "2.7L EcoBoost V6", transmission: "automatic", drivetrain: "4wd", fuel_type: "gasoline", mpg_city: 20, mpg_highway: 26, base_price: 46000 },
  { year_base: 2024, make: "Chevrolet", model: "Silverado 1500", trim: "LT", body_style: "Truck", engine: "5.3L V8", transmission: "automatic", drivetrain: "4wd", fuel_type: "gasoline", mpg_city: 16, mpg_highway: 22, base_price: 52000 },
  { year_base: 2024, make: "Toyota", model: "Tacoma", trim: "SR5", body_style: "Truck", engine: "2.4L Turbo I4", transmission: "automatic", drivetrain: "4wd", fuel_type: "gasoline", mpg_city: 21, mpg_highway: 26, base_price: 38000 },
  { year_base: 2025, make: "Ram", model: "1500", trim: "Big Horn", body_style: "Truck", engine: "3.6L V6", transmission: "automatic", drivetrain: "4wd", fuel_type: "gasoline", mpg_city: 19, mpg_highway: 24, base_price: 49000 },
  // EVs
  { year_base: 2025, make: "Tesla", model: "Model 3", trim: "Long Range", body_style: "Sedan", engine: "Dual Motor Electric", transmission: "automatic", drivetrain: "awd", fuel_type: "electric", mpg_city: null, mpg_highway: null, base_price: 47000 },
  { year_base: 2024, make: "Tesla", model: "Model Y", trim: "Long Range", body_style: "SUV", engine: "Dual Motor Electric", transmission: "automatic", drivetrain: "awd", fuel_type: "electric", mpg_city: null, mpg_highway: null, base_price: 49500 },
  { year_base: 2024, make: "Hyundai", model: "Ioniq 5", trim: "SEL", body_style: "SUV", engine: "Single Motor Electric", transmission: "automatic", drivetrain: "rwd", fuel_type: "electric", mpg_city: null, mpg_highway: null, base_price: 46500 },
  { year_base: 2024, make: "Kia", model: "EV6", trim: "Wind", body_style: "SUV", engine: "Single Motor Electric", transmission: "automatic", drivetrain: "rwd", fuel_type: "electric", mpg_city: null, mpg_highway: null, base_price: 45000 },
  { year_base: 2025, make: "Ford", model: "Mustang Mach-E", trim: "Select", body_style: "SUV", engine: "Single Motor Electric", transmission: "automatic", drivetrain: "rwd", fuel_type: "electric", mpg_city: null, mpg_highway: null, base_price: 44500 },
];

const COLORS = [
  ["Pearl White", "Black"],
  ["Crystal Black", "Beige"],
  ["Lunar Silver", "Black"],
  ["Steel Blue", "Gray"],
  ["Crimson Red", "Black"],
  ["Forest Green", "Tan"],
  ["Storm Gray", "Charcoal"],
];

export function syntheticVin(idx: number): string {
  // Build a synthetic 17-char string in the VIN character set. Not a real
  // VIN, by construction. Different every idx but stable across runs.
  const alphabet = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  const hash = createHash("sha256").update(`demo-vin:${idx}`).digest("hex");
  let out = "";
  for (let i = 0; i < 17; i++) {
    const byte = parseInt(hash.slice(i * 2, i * 2 + 2), 16);
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

export function buildVehicles(count: number): DemoVehicle[] {
  const rng = seededRandom(42);
  const out: DemoVehicle[] = [];
  for (let i = 0; i < count; i++) {
    const tpl = TEMPLATES[i % TEMPLATES.length];
    const yearOffset = Math.floor(rng() * 3);
    const year = tpl.year_base - yearOffset;
    const isNew = yearOffset === 0 && rng() > 0.35;
    const condition = isNew ? "new" : rng() > 0.55 ? "certified" : "used";
    const mileage = condition === "new" ? Math.floor(rng() * 40) + 5 : Math.floor(rng() * 60000) + 5000;
    const msrp = tpl.base_price + Math.floor(rng() * 4000) - 1000;
    const discount = isNew ? 800 + Math.floor(rng() * 1500) : 2500 + Math.floor(rng() * 4500);
    const price = msrp - discount;
    const colorPair = COLORS[i % COLORS.length];
    const statuses = ["available", "available", "available", "available", "pending", "sold"];
    const status = statuses[Math.floor(rng() * statuses.length)];
    out.push({
      vin: syntheticVin(i),
      stock_number: `WD-${String(i + 1).padStart(3, "0")}`,
      year,
      make: tpl.make,
      model: tpl.model,
      trim: tpl.trim,
      body_style: tpl.body_style,
      exterior_color: colorPair[0],
      interior_color: colorPair[1],
      engine: tpl.engine,
      transmission: tpl.transmission,
      drivetrain: tpl.drivetrain,
      fuel_type: tpl.fuel_type,
      mpg_city: tpl.mpg_city,
      mpg_highway: tpl.mpg_highway,
      msrp,
      price,
      internet_price: price - Math.floor(rng() * 500) - 200,
      condition,
      mileage,
      status,
      description: `${year} ${tpl.make} ${tpl.model} ${tpl.trim}. Reliable, well-equipped, and dealer-inspected.`,
      features: ["Bluetooth", "Backup Camera", "Apple CarPlay", "Android Auto", "Lane Keep Assist"],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Leads (40) -- spread across the funnel
// ---------------------------------------------------------------------------

interface DemoLead {
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
  days_ago: number;
}

const FIRST_NAMES = [
  "Alex", "Jamie", "Riley", "Quinn", "Cameron", "Drew", "Hayden", "Logan",
  "Reese", "Sage", "Emerson", "Finley", "Harper", "Kendall", "Parker",
  "Rowan", "Spencer", "Tatum", "Wren", "Blake", "Charlie", "Devon",
  "Elliot", "Frankie", "Gray", "Indigo", "Jordan", "Kai", "Lennon", "Marlowe",
  "Noa", "Oakley", "Phoenix", "River", "Skyler", "Toni", "Val", "Wesley",
  "Yael", "Zion",
];

const LAST_NAMES = [
  "Adams", "Bennett", "Carter", "Diaz", "Ellis", "Foster", "Gallagher",
  "Hampton", "Iverson", "Jensen", "Knox", "Lambert", "Mendez", "Navarro",
  "Owens", "Patel", "Quinn", "Russo", "Stafford", "Tanaka", "Underwood",
  "Vargas", "Walsh", "Xu", "Yates", "Zhang", "Barnes", "Cohen", "Dale",
  "Estrada", "Flynn", "Garber", "Hart", "Ishida", "Joyce", "Kerns",
  "Lopez", "Mahoney", "Nash", "Ortega",
];

const SOURCES = ["website_form", "vdp_inquiry", "chat", "phone", "walk_in", "third_party"];
const STATUSES = [
  "new",
  "contacted",
  "appointment_scheduled",
  "test_drive_completed",
  "in_negotiation",
  "sold",
  "lost",
];

export function buildLeads(count: number, vehicles: DemoVehicle[]): DemoLead[] {
  const rng = seededRandom(101);
  const out: DemoLead[] = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 7) % LAST_NAMES.length];
    const v = vehicles[i % vehicles.length];
    // Realistic funnel distribution: more new and contacted than sold/lost.
    const funnelRoll = rng();
    let status: string;
    if (funnelRoll < 0.22) status = "new";
    else if (funnelRoll < 0.45) status = "contacted";
    else if (funnelRoll < 0.6) status = "appointment_scheduled";
    else if (funnelRoll < 0.72) status = "test_drive_completed";
    else if (funnelRoll < 0.82) status = "in_negotiation";
    else if (funnelRoll < 0.92) status = "sold";
    else status = "lost";
    out.push({
      first_name: first,
      last_name: last,
      email: `${first}.${last}.${i}@demo.wolfpackauto.test`.toLowerCase(),
      phone: rng() > 0.15 ? `(919) 555-${String(1000 + i).slice(-4)}` : null,
      vehicle_interest: `${v.year} ${v.make} ${v.model} ${v.trim}`,
      source: SOURCES[i % SOURCES.length],
      status,
      notes: `Interested in ${v.make} ${v.model}. Follow up per script.`,
      utm_source: rng() > 0.4 ? ["google", "facebook", "direct", "referral"][i % 4] : null,
      utm_medium: rng() > 0.4 ? ["cpc", "social", "organic", "email"][i % 4] : null,
      utm_campaign: rng() > 0.5 ? "spring-demo-2026" : null,
      days_ago: Math.floor(rng() * 90),
    });
  }
  // Guarantee status diversity: force at least one of each status. Mutate
  // the first len(STATUSES) entries.
  for (let i = 0; i < STATUSES.length && i < out.length; i++) {
    out[i].status = STATUSES[i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deals (12) -- across draft to funded
// ---------------------------------------------------------------------------

interface DemoDeal {
  lead_idx: number;
  vehicle_idx: number;
  deal_type: "retail" | "lease" | "cash";
  status: "draft" | "presented" | "accepted" | "funded";
  front_gross: number;
  back_gross: number;
  funded_days_ago: number | null;
}

export function buildDeals(count: number, vehicles: DemoVehicle[], leads: DemoLead[]): DemoDeal[] {
  const rng = seededRandom(303);
  const out: DemoDeal[] = [];
  const statusOrder: DemoDeal["status"][] = ["draft", "presented", "accepted", "funded"];
  for (let i = 0; i < count; i++) {
    const status = statusOrder[i % statusOrder.length];
    out.push({
      lead_idx: i % leads.length,
      vehicle_idx: i % vehicles.length,
      deal_type: rng() > 0.85 ? "cash" : rng() > 0.7 ? "lease" : "retail",
      status,
      front_gross: 1500 + Math.floor(rng() * 3500),
      back_gross: 800 + Math.floor(rng() * 2200),
      funded_days_ago: status === "funded" ? Math.floor(rng() * 60) + 1 : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Service appointments (25): past 30d + future 14d
// ---------------------------------------------------------------------------

interface DemoServiceAppt {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  vehicle_vin: string;
  vehicle_desc: string;
  service_type: "maintenance" | "repair" | "recall" | "inspection" | "detail";
  description: string;
  scheduled_at: Date;
  status: string;
  assigned_tech: string;
}

export function buildServiceAppointments(vehicles: DemoVehicle[]): DemoServiceAppt[] {
  const rng = seededRandom(505);
  const techs = ["Reggie Walker", "Sam Castillo", "Priya Sharma"];
  const types: DemoServiceAppt["service_type"][] = ["maintenance", "repair", "recall", "inspection", "detail"];
  const out: DemoServiceAppt[] = [];
  // 16 past appointments
  for (let i = 0; i < 16; i++) {
    const v = vehicles[i % vehicles.length];
    const t = types[i % types.length];
    out.push({
      customer_name: `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`,
      customer_email: `service-cust-${i}@demo.wolfpackauto.test`,
      customer_phone: `(919) 555-${String(2000 + i).slice(-4)}`,
      vehicle_vin: v.vin,
      vehicle_desc: `${v.year} ${v.make} ${v.model}`,
      service_type: t,
      description:
        t === "maintenance" ? "Routine maintenance and multi-point inspection." :
        t === "repair" ? "Diagnostic and repair." :
        t === "recall" ? "Manufacturer recall fulfillment." :
        t === "inspection" ? "State inspection." :
        "Interior and exterior detail.",
      scheduled_at: daysAgo(Math.floor(rng() * 30) + 1, 9 + (i % 8), 0),
      status: rng() > 0.1 ? "completed" : "no_show",
      assigned_tech: techs[i % techs.length],
    });
  }
  // 9 future appointments
  for (let i = 0; i < 9; i++) {
    const v = vehicles[(i + 17) % vehicles.length];
    const t = types[i % types.length];
    out.push({
      customer_name: `${FIRST_NAMES[(i + 20) % FIRST_NAMES.length]} ${LAST_NAMES[(i + 20) % LAST_NAMES.length]}`,
      customer_email: `service-future-${i}@demo.wolfpackauto.test`,
      customer_phone: `(919) 555-${String(3000 + i).slice(-4)}`,
      vehicle_vin: v.vin,
      vehicle_desc: `${v.year} ${v.make} ${v.model}`,
      service_type: t,
      description: "Customer-requested appointment.",
      scheduled_at: daysFromNow(Math.floor(rng() * 14) + 1, 9 + (i % 8), 0),
      status: "scheduled",
      assigned_tech: techs[i % techs.length],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// F&I deals (8) -- synthesized as deal_worksheets with rich fi_products
// ---------------------------------------------------------------------------

interface DemoFiDeal {
  lead_idx: number;
  vehicle_idx: number;
  deal_type: "retail" | "lease";
  term_months: number;
  apr: number | null;
  monthly_payment: number;
  fi_products: Array<{ name: string; cost: number; retail: number; term: number }>;
  status: "draft" | "presented" | "accepted" | "funded";
}

export function buildFiDeals(_vehicles: DemoVehicle[], _leads: DemoLead[]): DemoFiDeal[] {
  const rng = seededRandom(707);
  const products = [
    { name: "Extended Warranty", cost: 650, retail: 1995, term: 60 },
    { name: "GAP Coverage", cost: 220, retail: 695, term: 60 },
    { name: "Tire and Wheel", cost: 180, retail: 599, term: 60 },
    { name: "Paint Protection", cost: 320, retail: 895, term: 0 },
    { name: "Prepaid Maintenance", cost: 400, retail: 1295, term: 36 },
  ];
  const statuses: DemoFiDeal["status"][] = ["funded", "funded", "accepted", "presented", "presented", "draft", "funded", "accepted"];
  const out: DemoFiDeal[] = [];
  for (let i = 0; i < 8; i++) {
    const dealType: "retail" | "lease" = i % 4 === 3 ? "lease" : "retail";
    const productCount = 1 + Math.floor(rng() * 3);
    const selectedProducts = products.slice(0, productCount);
    out.push({
      lead_idx: i,
      vehicle_idx: i + 5,
      deal_type: dealType,
      term_months: dealType === "lease" ? 36 : 60 + Math.floor(rng() * 12),
      apr: dealType === "lease" ? null : 4.49 + rng() * 3,
      monthly_payment: 300 + Math.floor(rng() * 400),
      fi_products: selectedProducts,
      status: statuses[i],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Analytics events: enough volume + variety to power funnel-health and
// dataflow-health surfaces.
// ---------------------------------------------------------------------------

interface DemoAnalyticsEvent {
  event_type: string;
  action: string;
  page: string;
  days_ago: number;
}

export function buildAnalyticsEvents(): DemoAnalyticsEvent[] {
  const out: DemoAnalyticsEvent[] = [];
  const actions = [
    { event_type: "inventory", action: "vehicle.viewed", page: "/inventory" },
    { event_type: "inventory", action: "vdp.viewed", page: "/inventory/detail" },
    { event_type: "lead", action: "lead.created", page: "/contact" },
    { event_type: "lead", action: "lead.scored", page: "/admin/leads" },
    { event_type: "lead", action: "lead.status_changed", page: "/admin/leads" },
    { event_type: "deal", action: "deal.created", page: "/admin/deals" },
    { event_type: "deal", action: "deal.funded", page: "/admin/deals" },
    { event_type: "fi", action: "fi.product_presented", page: "/admin/deals/fi-menu" },
    { event_type: "fi", action: "fi.product_accepted", page: "/admin/deals/fi-menu" },
    { event_type: "service", action: "service.appointment_created", page: "/service-booking" },
    { event_type: "service", action: "service.appointment_completed", page: "/admin/service" },
    { event_type: "trade_in", action: "trade.evaluation_requested", page: "/trade-in" },
    { event_type: "compliance", action: "ofac.screening_passed", page: "/admin/compliance" },
    { event_type: "comms", action: "email.sent", page: "/admin/comms" },
    { event_type: "comms", action: "sms.sent", page: "/admin/comms" },
  ];
  // 6 events per action across the last 30 days
  for (const a of actions) {
    for (let i = 0; i < 6; i++) {
      out.push({ ...a, days_ago: Math.floor(((i + 1) * 30) / 6) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wipe (--reset) -- deletes the demo dealer's children, then the dealer
// ---------------------------------------------------------------------------

const CHILD_TABLES_TO_WIPE = [
  "analytics_events", // by metadata.dealer_id (matches seed-test-dealer style)
  "service_appointments",
  "deal_worksheets",
  "leads",
  "vehicles",
  "dealer_users",
];

async function wipeDealer(client: Client, dealerId: string): Promise<void> {
  for (const table of CHILD_TABLES_TO_WIPE) {
    if (table === "analytics_events") {
      await client.query(
        `DELETE FROM analytics_events WHERE metadata->>'dealer_id' = $1`,
        [dealerId],
      );
    } else {
      await client.query(`DELETE FROM ${table} WHERE dealer_id = $1`, [dealerId]);
    }
  }
  await client.query(`DELETE FROM dealers WHERE id = $1`, [dealerId]);
}

// ---------------------------------------------------------------------------
// Main seed
// ---------------------------------------------------------------------------

export interface SeedSummary {
  dealer_id: string;
  dealer_slug: string;
  staff: number;
  vehicles: number;
  leads: number;
  deals: number;
  service_appointments: number;
  fi_deals: number;
  analytics_events: number;
}

export interface SeedOptions {
  reset?: boolean;
  /** Override DATABASE_URL for tests; falls back to process.env.DATABASE_URL. */
  databaseUrl?: string;
  /** Override the dealer id (test isolation). */
  dealerId?: string;
  /** Override the dealer slug. */
  dealerSlug?: string;
  /** Silence console output (tests). */
  quiet?: boolean;
}

export async function seedDemoDealer(options: SeedOptions = {}): Promise<SeedSummary> {
  const dbUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error("DATABASE_URL not set. Configure .env.local or export it.");
  }
  const log = options.quiet ? () => {} : (msg: string) => console.log(msg);

  const clientConfig: ClientConfig = { connectionString: dbUrl };
  const client = new Client(clientConfig);
  await client.connect();

  const dealerId = options.dealerId ?? DEMO_DEALER_ID;
  const dealerSlug = options.dealerSlug ?? DEMO_DEALER_SLUG;
  const dealer = { ...DEALER, id: dealerId, slug: dealerSlug, subdomain: dealerSlug };

  try {
    if (options.reset) {
      log(`[seed] Resetting demo dealer ${dealerId}.`);
      await wipeDealer(client, dealerId);
    }

    await client.query("BEGIN");

    // ---- Dealer ---------------------------------------------------------
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
        dealer.id, dealer.name, dealer.slug, dealer.subdomain,
        dealer.phone, dealer.email, dealer.website_url,
        JSON.stringify(dealer.address), JSON.stringify(dealer.sales_hours),
        JSON.stringify(dealer.service_hours), JSON.stringify(dealer.branding),
        dealer.has_service_center, dealer.has_financing, dealer.has_trade_in,
      ],
    );

    // ---- Staff ----------------------------------------------------------
    for (let i = 0; i < STAFF.length; i++) {
      const s = STAFF[i];
      const userId = deterministicUUID(`${dealerId}:staff`, i);
      await client.query(
        `INSERT INTO dealer_users (id, dealer_id, email, name, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (email) DO UPDATE SET
           dealer_id = EXCLUDED.dealer_id,
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           is_active = true,
           updated_at = NOW()`,
        [userId, dealerId, s.email, s.name, "demo:not-a-real-hash", s.role],
      );
    }

    // ---- Vehicles -------------------------------------------------------
    const vehicles = buildVehicles(75);
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const vehicleId = deterministicUUID(`${dealerId}:vehicle`, i);
      await client.query(
        `INSERT INTO vehicles (
          id, dealer_id, vin, stock_number,
          year, make, model, trim, body_style, exterior_color, interior_color,
          engine, transmission, drivetrain, fuel_type, mpg_city, mpg_highway,
          msrp, price, internet_price,
          condition, mileage, status, description, features
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
        ON CONFLICT (dealer_id, vin) DO UPDATE SET
          stock_number = EXCLUDED.stock_number,
          price = EXCLUDED.price,
          internet_price = EXCLUDED.internet_price,
          status = EXCLUDED.status,
          mileage = EXCLUDED.mileage,
          updated_at = NOW()`,
        [
          vehicleId, dealerId, v.vin, v.stock_number,
          v.year, v.make, v.model, v.trim, v.body_style, v.exterior_color, v.interior_color,
          v.engine, v.transmission, v.drivetrain, v.fuel_type, v.mpg_city, v.mpg_highway,
          v.msrp, v.price, v.internet_price,
          v.condition, v.mileage, v.status, v.description, JSON.stringify(v.features),
        ],
      );
    }

    // ---- Leads ----------------------------------------------------------
    const leads = buildLeads(40, vehicles);
    const leadIdsByIdx: string[] = [];
    for (let i = 0; i < leads.length; i++) {
      const l = leads[i];
      const leadId = deterministicUUID(`${dealerId}:lead`, i);
      leadIdsByIdx.push(leadId);
      const created = daysAgo(l.days_ago);
      // Upsert via DELETE-by-email then INSERT to keep this idempotent
      // without depending on a unique constraint that may not exist.
      await client.query(
        `DELETE FROM leads WHERE dealer_id = $1 AND email = $2`,
        [dealerId, l.email],
      );
      await client.query(
        `INSERT INTO leads (
          id, dealer_id, first_name, last_name, email, phone,
          vehicle_interest, source, status, notes,
          utm_source, utm_medium, utm_campaign,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          leadId, dealerId,
          l.first_name, l.last_name, l.email, l.phone,
          l.vehicle_interest, l.source, l.status, l.notes,
          l.utm_source, l.utm_medium, l.utm_campaign,
          created.toISOString(), created.toISOString(),
        ],
      );
    }

    // ---- Deals (12) -----------------------------------------------------
    const deals = buildDeals(12, vehicles, leads);
    // Idempotent: clear prior deals for this dealer so re-runs do not double-count.
    await client.query(`DELETE FROM deal_worksheets WHERE dealer_id = $1`, [dealerId]);
    for (let i = 0; i < deals.length; i++) {
      const d = deals[i];
      const dealId = deterministicUUID(`${dealerId}:deal`, i);
      const v = vehicles[d.vehicle_idx];
      const leadId = leadIdsByIdx[d.lead_idx];
      const sellingPrice = v.price;
      const totalGross = d.front_gross + d.back_gross;
      const fundedAt = d.funded_days_ago !== null ? daysAgo(d.funded_days_ago).toISOString() : null;
      await client.query(
        `INSERT INTO deal_worksheets (
          id, dealer_id, lead_id, vehicle_vin, deal_type,
          selling_price, invoice_cost, trade_value, trade_payoff,
          down_payment, rebates, term_months, apr, monthly_payment,
          fi_products, fi_total, front_gross, back_gross, total_gross,
          status, funded_at, salesperson, fi_manager, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
        [
          dealId, dealerId, leadId, v.vin, d.deal_type,
          sellingPrice, Math.round(sellingPrice * 0.9), 0, 0,
          Math.round(sellingPrice * 0.1), 0, d.deal_type === "lease" ? 36 : 60,
          d.deal_type === "lease" ? null : 5.49,
          d.deal_type === "cash" ? null : Math.round(sellingPrice / 60),
          JSON.stringify([]),
          0, d.front_gross, d.back_gross, totalGross,
          d.status, fundedAt, "Casey Nguyen", "Jordan Rivera",
          "Demo dealer worksheet.",
        ],
      );
    }

    // ---- F&I deals (8) -- additional rich worksheets ---------------------
    const fiDeals = buildFiDeals(vehicles, leads);
    for (let i = 0; i < fiDeals.length; i++) {
      const f = fiDeals[i];
      const dealId = deterministicUUID(`${dealerId}:fideal`, i);
      const v = vehicles[f.vehicle_idx];
      const leadId = leadIdsByIdx[f.lead_idx];
      const fiTotal = f.fi_products.reduce((acc, p) => acc + p.retail, 0);
      const fiCost = f.fi_products.reduce((acc, p) => acc + p.cost, 0);
      const backGross = fiTotal - fiCost;
      await client.query(
        `INSERT INTO deal_worksheets (
          id, dealer_id, lead_id, vehicle_vin, deal_type,
          selling_price, invoice_cost, trade_value, trade_payoff,
          down_payment, rebates, term_months, apr, monthly_payment,
          fi_products, fi_total, front_gross, back_gross, total_gross,
          status, salesperson, fi_manager, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
        ON CONFLICT (id) DO NOTHING`,
        [
          dealId, dealerId, leadId, v.vin, f.deal_type,
          v.price, Math.round(v.price * 0.9), 2500, 1200,
          Math.round(v.price * 0.15), 500, f.term_months, f.apr, f.monthly_payment,
          JSON.stringify(f.fi_products), fiTotal, 2200, backGross, 2200 + backGross,
          f.status, "Taylor Brooks", "Jordan Rivera",
          "F&I worksheet with multi-product menu.",
        ],
      );
    }

    // ---- Service appointments (25) -------------------------------------
    await client.query(`DELETE FROM service_appointments WHERE dealer_id = $1`, [dealerId]);
    const serviceAppts = buildServiceAppointments(vehicles);
    for (let i = 0; i < serviceAppts.length; i++) {
      const sa = serviceAppts[i];
      const apptId = deterministicUUID(`${dealerId}:svc`, i);
      await client.query(
        `INSERT INTO service_appointments (
          id, dealer_id, customer_name, customer_email, customer_phone,
          vehicle_vin, vehicle_desc, service_type, description,
          scheduled_at, estimated_duration_min, status, assigned_tech
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          apptId, dealerId, sa.customer_name, sa.customer_email, sa.customer_phone,
          sa.vehicle_vin, sa.vehicle_desc, sa.service_type, sa.description,
          sa.scheduled_at.toISOString(), 60, sa.status, sa.assigned_tech,
        ],
      );
    }

    // ---- Analytics events ----------------------------------------------
    await client.query(
      `DELETE FROM analytics_events WHERE metadata->>'dealer_id' = $1 AND metadata->>'source' = 'seed-demo-dealer'`,
      [dealerId],
    );
    const analyticsEvents = buildAnalyticsEvents();
    for (let i = 0; i < analyticsEvents.length; i++) {
      const ae = analyticsEvents[i];
      const ts = daysAgo(ae.days_ago);
      await client.query(
        `INSERT INTO analytics_events (event_type, action, page, session_id, user_fingerprint, timestamp, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          ae.event_type, ae.action, ae.page,
          `demo-session-${i % 12}`,
          `demo-fp-${i % 30}`,
          ts.toISOString(),
          JSON.stringify({ dealer_id: dealerId, source: "seed-demo-dealer" }),
        ],
      );
    }

    await client.query("COMMIT");

    const summary: SeedSummary = {
      dealer_id: dealerId,
      dealer_slug: dealerSlug,
      staff: STAFF.length,
      vehicles: vehicles.length,
      leads: leads.length,
      deals: deals.length,
      service_appointments: serviceAppts.length,
      fi_deals: fiDeals.length,
      analytics_events: analyticsEvents.length,
    };

    log("");
    log("=".repeat(64));
    log("  Demo dealer seeded");
    log("=".repeat(64));
    log("");
    log(`  Dealer name : ${dealer.name}`);
    log(`  Dealer slug : ${dealer.slug}`);
    log(`  Dealer id   : ${dealer.id}`);
    log("");
    log("  Entities created:");
    log(`    staff                ${summary.staff}`);
    log(`    vehicles             ${summary.vehicles}`);
    log(`    leads                ${summary.leads}`);
    log(`    deals                ${summary.deals}`);
    log(`    fi_deals             ${summary.fi_deals}`);
    log(`    service_appointments ${summary.service_appointments}`);
    log(`    analytics_events     ${summary.analytics_events}`);
    log("");
    log(`  Demo URL    : https://demo.wolfpackauto.test/${dealer.slug}`);
    log(`  Admin login : ${DEMO_ADMIN_EMAIL}`);
    log(`  Run again with --reset to wipe and reseed.`);
    log("=".repeat(64));

    return summary;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): SeedOptions {
  const opts: SeedOptions = {};
  for (const a of argv.slice(2)) {
    if (a === "--reset") opts.reset = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a.startsWith("--")) {
      console.error(`[seed] Unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

if (require.main === module) {
  seedDemoDealer(parseArgs(process.argv))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[seed] Error:", err);
      process.exit(1);
    });
}
