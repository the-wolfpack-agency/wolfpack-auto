#!/usr/bin/env npx tsx
/**
 * Market Data Ingestion Script
 *
 * Reads EPA fuel economy data (vehicles.csv) and generates realistic dealer
 * inventory records, then optionally feeds them through the DMS feed processor.
 *
 * Usage:
 *   npx tsx scripts/ingest-market-data.ts [--count 500] [--output json|csv] [--dry-run]
 *
 * Options:
 *   --count <n>     Number of inventory records to generate (default: 500)
 *   --output <fmt>  Output format: json or csv (default: json)
 *   --dry-run       Generate and save data without calling processFeed()
 *   --dealer-id <d> Dealer ID for the feed (default: demo dealer)
 *   --help          Show this help message
 *
 * Requires DATABASE_URL in environment for non-dry-run mode.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EPARecord {
  year: number;
  make: string;
  model: string;
  cylinders: number;
  displ: number;
  drive: string;
  trany: string;
  fuelType1: string;
  city08: number;
  highway08: number;
  VClass: string;
  eng_dscr: string;
  tCharger: string;
  sCharger: string;
}

interface GeneratedRecord {
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
  mpg_city: number;
  mpg_highway: number;
  price: number;
  msrp: number;
  condition: string;
  mileage: number;
  status: string;
  description: string;
  features: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_COUNT = 500;
const DEFAULT_DEALER_ID = "00000000-0000-4000-b000-000000000001";
const CSV_PATH = path.resolve(__dirname, "..", "data", "raw", "vehicles.csv");
const OUTPUT_DIR = path.resolve(__dirname, "..", "data", "generated");

const MIN_YEAR = 2015;
const MAX_YEAR = 2025;

/** Vehicle classes to exclude (commercial/heavy duty/specialty) */
const EXCLUDED_CLASSES = new Set([
  "Special Purpose Vehicle",
  "Special Purpose Vehicle 2WD",
  "Special Purpose Vehicle 4WD",
  "Vans, Cargo Type",
  "Vans, Passenger Type",
  "Standard Pickup Trucks",
  "Standard Pickup Trucks 2WD",
  "Standard Pickup Trucks 4WD",
  "Standard Pickup Trucks/2WD",
  "Standard Sport Utility Vehicle",
  "Minicompact Cars",
]);

/** Makes to exclude (ultra-luxury / commercial / rare exotics with no dealer presence) */
const EXCLUDED_MAKES = new Set([
  "Bugatti",
  "Rolls-Royce",
  "Lamborghini",
  "McLaren",
  "Lotus",
  "Aston Martin",
  "Maserati",
  "Ferrari",
  "Bentley",
  "Roush Performance",
  "Saleen",
  "Panoz",
  "SRT",
  "smart",
]);

const EXTERIOR_COLORS = [
  "Black",
  "White",
  "Silver",
  "Gray",
  "Red",
  "Blue",
  "Dark Blue",
  "Pearl White",
  "Midnight Black",
  "Burgundy",
  "Green",
  "Champagne",
  "Magnetic Gray",
  "Ice Silver",
  "Deep Crystal Blue",
  "Soul Red",
  "Oxford White",
  "Shadow Black",
  "Lunar Silver",
  "Platinum White",
  "Bronze",
  "Tan",
];

const INTERIOR_COLORS = [
  "Black",
  "Gray",
  "Tan",
  "Beige",
  "Brown",
  "Charcoal",
  "Light Gray",
  "Ivory",
  "Saddle Brown",
  "Ebony",
];

const CONDITION_WEIGHTS: [string, number][] = [
  ["excellent", 0.1],
  ["good", 0.4],
  ["fair", 0.35],
  ["rough", 0.15],
];

