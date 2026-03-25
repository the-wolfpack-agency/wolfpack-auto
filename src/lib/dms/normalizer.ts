/**
 * DMS vehicle record normaliser.
 *
 * Transforms messy, inconsistently-named fields from various DMS
 * providers into the canonical Vehicle shape. Every field is coerced
 * and validated — garbage in, warnings out.
 */

import type { Vehicle, VehicleCondition, TransmissionType, DrivetrainType, FuelType } from "@/types/vehicle";
import type { DMSVehicleRecord, DMSProvider, NormalisationResult } from "./types";

// ---------------------------------------------------------------------------
// Colour standardisation
// ---------------------------------------------------------------------------

const COLOR_MAP: Record<string, string> = {
  BLK: "Black", BK: "Black", BLACK: "Black",
  WHT: "White", WT: "White", WHITE: "White",
  SLV: "Silver", SILVER: "Silver", SIL: "Silver",
  GRY: "Gray", GREY: "Gray", GRAY: "Gray", GR: "Gray",
  RED: "Red", RD: "Red",
  BLU: "Blue", BL: "Blue", BLUE: "Blue",
  GRN: "Green", GN: "Green", GREEN: "Green",
  GLD: "Gold", GOLD: "Gold",
  BRN: "Brown", BR: "Brown", BROWN: "Brown", TAN: "Tan",
  BRG: "Burgundy", BURGUNDY: "Burgundy", MAROON: "Burgundy",
  ORG: "Orange", ORANGE: "Orange",
  YEL: "Yellow", YELLOW: "Yellow",
  BEI: "Beige", BEIGE: "Beige",
  PRL: "Pearl White", PEARL: "Pearl White",
  CHA: "Charcoal", CHARCOAL: "Charcoal",
};

function normalizeColor(raw: string | undefined | null): string {
  if (!raw) return "";
  const cleaned = raw.trim().toUpperCase();
  return COLOR_MAP[cleaned] ?? titleCase(raw.trim());
}

// ---------------------------------------------------------------------------
// Body style standardisation
// ---------------------------------------------------------------------------

const BODY_STYLE_MAP: Record<string, string> = {
  "SPORT UTILITY VEHICLE": "SUV",
  "SPORT UTILITY": "SUV",
  "SPORTS UTILITY VEHICLE": "SUV",
  SUV: "SUV",
  CROSSOVER: "SUV",
  CUV: "SUV",
  SEDAN: "Sedan",
  "4DR": "Sedan",
  "4 DOOR": "Sedan",
  "4-DOOR": "Sedan",
  COUPE: "Coupe",
  CPE: "Coupe",
  "2DR": "Coupe",
  "2 DOOR": "Coupe",
  "2-DOOR": "Coupe",
  TRUCK: "Truck",
  "PICKUP": "Truck",
  "PICK-UP": "Truck",
  "PICKUP TRUCK": "Truck",
  "CREW CAB": "Truck",
  "DOUBLE CAB": "Truck",
  "REGULAR CAB": "Truck",
  "EXTENDED CAB": "Truck",
  VAN: "Van",
  MINIVAN: "Minivan",
  "MINI VAN": "Minivan",
  "MINI-VAN": "Minivan",
  WAGON: "Wagon",
  "STATION WAGON": "Wagon",
  CONVERTIBLE: "Convertible",
  CONV: "Convertible",
  HATCHBACK: "Hatchback",
  HB: "Hatchback",
  HATCH: "Hatchback",
};

function normalizeBodyStyle(raw: string | undefined | null): string {
  if (!raw) return "";
  const cleaned = raw.trim().toUpperCase();
  return BODY_STYLE_MAP[cleaned] ?? titleCase(raw.trim());
}

// ---------------------------------------------------------------------------
// Transmission standardisation
// ---------------------------------------------------------------------------

const TRANSMISSION_MAP: Record<string, TransmissionType> = {
  AUTO: "automatic",
  AUTOMATIC: "automatic",
  "A/T": "automatic",
  AT: "automatic",
  MANUAL: "manual",
  "M/T": "manual",
  MT: "manual",
  STICK: "manual",
  "STANDARD": "manual",
  CVT: "cvt",
  "CONTINUOUSLY VARIABLE": "cvt",
};

function normalizeTransmission(raw: string | undefined | null): TransmissionType {
  if (!raw) return "automatic";
  const cleaned = raw.trim().toUpperCase();
  return TRANSMISSION_MAP[cleaned] ?? "automatic";
}

