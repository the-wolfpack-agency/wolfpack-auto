/**
 * VIN (Vehicle Identification Number) decoder and validator.
 *
 * Pure algorithmic — zero external API calls.
 *
 * References:
 *  - ISO 3779 / 3780
 *  - 49 CFR Part 565 (NHTSA)
 *
 * Structure:
 *  Positions 1-3:  WMI  (World Manufacturer Identifier)
 *  Positions 4-8:  VDS  (Vehicle Descriptor Section)
 *  Position  9:    Check digit
 *  Position 10:    Model year
 *  Position 11:    Assembly plant
 *  Positions 12-17: Sequential number
 */

// ---------------------------------------------------------------------------
// WMI lookup — top 50+ manufacturers
// ---------------------------------------------------------------------------

const WMI_MAP: Record<string, string> = {
  // General Motors
  "1G1": "Chevrolet",
  "1G2": "Pontiac",
  "1GC": "Chevrolet",
  "1GT": "GMC",
  "1GY": "Cadillac",
  "2G1": "Chevrolet",
  "2G2": "Pontiac",
  "3G7": "GMC",
  "6G1": "Chevrolet",

  // Ford
  "1FA": "Ford",
  "1FB": "Ford",
  "1FC": "Ford",
  "1FD": "Ford",
  "1FM": "Ford",
  "1FT": "Ford",
  "2FA": "Ford",
  "2FM": "Ford",
  "3FA": "Ford",

  // Lincoln
  "1LN": "Lincoln",
  "2LM": "Lincoln",
  "5LM": "Lincoln",

  // Chrysler / Stellantis
  "1C3": "Chrysler",
  "1C4": "Chrysler",
  "1C6": "RAM",
  "1J4": "Jeep",
  "1J8": "Jeep",
  "2C3": "Chrysler",
  "2C4": "Chrysler",
  "3C4": "Chrysler",
  "3C6": "RAM",

  // Dodge
  "1B3": "Dodge",
  "1B7": "Dodge",
  "2B3": "Dodge",
  "2B5": "Dodge",
  "2D3": "Dodge",

  // Toyota
  "1N4": "Nissan",
  "2T1": "Toyota",
  "2T3": "Toyota",
  "4T1": "Toyota",
  "4T3": "Toyota",
  "4T4": "Toyota",
  "5TD": "Toyota",
  "5TF": "Toyota",
  "JTD": "Toyota",
  "JTE": "Toyota",
  "JTN": "Toyota",

  // Honda / Acura
  "JHM": "Honda",
  "1HG": "Honda",
  "2HG": "Honda",
  "5FN": "Honda",
  "5J6": "Honda",
  "19U": "Acura",
  "JH4": "Acura",

  // Nissan / Infiniti
  "1N6": "Nissan",
  "3N1": "Nissan",
  "5N1": "Nissan",
  "JN1": "Nissan",
  "JN8": "Nissan",
  "JNK": "Infiniti",
  "5N3": "Infiniti",

  // BMW
  "WBA": "BMW",
  "WBS": "BMW M",
  "WBY": "BMW",
  "5UX": "BMW",
  "5UJ": "BMW",

  // Mercedes-Benz
  "WDB": "Mercedes-Benz",
  "WDC": "Mercedes-Benz",
  "WDD": "Mercedes-Benz",
  "WDF": "Mercedes-Benz",
  "4JG": "Mercedes-Benz",
  "55S": "Mercedes-Benz",

  // Volkswagen / Audi
  "WVW": "Volkswagen",
  "WV2": "Volkswagen",
  "3VW": "Volkswagen",
  "WAU": "Audi",
  "WA1": "Audi",

  // Subaru
  "JF1": "Subaru",
  "JF2": "Subaru",
  "4S3": "Subaru",
  "4S4": "Subaru",

  // Mazda
  "JM1": "Mazda",
  "JM3": "Mazda",
  "3MZ": "Mazda",

  // Hyundai / Kia / Genesis
  "KMH": "Hyundai",
  "5NP": "Hyundai",
  "5NM": "Hyundai",
  "KNA": "Kia",
  "KND": "Kia",
  "5XY": "Kia",
  "KMT": "Genesis",

  // Volvo
  "YV1": "Volvo",
  "YV4": "Volvo",

  // Tesla
  "5YJ": "Tesla",

  // Porsche
  "WP0": "Porsche",
  "WP1": "Porsche",

  // Lexus
  "JTH": "Lexus",
  "2T2": "Lexus",

  // Land Rover / Jaguar
  "SAL": "Land Rover",
  "SAD": "Jaguar",
  "SAJ": "Jaguar",

  // Mitsubishi
  "JA3": "Mitsubishi",
  "JA4": "Mitsubishi",
  "4A3": "Mitsubishi",

  // Rivian
  "7FC": "Rivian",

  // Lucid
  "7PD": "Lucid",
};

// ---------------------------------------------------------------------------
// Year code lookup — position 10
// ---------------------------------------------------------------------------