/** World manufacturer ID prefixes mapped to makes for VIN generation */
const WMI_MAP: Record<string, string[]> = {
  Toyota: ["1T2", "2T1", "4T1", "5TD", "JTD", "JTN"],
  Honda: ["1HG", "2HG", "5FN", "19X"],
  Ford: ["1FA", "1FM", "1FT", "3FA"],
  Chevrolet: ["1G1", "1GC", "2G1", "3GN"],
  Nissan: ["1N4", "1N6", "3N1", "5N1", "JN1"],
  Hyundai: ["5NP", "5NM", "KMH"],
  Kia: ["5XX", "KNA", "KND"],
  Subaru: ["4S3", "4S4", "JF1", "JF2"],
  BMW: ["WBA", "WBS", "5UX"],
  "Mercedes-Benz": ["4JG", "55S", "WDB", "WDD"],
  Volkswagen: ["1VW", "3VW", "WVW"],
  Mazda: ["JM1", "JM3"],
  Jeep: ["1C4", "1J4", "1J8"],
  Dodge: ["1C3", "2C3", "3C4"],
  Chrysler: ["1C3", "2C3"],
  GMC: ["1GT", "3GD"],
  Audi: ["WAU", "WA1"],
  Lexus: ["JTH", "2T2"],
  Acura: ["19U", "JH4"],
  Infiniti: ["3PC", "JN1"],
  Buick: ["1G4"],
  Cadillac: ["1G6", "1GY"],
  Lincoln: ["1LN", "5LM"],
  Volvo: ["YV1", "YV4"],
  "Land Rover": ["SAL"],
  Porsche: ["WP0", "WP1"],
  Tesla: ["5YJ"],
  Rivian: ["7PD"],
  Genesis: ["KMT"],
  Ram: ["1C6", "3C6"],
  MINI: ["WMW"],
  Mitsubishi: ["4A3", "JA3", "JA4"],
};

const DEFAULT_WMI = ["1XX", "2XX", "3XX"];

/** Base MSRP by segment + year for pricing model */
const SEGMENT_BASE_MSRP: Record<string, number> = {
  "Subcompact Cars": 22_000,
  "Compact Cars": 26_000,
  "Midsize Cars": 32_000,
  "Large Cars": 38_000,
  "Two Seaters": 35_000,
  "Small Sport Utility Vehicle 2WD": 31_000,
  "Small Sport Utility Vehicle 4WD": 34_000,
  "Standard Sport Utility Vehicle 2WD": 42_000,
  "Standard Sport Utility Vehicle 4WD": 46_000,
  "Midsize Station Wagons": 36_000,
  "Small Station Wagons": 30_000,
  "Minicompact Cars": 28_000,
  "Minivan - 2WD": 36_000,
  "Minivan - 4WD": 39_000,
  "Small Pickup Trucks": 30_000,
  "Small Pickup Trucks 2WD": 28_000,
  "Small Pickup Trucks 4WD": 33_000,
};

/** Luxury make multiplier */
const LUXURY_MAKES = new Set([
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Lexus",
  "Acura",
  "Infiniti",
  "Cadillac",
  "Lincoln",
  "Volvo",
  "Land Rover",
  "Porsche",
  "Genesis",
  "Tesla",
  "Rivian",
]);

const FEATURES_POOL = [
  "Bluetooth",
  "Backup Camera",
  "Apple CarPlay",
  "Android Auto",
  "Keyless Entry",
  "Push Button Start",
  "Heated Seats",
  "Leather Seats",
  "Sunroof",
  "Navigation",
  "Blind Spot Monitor",
  "Lane Departure Warning",
  "Adaptive Cruise Control",
  "Remote Start",
  "Power Liftgate",
  "Roof Rack",
  "LED Headlights",
  "Premium Audio",
  "Wireless Charging",
  "Heated Steering Wheel",
  "Ventilated Seats",
  "360 Camera",
  "Parking Sensors",
  "Tow Package",
  "Alloy Wheels",
  "Fog Lights",
  "Dual Zone Climate",
  "Third Row Seating",
  "Power Seats",
  "Memory Seats",
];

// ---------------------------------------------------------------------------
// CSV Parser (zero-dependency, handles quoted fields)
// ---------------------------------------------------------------------------

function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw.split("\n");
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const record: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j] ?? "";
    }
    records.push(record);
  }

  return records;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