// ---------------------------------------------------------------------------
// Drivetrain standardisation
// ---------------------------------------------------------------------------

const DRIVETRAIN_MAP: Record<string, DrivetrainType> = {
  FWD: "fwd",
  "FRONT WHEEL DRIVE": "fwd",
  "FRONT-WHEEL DRIVE": "fwd",
  "2WD": "fwd",
  RWD: "rwd",
  "REAR WHEEL DRIVE": "rwd",
  "REAR-WHEEL DRIVE": "rwd",
  AWD: "awd",
  "ALL WHEEL DRIVE": "awd",
  "ALL-WHEEL DRIVE": "awd",
  "4WD": "4wd",
  "4X4": "4wd",
  "FOUR WHEEL DRIVE": "4wd",
  "FOUR-WHEEL DRIVE": "4wd",
};

function normalizeDrivetrain(raw: string | undefined | null): DrivetrainType {
  if (!raw) return "fwd";
  const cleaned = raw.trim().toUpperCase();
  return DRIVETRAIN_MAP[cleaned] ?? "fwd";
}

// ---------------------------------------------------------------------------
// Fuel type standardisation
// ---------------------------------------------------------------------------

const FUEL_TYPE_MAP: Record<string, FuelType> = {
  GAS: "gasoline",
  GASOLINE: "gasoline",
  PETROL: "gasoline",
  UNLEADED: "gasoline",
  DIESEL: "diesel",
  ELECTRIC: "electric",
  EV: "electric",
  BEV: "electric",
  HYBRID: "hybrid",
  HEV: "hybrid",
  "PLUG-IN HYBRID": "plug_in_hybrid",
  "PLUG IN HYBRID": "plug_in_hybrid",
  PHEV: "plug_in_hybrid",
  "PLUG-IN": "plug_in_hybrid",
};

function normalizeFuelType(raw: string | undefined | null): FuelType {
  if (!raw) return "gasoline";
  const cleaned = raw.trim().toUpperCase();
  return FUEL_TYPE_MAP[cleaned] ?? "gasoline";
}

// ---------------------------------------------------------------------------
// Condition standardisation
// ---------------------------------------------------------------------------

const CONDITION_MAP: Record<string, VehicleCondition> = {
  NEW: "new",
  N: "new",
  USED: "used",
  U: "used",
  "PRE-OWNED": "used",
  PREOWNED: "used",
  "PRE OWNED": "used",
  CERTIFIED: "certified",
  CPO: "certified",
  "CERTIFIED PRE-OWNED": "certified",
  "CERTIFIED PRE OWNED": "certified",
};

function normalizeCondition(raw: string | undefined | null): VehicleCondition {
  if (!raw) return "used";
  const cleaned = raw.trim().toUpperCase();
  return CONDITION_MAP[cleaned] ?? "used";
}

// ---------------------------------------------------------------------------
// Price parsing
// ---------------------------------------------------------------------------

/**
 * Parse a price from various formats:
 *  - "$29,995.00" → 29995
 *  - "29995" → 29995
 *  - 2999500 (cents, CDK) → 29995 (when centsMode=true)
 *  - "" or null → null
 */
function parsePrice(raw: string | number | undefined | null, centsMode = false): number | null {
  if (raw === undefined || raw === null || raw === "") return null;

  let value: number;

  if (typeof raw === "number") {
    value = raw;
  } else {
    // Strip $, commas, whitespace
    const cleaned = raw.replace(/[$,\s]/g, "");
    value = parseFloat(cleaned);
  }

  if (isNaN(value) || value < 0) return null;

  if (centsMode && value > 100_000_00) {
    // Likely cents — CDK sends prices in cents
    value = Math.round(value / 100);
  }

  // Sanity: no car costs more than $5M
  if (value > 5_000_000) return null;

  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Integer parsing
// ---------------------------------------------------------------------------

function parseIntSafe(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = typeof raw === "number" ? raw : parseInt(String(raw).replace(/[,\s]/g, ""), 10);
  return isNaN(value) ? null : value;
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

/**
 * Parse dates from various DMS formats:
 *  - "20240315" (CDK YYYYMMDD)
 *  - "2024-03-15T12:00:00Z" (ISO)
 *  - "03/15/2024" (US)
 *  - "15-Mar-2024"
 */
function parseDate(raw: string | undefined | null): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();

  // YYYYMMDD (CDK format)
  if (/^\d{8}$/.test(trimmed)) {
    const y = trimmed.substring(0, 4);
    const m = trimmed.substring(4, 6);
    const d = trimmed.substring(6, 8);
    const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
    if (!isNaN(date.getTime())) return date.toISOString();
  }

  // Try native Date parse for ISO and other formats
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) return date.toISOString();

  return null;
}