const YEAR_CODE_MAP: Record<string, number> = {
  A: 2010, B: 2011, C: 2012, D: 2013, E: 2014,
  F: 2015, G: 2016, H: 2017, J: 2018, K: 2019,
  L: 2020, M: 2021, N: 2022, P: 2023, R: 2024,
  S: 2025, T: 2026, V: 2027, W: 2028, X: 2029,
  Y: 2030,
  // Numeric codes (also used for 2001-2009 in cycle 1, and 2031-2039)
  "1": 2031, "2": 2032, "3": 2033, "4": 2034, "5": 2035,
  "6": 2036, "7": 2037, "8": 2038, "9": 2039,
};

// Earlier cycle (pre-2010)
const YEAR_CODE_MAP_EARLY: Record<string, number> = {
  Y: 2000,
  "1": 2001, "2": 2002, "3": 2003, "4": 2004, "5": 2005,
  "6": 2006, "7": 2007, "8": 2008, "9": 2009,
  A: 2010, // boundary
};

// ---------------------------------------------------------------------------
// Check digit (position 9) validation — FMVSS 115
// ---------------------------------------------------------------------------

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};

const POSITION_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function computeCheckDigit(vin: string): string {
  let sum = 0;

  for (let i = 0; i < 17; i++) {
    const char = vin[i].toUpperCase();
    let value: number;

    if (/[0-9]/.test(char)) {
      value = parseInt(char, 10);
    } else {
      value = TRANSLITERATION[char] ?? 0;
    }

    sum += value * POSITION_WEIGHTS[i];
  }

  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

// ---------------------------------------------------------------------------
// Country of origin from first character
// ---------------------------------------------------------------------------

const COUNTRY_MAP: Record<string, string> = {
  "1": "United States", "4": "United States", "5": "United States",
  "2": "Canada",
  "3": "Mexico",
  "6": "Australia", "7": "New Zealand",
  "8": "Argentina", "9": "Brazil",
  J: "Japan",
  K: "South Korea",
  L: "China",
  M: "India",
  S: "United Kingdom",
  T: "Switzerland",
  V: "France",
  W: "Germany",
  Y: "Sweden",
  Z: "Italy",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface VINValidationResult {
  valid: boolean;
  errors: string[];
}

export interface VINDecodeResult {
  vin: string;
  valid: boolean;
  errors: string[];
  year: number | null;
  make: string | null;
  country: string | null;
  wmi: string;
  vds: string;
  vis: string;
  check_digit: string;
  check_digit_valid: boolean;
}

/**
 * Validate a VIN string.
 *
 * Checks:
 *  1. Exactly 17 characters
 *  2. No I, O, Q characters (ambiguous with 1, 0, and... Q)
 *  3. Alphanumeric only
 *  4. Check digit (position 9) matches computed value
 */
export function validateVIN(vin: string): VINValidationResult {
  const errors: string[] = [];

  if (!vin || typeof vin !== "string") {
    return { valid: false, errors: ["VIN is required"] };
  }

  const cleaned = vin.trim().toUpperCase();

  if (cleaned.length !== 17) {
    errors.push(`VIN must be exactly 17 characters, got ${cleaned.length}`);
  }

  if (/[IOQ]/i.test(cleaned)) {
    errors.push("VIN cannot contain letters I, O, or Q");
  }

  if (!/^[A-HJ-NPR-Z0-9]*$/.test(cleaned)) {
    errors.push("VIN contains invalid characters (must be alphanumeric, no I/O/Q)");
  }

  // Check digit validation only if length is correct
  if (cleaned.length === 17) {
    const expected = computeCheckDigit(cleaned);
    const actual = cleaned[8];
    if (actual !== expected) {
      errors.push(
        `Check digit mismatch: position 9 is '${actual}', expected '${expected}'`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Decode a VIN into its component parts.
 *
 * Returns year, make, and country when determinable.
 * Works even with invalid VINs — reports errors but still
 * extracts what it can.
 */
export function decodeVIN(vin: string): VINDecodeResult {
  const cleaned = vin?.trim().toUpperCase() ?? "";
  const validation = validateVIN(cleaned);

  const result: VINDecodeResult = {
    vin: cleaned,
    valid: validation.valid,
    errors: validation.errors,
    year: null,
    make: null,
    country: null,
    wmi: cleaned.substring(0, 3),
    vds: cleaned.substring(3, 9),
    vis: cleaned.substring(9, 17),
    check_digit: cleaned[8] ?? "",
    check_digit_valid: false,
  };

  if (cleaned.length < 17) {
    return result;
  }

  // Check digit
  const expectedCheck = computeCheckDigit(cleaned);
  result.check_digit_valid = cleaned[8] === expectedCheck;

  // Country (position 1)
  const firstChar = cleaned[0];
  result.country = COUNTRY_MAP[firstChar] ?? null;

  // Make (WMI — positions 1-3)
  const wmi = cleaned.substring(0, 3);
  result.make = WMI_MAP[wmi] ?? null;

  // Year (position 10)
  const yearCode = cleaned[9];

  // Determine cycle: use position 7 as a heuristic.
  // If the VIN's 7th digit helps date it, we can disambiguate.
  // For simplicity, we default to the modern cycle (2010+) and
  // fall back to early cycle if the code only exists there.
  if (YEAR_CODE_MAP[yearCode] !== undefined) {
    result.year = YEAR_CODE_MAP[yearCode];
  } else if (YEAR_CODE_MAP_EARLY[yearCode] !== undefined) {
    result.year = YEAR_CODE_MAP_EARLY[yearCode];
  }

  return result;
}