// ---------------------------------------------------------------------------
// Seeded PRNG (deterministic output for reproducibility)
// ---------------------------------------------------------------------------

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Returns float in [0, 1) */
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0x7fffffff;
    return this.state / 0x7fffffff;
  }

  /** Returns integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Pick random element from array */
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick N unique random elements */
  sample<T>(arr: T[], n: number): T[] {
    const copy = [...arr];
    const result: T[] = [];
    const count = Math.min(n, copy.length);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(this.next() * copy.length);
      result.push(copy[idx]);
      copy.splice(idx, 1);
    }
    return result;
  }

  /** Weighted random pick */
  weighted<T>(items: [T, number][]): T {
    const total = items.reduce((sum, [, w]) => sum + w, 0);
    let r = this.next() * total;
    for (const [item, weight] of items) {
      r -= weight;
      if (r <= 0) return item;
    }
    return items[items.length - 1][0];
  }
}

// ---------------------------------------------------------------------------
// VIN Generator
// ---------------------------------------------------------------------------

const VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789"; // no I, O, Q

function generateVIN(rng: SeededRandom, make: string, year: number): string {
  const wmis = WMI_MAP[make] ?? DEFAULT_WMI;
  const wmi = rng.pick(wmis);

  // Positions 4-8: vehicle descriptor section (random valid chars)
  let vds = "";
  for (let i = 0; i < 5; i++) {
    vds += rng.pick([...VIN_CHARS]);
  }

  // Position 9: check digit (placeholder, computed below)
  // Position 10: model year code
  const yearCodes = "FGHIJKLMNPRSTUVWXYZ0123456789ABC";
  //                  2015=F ... 2025=P (offset from 2015)
  const yearCodeMap: Record<number, string> = {
    2015: "F",
    2016: "G",
    2017: "H",
    2018: "J",
    2019: "K",
    2020: "L",
    2021: "M",
    2022: "N",
    2023: "P",
    2024: "R",
    2025: "S",
  };
  const yearCode = yearCodeMap[year] ?? "S";

  // Position 11: assembly plant
  const plant = rng.pick([...VIN_CHARS]);

  // Positions 12-17: sequential production number
  const seq = String(rng.int(100000, 999999));

  const vinWithoutCheck = wmi + vds + "0" + yearCode + plant + seq;

  // Compute check digit (position 9, index 8)
  const checkDigit = computeVINCheckDigit(vinWithoutCheck);
  const vin =
    vinWithoutCheck.slice(0, 8) + checkDigit + vinWithoutCheck.slice(9);

  return vin;
}

function computeVINCheckDigit(vin: string): string {
  const transliteration: Record<string, number> = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  };

  const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    const value =
      ch >= "0" && ch <= "9"
        ? parseInt(ch, 10)
        : transliteration[ch] ?? 0;
    sum += value * weights[i];
  }

  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

// ---------------------------------------------------------------------------
// EPA Data Loading & Filtering
// ---------------------------------------------------------------------------

function loadEPAData(): EPARecord[] {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`EPA data not found at ${CSV_PATH}`);
  }

  const raw = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parseCSV(raw);

  const filtered: EPARecord[] = [];

  for (const row of rows) {
    const year = parseInt(row.year, 10);
    if (isNaN(year) || year < MIN_YEAR || year > MAX_YEAR) continue;

    const make = (row.make ?? "").trim();
    const model = (row.model ?? "").trim();
    const vclass = (row.VClass ?? "").trim();

    if (!make || !model) continue;
    if (EXCLUDED_MAKES.has(make)) continue;
    if (EXCLUDED_CLASSES.has(vclass)) continue;

    filtered.push({
      year,
      make,
      model,
      cylinders: parseInt(row.cylinders, 10) || 0,
      displ: parseFloat(row.displ) || 0,
      drive: row.drive ?? "",
      trany: row.trany ?? "",
      fuelType1: row.fuelType1 ?? "",
      city08: parseInt(row.city08, 10) || 0,
      highway08: parseInt(row.highway08, 10) || 0,
      VClass: vclass,
      eng_dscr: row.eng_dscr ?? "",
      tCharger: row.tCharger ?? "",
      sCharger: row.sCharger ?? "",
    });
  }

  console.log(
    `[EPA] Loaded ${rows.length} total rows, ${filtered.length} after filtering (${MIN_YEAR}-${MAX_YEAR}, consumer only)`,
  );

  return filtered;
}