// ---------------------------------------------------------------------------
// Features parsing
// ---------------------------------------------------------------------------

function parseFeatures(raw: string | string[] | undefined | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((f) => String(f).trim()).filter(Boolean);

  // Comma or pipe delimited string
  return raw
    .split(/[,|;]/)
    .map((f) => f.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Photos parsing
// ---------------------------------------------------------------------------

function parsePhotos(raw: string | string[] | undefined | null): { url: string; alt: string; sort_order: number; is_primary: boolean }[] {
  if (!raw) return [];

  const urls: string[] = Array.isArray(raw)
    ? raw
    : raw.split(/[,|;]/).map((u) => u.trim()).filter(Boolean);

  return urls.map((url, i) => ({
    url,
    alt: "",
    sort_order: i,
    is_primary: i === 0,
  }));
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

function coalesceString(...values: (string | undefined | null)[]): string {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return "";
}

function coalesceNumeric(...values: (string | number | undefined | null)[]): string | number | undefined {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Provider-specific field extraction
// ---------------------------------------------------------------------------

function extractFields(raw: DMSVehicleRecord, provider: DMSProvider) {
  const isCDK = provider === "CDK";

  return {
    vin: coalesceString(raw.vin, raw.VIN, raw.Vin),
    stock_number: coalesceString(raw.stock_number, raw.StockNo, raw.stockNumber, raw.stock_no),
    year: coalesceNumeric(raw.year, raw.Year),
    make: coalesceString(raw.make, raw.Make),
    model: coalesceString(raw.model, raw.Model),
    trim: coalesceString(raw.trim, raw.Trim, raw.TrimLevel),
    body_style: coalesceString(raw.body_style, raw.BodyStyle, raw.body_type, raw.BodyType),
    exterior_color: coalesceString(raw.exterior_color, raw.ExteriorColor, raw.ext_color, raw.ExtColor, raw.color),
    interior_color: coalesceString(raw.interior_color, raw.InteriorColor, raw.int_color, raw.IntColor),
    engine: coalesceString(raw.engine, raw.Engine, raw.EngineDescription),
    transmission: coalesceString(raw.transmission, raw.Transmission, raw.Trans),
    drivetrain: coalesceString(raw.drivetrain, raw.Drivetrain, raw.DriveTrain, raw.drive_type),
    fuel_type: coalesceString(raw.fuel_type, raw.FuelType, raw.Fuel),
    mpg_city: coalesceNumeric(raw.mpg_city, raw.MpgCity, raw.CityMPG),
    mpg_highway: coalesceNumeric(raw.mpg_highway, raw.MpgHighway, raw.HighwayMPG, raw.HwyMPG),
    price: coalesceNumeric(raw.price, raw.Price, raw.ListPrice, raw.listPrice, raw.asking_price, raw.AskingPrice, raw.VehPrice),
    msrp: coalesceNumeric(raw.msrp, raw.MSRP),
    internet_price: coalesceNumeric(raw.internet_price, raw.InternetPrice, raw.invoicePrice, raw.InvoicePrice),
    condition: coalesceString(raw.condition, raw.Condition, raw.NewUsed, raw.new_used, raw.Type),
    mileage: coalesceNumeric(raw.mileage, raw.Mileage, raw.Odometer, raw.Miles),
    status: coalesceString(raw.status, raw.Status, raw.VehicleStatus),
    description: coalesceString(raw.description, raw.Description, raw.Comments, raw.comments),
    features: raw.features ?? raw.Features ?? raw.Options ?? raw.options,
    photos: raw.photos ?? raw.Photos ?? raw.ImageUrls ?? raw.image_urls ?? raw.PhotoUrl ?? raw.photo_url,
    date_in_stock: coalesceString(raw.date_in_stock, raw.DateInStock, raw.InStockDate),
    isCDK,
  };
}

// ---------------------------------------------------------------------------
// Main normaliser
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Normalise a raw DMS vehicle record into the canonical Vehicle shape.
 *
 * Handles provider-specific quirks:
 *  - CDK: "StockNo" not "stock_number", prices in cents, dates YYYYMMDD
 *  - Reynolds: XML-derived, uses "VehPrice"
 *  - Dealertrack: JSON with "listPrice", "invoicePrice"
 *  - Generic CSV: relies on column_mapping done before this step
 */
export function normalizeVehicle(
  raw: DMSVehicleRecord,
  provider: DMSProvider,
): NormalisationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { vehicle: null, warnings: [], errors: ["Record is null or not an object"] };
  }

  const f = extractFields(raw, provider);

  // --- VIN (required) ---
  if (!f.vin) {
    errors.push("Missing VIN");
    return { vehicle: null, warnings, errors };
  }

  const vin = f.vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (vin.length !== 17) {
    errors.push(`Invalid VIN length: ${vin.length} (expected 17)`);
    return { vehicle: null, warnings, errors };
  }

  // --- Year (required) ---
  const yearRaw = parseIntSafe(f.year);
  if (yearRaw === null) {
    errors.push("Missing or invalid year");
    return { vehicle: null, warnings, errors };
  }
  if (yearRaw < 1990 || yearRaw > CURRENT_YEAR + 2) {
    errors.push(`Year ${yearRaw} out of valid range (1990-${CURRENT_YEAR + 2})`);
    return { vehicle: null, warnings, errors };
  }

  // --- Make (required) ---
  if (!f.make) {
    errors.push("Missing make");
    return { vehicle: null, warnings, errors };
  }

  // --- Model (required) ---
  if (!f.model) {
    errors.push("Missing model");
    return { vehicle: null, warnings, errors };
  }

  // --- Price (required) ---
  const isCentsMode = provider === "CDK";
  const price = parsePrice(f.price, isCentsMode);
  if (price === null || price <= 0) {
    errors.push(`Missing or invalid price: ${String(f.price)}`);
    return { vehicle: null, warnings, errors };
  }

  // --- Optional fields ---
  const msrp = parsePrice(f.msrp, isCentsMode);
  const internetPrice = parsePrice(f.internet_price, isCentsMode);
  const mileage = parseIntSafe(f.mileage) ?? 0;
  const mpgCity = parseIntSafe(f.mpg_city);
  const mpgHighway = parseIntSafe(f.mpg_highway);

  if (mileage < 0) {
    warnings.push(`Negative mileage (${mileage}), defaulting to 0`);
  }
  if (mileage > 500_000) {
    warnings.push(`Unusually high mileage: ${mileage}`);
  }

  // Price sanity checks
  if (msrp !== null && price > msrp * 1.5) {
    warnings.push(`Price ($${price}) is >150% of MSRP ($${msrp})`);
  }

  const stockNumber = f.stock_number || vin.substring(vin.length - 8);

  const condition = normalizeCondition(f.condition);
  if (condition === "new" && mileage > 500) {
    warnings.push(`Vehicle marked 'new' but has ${mileage} miles`);
  }

  const photos = typeof f.photos === "string"
    ? parsePhotos(f.photos)
    : parsePhotos(f.photos as string[] | undefined);

  const features = parseFeatures(f.features as string | string[] | undefined);

  const dateInStock = parseDate(f.date_in_stock);
  const now = new Date().toISOString();

  const vehicle: Partial<Vehicle> = {
    vin,
    stock_number: stockNumber,
    year: yearRaw,
    make: titleCase(f.make),
    model: titleCase(f.model),
    trim: f.trim ? titleCase(f.trim) : "",
    body_style: normalizeBodyStyle(f.body_style),
    exterior_color: normalizeColor(f.exterior_color),
    interior_color: normalizeColor(f.interior_color),
    engine: f.engine || "",
    transmission: normalizeTransmission(f.transmission),
    drivetrain: normalizeDrivetrain(f.drivetrain),
    fuel_type: normalizeFuelType(f.fuel_type),
    mpg_city: mpgCity,
    mpg_highway: mpgHighway,
    msrp,
    price,
    internet_price: internetPrice,
    condition,
    mileage: Math.max(mileage, 0),
    status: "available",
    photos,
    photo_count: photos.length,
    description: f.description || "",
    features,
    created_at: dateInStock ?? now,
    updated_at: now,
  };

  return { vehicle, warnings, errors };
}

/**
 * Normalise a batch of records, collecting per-vehicle results.
 */
export function normalizeVehicles(
  records: DMSVehicleRecord[],
  provider: DMSProvider,
): { results: NormalisationResult[]; totalErrors: number; totalWarnings: number } {
  let totalErrors = 0;
  let totalWarnings = 0;

  const results = records.map((raw) => {
    const result = normalizeVehicle(raw, provider);
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
    return result;
  });

  return { results, totalErrors, totalWarnings };
}