// ---------------------------------------------------------------------------
// Record Generation
// ---------------------------------------------------------------------------

function mapDrivetrain(epaDrive: string): string {
  if (epaDrive.includes("Front")) return "fwd";
  if (epaDrive.includes("Rear")) return "rwd";
  if (epaDrive.includes("All") || epaDrive.includes("4")) return "awd";
  if (epaDrive.includes("Part")) return "4wd";
  return "fwd";
}

function mapTransmission(epaTranny: string): string {
  if (epaTranny.startsWith("Automatic")) return "automatic";
  if (epaTranny.startsWith("Manual")) return "manual";
  if (epaTranny.includes("CVT") || epaTranny.includes("Continuously"))
    return "cvt";
  return "automatic";
}

function mapFuelType(epaFuel: string): string {
  const lower = epaFuel.toLowerCase();
  if (lower.includes("electricity")) return "electric";
  if (lower.includes("diesel")) return "diesel";
  if (lower.includes("e85") || lower.includes("flex")) return "flex_fuel";
  if (lower.includes("premium")) return "premium_gasoline";
  if (lower.includes("midgrade")) return "midgrade_gasoline";
  return "gasoline";
}

function mapBodyStyle(vclass: string): string {
  const lower = vclass.toLowerCase();
  if (lower.includes("suv") || lower.includes("sport utility")) return "SUV";
  if (lower.includes("pickup") || lower.includes("truck")) return "Truck";
  if (lower.includes("van") || lower.includes("minivan")) return "Van";
  if (lower.includes("wagon")) return "Wagon";
  if (lower.includes("two seater")) return "Coupe";
  if (lower.includes("compact")) return "Sedan";
  if (lower.includes("midsize")) return "Sedan";
  if (lower.includes("large")) return "Sedan";
  return "Sedan";
}

function buildEngineDescription(epa: EPARecord): string {
  const parts: string[] = [];
  if (epa.displ > 0) parts.push(`${epa.displ}L`);
  if (epa.cylinders > 0) parts.push(`${epa.cylinders}-cyl`);
  if (epa.tCharger) parts.push("Turbo");
  if (epa.sCharger) parts.push("Supercharged");
  if (epa.eng_dscr && epa.eng_dscr !== "(FFS)") {
    parts.push(epa.eng_dscr.replace(/[()]/g, ""));
  }
  if (parts.length === 0) {
    const fuel = epa.fuelType1.toLowerCase();
    if (fuel.includes("electricity")) return "Electric Motor";
    return "Standard Engine";
  }
  return parts.join(" ");
}

function estimateMSRP(
  make: string,
  vclass: string,
  year: number,
): number {
  const base = SEGMENT_BASE_MSRP[vclass] ?? 30_000;
  const luxuryMultiplier = LUXURY_MAKES.has(make) ? 1.55 : 1.0;
  // Newer model years cost more (approx 3% per year from 2020 baseline)
  const yearFactor = 1 + (year - 2020) * 0.03;
  return Math.round(base * luxuryMultiplier * yearFactor);
}

function estimatePrice(
  msrp: number,
  year: number,
  mileage: number,
  condition: string,
): number {
  const currentYear = 2026;
  const age = currentYear - year;

  // Depreciation: ~15% year 1, ~10% year 2-3, ~8% after
  let depreciation = 0;
  if (age >= 1) depreciation += 0.15;
  if (age >= 2) depreciation += 0.10;
  if (age >= 3) depreciation += 0.10;
  for (let i = 4; i <= age; i++) depreciation += 0.08;
  depreciation = Math.min(depreciation, 0.75); // floor at 25% of MSRP

  // Mileage adjustment: additional depreciation for high-mileage
  const mileageFactor = 1 - Math.min(mileage / 200_000, 0.3) * 0.5;

  // Condition adjustment
  const conditionMultiplier: Record<string, number> = {
    excellent: 1.05,
    good: 1.0,
    fair: 0.90,
    rough: 0.75,
  };
  const condMult = conditionMultiplier[condition] ?? 1.0;

  const price = msrp * (1 - depreciation) * mileageFactor * condMult;
  // Round to nearest $100
  return Math.round(price / 100) * 100;
}

function estimateMileage(rng: SeededRandom, year: number): number {
  const age = 2026 - year;
  // Average 12K-15K miles per year with variance
  const avgPerYear = rng.int(10_000, 16_000);
  const baseMiles = age * avgPerYear;
  // Add some random variance (+/- 20%)
  const variance = rng.next() * 0.4 - 0.2;
  const mileage = Math.round(baseMiles * (1 + variance));
  return Math.max(0, mileage);
}

function generateTrim(rng: SeededRandom, make: string): string {
  const trims: Record<string, string[]> = {
    Toyota: ["LE", "SE", "XLE", "XSE", "Limited", "TRD Sport"],
    Honda: ["LX", "EX", "EX-L", "Touring", "Sport"],
    Ford: ["S", "SE", "SEL", "Titanium", "ST", "Limited"],
    Chevrolet: ["LS", "LT", "RS", "Premier", "Z71"],
    Nissan: ["S", "SV", "SL", "SR", "Platinum"],
    Hyundai: ["SE", "SEL", "N Line", "Limited", "Calligraphy"],
    Kia: ["LX", "S", "EX", "SX", "GT-Line"],
    Subaru: ["Base", "Premium", "Sport", "Limited", "Touring"],
    BMW: ["sDrive", "xDrive", "M Sport"],
    "Mercedes-Benz": ["Base", "AMG Line", "4MATIC"],
    Volkswagen: ["S", "SE", "SEL", "R-Line"],
    Mazda: ["Sport", "Select", "Preferred", "Premium", "Turbo"],
    Jeep: ["Sport", "Latitude", "Limited", "Trailhawk", "Sahara"],
    Dodge: ["SXT", "GT", "R/T", "Scat Pack"],
    Audi: ["Premium", "Premium Plus", "Prestige"],
    Lexus: ["Base", "F Sport", "Luxury"],
    Tesla: ["Standard Range", "Long Range", "Performance"],
  };

  const options = trims[make] ?? [
    "Base",
    "SE",
    "Limited",
    "Sport",
    "Premium",
  ];
  return rng.pick(options);
}

function generateDescription(
  record: Omit<GeneratedRecord, "description">,
): string {
  const mileageStr =
    record.mileage === 0
      ? "brand new"
      : `${record.mileage.toLocaleString()} miles`;

  return (
    `${record.year} ${record.make} ${record.model} ${record.trim} in ${record.exterior_color}. ` +
    `${record.engine}, ${record.transmission} transmission, ${record.drivetrain.toUpperCase()} drivetrain. ` +
    `${mileageStr}. Condition: ${record.condition}. ` +
    `EPA rated ${record.mpg_city} city / ${record.mpg_highway} highway MPG.`
  );
}

function generateRecords(
  epaData: EPARecord[],
  count: number,
): GeneratedRecord[] {
  const rng = new SeededRandom(20260406); // deterministic seed
  const records: GeneratedRecord[] = [];
  const usedVINs = new Set<string>();

  // Deduplicate EPA data by make/model/year to get unique combos
  const combos = new Map<string, EPARecord>();
  for (const epa of epaData) {
    const key = `${epa.year}|${epa.make}|${epa.model}`;
    if (!combos.has(key)) {
      combos.set(key, epa);
    }
  }
  const uniqueCombos = [...combos.values()];

  if (uniqueCombos.length === 0) {
    throw new Error("No valid EPA records after filtering");
  }

  console.log(
    `[GEN] ${uniqueCombos.length} unique make/model/year combinations available`,
  );

  for (let i = 0; i < count; i++) {
    const epa = rng.pick(uniqueCombos);

    // Generate unique VIN
    let vin: string;
    let attempts = 0;
    do {
      vin = generateVIN(rng, epa.make, epa.year);
      attempts++;
      if (attempts > 100) {
        throw new Error("VIN collision limit reached");
      }
    } while (usedVINs.has(vin));
    usedVINs.add(vin);

    const condition = rng.weighted(CONDITION_WEIGHTS);
    const mileage = estimateMileage(rng, epa.year);
    const trim = generateTrim(rng, epa.make);
    const msrp = estimateMSRP(epa.make, epa.VClass, epa.year);
    const price = estimatePrice(msrp, epa.year, mileage, condition);
    const featureCount = rng.int(3, 10);

    const partial = {
      vin,
      stock_number: `WP-${String(i + 1).padStart(5, "0")}`,
      year: epa.year,
      make: epa.make,
      model: epa.model,
      trim,
      body_style: mapBodyStyle(epa.VClass),
      exterior_color: rng.pick(EXTERIOR_COLORS),
      interior_color: rng.pick(INTERIOR_COLORS),
      engine: buildEngineDescription(epa),
      transmission: mapTransmission(epa.trany),
      drivetrain: mapDrivetrain(epa.drive),
      fuel_type: mapFuelType(epa.fuelType1),
      mpg_city: epa.city08,
      mpg_highway: epa.highway08,
      price,
      msrp,
      condition,
      mileage,
      status: "available" as const,
      features: rng.sample(FEATURES_POOL, featureCount),
    };

    const description = generateDescription(partial);
    records.push({ ...partial, description });
  }

  return records;
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

function toCSVOutput(records: GeneratedRecord[]): string {
  const headers = [
    "vin",
    "stock_number",
    "year",
    "make",
    "model",
    "trim",
    "body_style",
    "exterior_color",
    "interior_color",
    "engine",
    "transmission",
    "drivetrain",
    "fuel_type",
    "mpg_city",
    "mpg_highway",
    "price",
    "msrp",
    "condition",
    "mileage",
    "status",
    "description",
    "features",
  ];

  const escape = (val: unknown): string => {
    const s = Array.isArray(val) ? val.join("; ") : String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [headers.join(",")];
  for (const r of records) {
    lines.push(
      headers.map((h) => escape((r as Record<string, unknown>)[h])).join(","),
    );
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log(`
Market Data Ingestion Script — EPA to DMS Feed Pipeline

Usage:
  npx tsx scripts/ingest-market-data.ts [options]

Options:
  --count <n>        Number of records to generate (default: 500)
  --output <format>  Output format: json | csv (default: json)
  --dry-run          Generate and save only, do not call processFeed()
  --dealer-id <id>   Dealer UUID for the feed (default: demo dealer)
  --help             Show this help

Examples:
  npx tsx scripts/ingest-market-data.ts --dry-run
  npx tsx scripts/ingest-market-data.ts --count 100 --output csv
  npx tsx scripts/ingest-market-data.ts --dealer-id abc-123
`);
}

function parseArgs(argv: string[]): {
  count: number;
  output: "json" | "csv";
  dryRun: boolean;
  dealerId: string;
  help: boolean;
} {
  const opts = {
    count: DEFAULT_COUNT,
    output: "json" as "json" | "csv",
    dryRun: false,
    dealerId: DEFAULT_DEALER_ID,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--count":
        opts.count = parseInt(argv[++i], 10);
        if (isNaN(opts.count) || opts.count < 1) {
          console.error("Error: --count must be a positive integer");
          process.exit(1);
        }
        break;
      case "--output":
        opts.output = argv[++i] as "json" | "csv";
        if (opts.output !== "json" && opts.output !== "csv") {
          console.error("Error: --output must be json or csv");
          process.exit(1);
        }
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--dealer-id":
        opts.dealerId = argv[++i];
        break;
      case "--help":
      case "-h":
        opts.help = true;
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        process.exit(1);
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    return;
  }

  console.log("=".repeat(60));
  console.log("  Wolfpack Auto — Market Data Ingestion");
  console.log("=".repeat(60));
  console.log(`  Count:     ${opts.count}`);
  console.log(`  Output:    ${opts.output}`);
  console.log(`  Dry run:   ${opts.dryRun}`);
  console.log(`  Dealer ID: ${opts.dealerId}`);
  console.log("=".repeat(60));
  console.log();

  // Step 1: Load EPA data
  console.log("[1/4] Loading EPA fuel economy data...");
  const epaData = loadEPAData();

  // Step 2: Generate inventory records
  console.log(`[2/4] Generating ${opts.count} inventory records...`);
  const records = generateRecords(epaData, opts.count);

  // Step 3: Save to file
  console.log("[3/4] Saving generated data...");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const ext = opts.output === "csv" ? "csv" : "json";
  const filename = `inventory-${opts.count}.${ext}`;
  const outputPath = path.join(OUTPUT_DIR, filename);

  if (opts.output === "csv") {
    fs.writeFileSync(outputPath, toCSVOutput(records), "utf-8");
  } else {
    fs.writeFileSync(outputPath, JSON.stringify(records, null, 2), "utf-8");
  }
  console.log(`  -> Saved to ${outputPath}`);

  // Print sample
  console.log("\n  Sample records:");
  for (const r of records.slice(0, 3)) {
    console.log(
      `    ${r.stock_number} | ${r.vin} | ${r.year} ${r.make} ${r.model} ${r.trim} | $${r.price.toLocaleString()} | ${r.mileage.toLocaleString()} mi | ${r.condition}`,
    );
  }

  // Price distribution summary
  const prices = records.map((r) => r.price).sort((a, b) => a - b);
  const avgPrice = Math.round(
    prices.reduce((s, p) => s + p, 0) / prices.length,
  );
  console.log(`\n  Price range: $${prices[0].toLocaleString()} - $${prices[prices.length - 1].toLocaleString()}`);
  console.log(`  Average:     $${avgPrice.toLocaleString()}`);
  console.log(`  Median:      $${prices[Math.floor(prices.length / 2)].toLocaleString()}`);

  // Make distribution
  const makeCount = new Map<string, number>();
  for (const r of records) {
    makeCount.set(r.make, (makeCount.get(r.make) ?? 0) + 1);
  }
  const topMakes = [...makeCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log(`\n  Top makes:`);
  for (const [make, count] of topMakes) {
    console.log(`    ${make.padEnd(18)} ${count}`);
  }

  // Step 4: Feed into DMS processor (unless dry-run)
  if (opts.dryRun) {
    console.log("\n[4/4] Dry run — skipping processFeed()");
    console.log("  To load into database, re-run without --dry-run");
  } else {
    console.log("\n[4/4] Feeding records through DMS processor...");

    // Dynamic import to avoid DB connection on dry-run
    const { processFeed } = await import("@/lib/dms/feed-processor");
    const { DMSProvider } = await import("@/lib/dms/types");

    // Convert to DMSVehicleRecord shape (use lowercase field names)
    const dmsRecords = records.map((r) => ({
      vin: r.vin,
      stock_number: r.stock_number,
      year: r.year,
      make: r.make,
      model: r.model,
      trim: r.trim,
      body_style: r.body_style,
      exterior_color: r.exterior_color,
      interior_color: r.interior_color,
      engine: r.engine,
      transmission: r.transmission,
      drivetrain: r.drivetrain,
      fuel_type: r.fuel_type,
      mpg_city: r.mpg_city,
      mpg_highway: r.mpg_highway,
      price: r.price,
      msrp: r.msrp,
      condition: r.condition === "excellent" || r.condition === "good"
        ? "Used"
        : "Used",
      mileage: r.mileage,
      status: r.status,
      description: r.description,
      features: r.features,
    }));

    const result = await processFeed(
      opts.dealerId,
      DMSProvider.GENERIC_CSV,
      dmsRecords,
      "full",
    );

    console.log(`  Received:  ${result.vehicles_received}`);
    console.log(`  Added:     ${result.vehicles_added}`);
    console.log(`  Updated:   ${result.vehicles_updated}`);
    console.log(`  Removed:   ${result.vehicles_removed}`);
    console.log(`  Skipped:   ${result.vehicles_skipped}`);
    console.log(`  Errors:    ${result.errors.length}`);
    console.log(`  Warnings:  ${result.warnings.length}`);
    console.log(`  Duration:  ${result.sync_duration_ms}ms`);

    if (result.errors.length > 0) {
      console.log("\n  First 5 errors:");
      for (const err of result.errors.slice(0, 5)) {
        console.log(`    [${err.vin ?? "unknown"}] ${err.message}`);
      }
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
