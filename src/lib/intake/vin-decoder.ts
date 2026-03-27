/**
 * VIN decoder — auto-populates vehicle specs from a 17-character VIN.
 *
 * Strategy 1: NHTSA vPIC API (free, no key required)
 * Strategy 2: WMI/position-based template fallback
 *
 * Never throws — returns null on any failure.
 */

import type { DrivetrainType, FuelType, TransmissionType } from "@/types/vehicle";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DecodedVIN {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  body_style: string | null;
  engine: string | null;
  transmission: string | null;
  drivetrain: string | null;
  fuel_type: string | null;
  country_of_origin: string;
}

/* ------------------------------------------------------------------ */
/*  NHTSA vPIC variable IDs                                            */
/* ------------------------------------------------------------------ */

const VAR_MAKE = 26;
const VAR_MODEL = 28;
const VAR_YEAR = 29;
const VAR_BODY_CLASS = 5;
const VAR_DISPLACEMENT = 13;
const VAR_DRIVE_TYPE = 15;
const VAR_ENGINE_CYLINDERS = 9;
const VAR_ENGINE_MODEL = 18;
const VAR_FUEL_TYPE = 24;
const VAR_TRIM = 38;
const VAR_TRANSMISSION_STYLE = 37;
const VAR_PLANT_COUNTRY = 75;

/* ------------------------------------------------------------------ */
/*  Value normalization maps                                           */
/* ------------------------------------------------------------------ */

const DRIVETRAIN_MAP: Record<string, DrivetrainType> = {
  "all wheel drive": "awd",
  "awd": "awd",
  "front-wheel drive": "fwd",
  "fwd": "fwd",
  "rear-wheel drive": "rwd",
  "rwd": "rwd",
  "4x4": "4wd",
  "4wd": "4wd",
  "four wheel drive": "4wd",
};

const FUEL_TYPE_MAP: Record<string, FuelType> = {
  "gasoline": "gasoline",
  "diesel": "diesel",
  "electric": "electric",
  "hybrid": "hybrid",
  "plug-in hybrid": "plug_in_hybrid",
  "plug-in hybrid (phev)": "plug_in_hybrid",
  "compressed natural gas (cng)": "gasoline",
  "flex fuel vehicle (ffv)": "gasoline",
};

const TRANSMISSION_MAP: Record<string, TransmissionType> = {
  "automatic": "automatic",
  "manual/standard": "manual",
  "manual": "manual",
  "cvt": "cvt",
  "continuously variable transmission (cvt)": "cvt",
  "automated manual transmission (amt)": "automatic",
  "dual-clutch transmission (dct)": "automatic",
};

/* ------------------------------------------------------------------ */
/*  WMI (World Manufacturer Identifier) fallback table                 */
/* ------------------------------------------------------------------ */

const WMI_MAP: Record<string, { make: string; country: string }> = {
  "1HG": { make: "Honda", country: "United States" },
  "1G1": { make: "Chevrolet", country: "United States" },
  "1G6": { make: "Cadillac", country: "United States" },
  "1FA": { make: "Ford", country: "United States" },
  "1FM": { make: "Ford", country: "United States" },
  "1FT": { make: "Ford", country: "United States" },
  "1GC": { make: "Chevrolet", country: "United States" },
  "1GT": { make: "GMC", country: "United States" },
  "1LN": { make: "Lincoln", country: "United States" },
  "1N4": { make: "Nissan", country: "United States" },
  "2HG": { make: "Honda", country: "Canada" },
  "2T1": { make: "Toyota", country: "Canada" },
  "3FA": { make: "Ford", country: "Mexico" },
  "3VW": { make: "Volkswagen", country: "Mexico" },
  "5YJ": { make: "Tesla", country: "United States" },
  "5YM": { make: "BMW", country: "United States" },
  "JHM": { make: "Honda", country: "Japan" },
  "JN1": { make: "Nissan", country: "Japan" },
  "JTD": { make: "Toyota", country: "Japan" },
  "KMH": { make: "Hyundai", country: "South Korea" },
  "KND": { make: "Kia", country: "South Korea" },
  "SAL": { make: "Land Rover", country: "United Kingdom" },
  "WAU": { make: "Audi", country: "Germany" },
  "WBA": { make: "BMW", country: "Germany" },
  "WDB": { make: "Mercedes-Benz", country: "Germany" },
  "WDD": { make: "Mercedes-Benz", country: "Germany" },
  "WF0": { make: "Ford", country: "Germany" },
  "WP0": { make: "Porsche", country: "Germany" },
  "WVW": { make: "Volkswagen", country: "Germany" },
  "YV1": { make: "Volvo", country: "Sweden" },
  "ZFF": { make: "Ferrari", country: "Italy" },
};

/**
 * Decode model year from VIN position 10 (standard NHTSA encoding).
 */
const YEAR_CODE_MAP: Record<string, number> = {
  A: 2010, B: 2011, C: 2012, D: 2013, E: 2014, F: 2015,
  G: 2016, H: 2017, J: 2018, K: 2019, L: 2020, M: 2021,
  N: 2022, P: 2023, R: 2024, S: 2025, T: 2026, V: 2027,
  W: 2028, X: 2029, Y: 2030,
  "1": 2001, "2": 2002, "3": 2003, "4": 2004, "5": 2005,
  "6": 2006, "7": 2007, "8": 2008, "9": 2009,
};

/* ------------------------------------------------------------------ */
/*  NHTSA vPIC API                                                     */
/* ------------------------------------------------------------------ */

interface NHTSAResult {
  VariableId: number;
  Value: string | null;
}

async function decodeViaNHTSA(vin: string): Promise<DecodedVIN | null> {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "WolfpackAuto-VINDecoder/1.0" },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { Results: NHTSAResult[] };
    if (!data.Results || !Array.isArray(data.Results)) return null;

    const lookup = new Map<number, string>();
    for (const r of data.Results) {
      if (r.Value && r.Value.trim()) {
        lookup.set(r.VariableId, r.Value.trim());
      }
    }

    const make = lookup.get(VAR_MAKE);
    const model = lookup.get(VAR_MODEL);
    const yearStr = lookup.get(VAR_YEAR);

    // Make, model, and year are required for a useful decode
    if (!make || !model || !yearStr) return null;

    const year = parseInt(yearStr, 10);
    if (isNaN(year) || year < 1980 || year > 2035) return null;

    // Build engine description from cylinders + displacement
    const cylinders = lookup.get(VAR_ENGINE_CYLINDERS);
    const displacement = lookup.get(VAR_DISPLACEMENT);
    const engineModel = lookup.get(VAR_ENGINE_MODEL);
    let engine: string | null = null;
    if (cylinders && displacement) {
      const dispLiters = parseFloat(displacement);
      engine = !isNaN(dispLiters)
        ? `${dispLiters.toFixed(1)}L ${cylinders}-Cylinder`
        : `${cylinders}-Cylinder`;
    } else if (engineModel) {
      engine = engineModel;
    }

    // Normalize drivetrain
    const rawDrive = lookup.get(VAR_DRIVE_TYPE)?.toLowerCase();
    const drivetrain = rawDrive ? (DRIVETRAIN_MAP[rawDrive] ?? null) : null;

    // Normalize fuel type
    const rawFuel = lookup.get(VAR_FUEL_TYPE)?.toLowerCase();
    const fuel_type = rawFuel ? (FUEL_TYPE_MAP[rawFuel] ?? null) : null;

    // Normalize transmission
    const rawTrans = lookup.get(VAR_TRANSMISSION_STYLE)?.toLowerCase();
    const transmission = rawTrans ? (TRANSMISSION_MAP[rawTrans] ?? null) : null;

    // Country of origin from plant country or WMI fallback
    const plantCountry = lookup.get(VAR_PLANT_COUNTRY);
    const wmi = vin.substring(0, 3).toUpperCase();
    const country_of_origin =
      plantCountry ?? WMI_MAP[wmi]?.country ?? countryFromFirstChar(vin[0]);

    return {
      year,
      make,
      model,
      trim: lookup.get(VAR_TRIM) ?? null,
      body_style: lookup.get(VAR_BODY_CLASS) ?? null,
      engine,
      transmission,
      drivetrain,
      fuel_type,
      country_of_origin,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Template fallback                                                  */
/* ------------------------------------------------------------------ */

function decodeViaTemplate(vin: string): DecodedVIN | null {
  const wmi = vin.substring(0, 3).toUpperCase();
  const wmiEntry = WMI_MAP[wmi];

  const yearChar = vin[9].toUpperCase();
  const year = YEAR_CODE_MAP[yearChar];

  if (!wmiEntry || !year) return null;

  return {
    year,
    make: wmiEntry.make,
    model: "", // Cannot reliably decode model from VIN alone
    trim: null,
    body_style: null,
    engine: null,
    transmission: null,
    drivetrain: null,
    fuel_type: null,
    country_of_origin: wmiEntry.country,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function countryFromFirstChar(c: string): string {
  const upper = c.toUpperCase();
  if ("12345".includes(upper)) return "United States";
  if (upper === "2") return "Canada";
  if (upper === "3") return "Mexico";
  if (upper === "J") return "Japan";
  if (upper === "K") return "South Korea";
  if ("STUVW".includes(upper)) return "Europe";
  if ("LMN".includes(upper)) return "China";
  return "Unknown";
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i;

/**
 * Validate VIN format: exactly 17 alphanumeric characters, excluding I, O, Q.
 */
export function isValidVIN(vin: string): boolean {
  return VIN_REGEX.test(vin);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Decode a VIN into vehicle specifications.
 *
 * Tries NHTSA vPIC API first (free, no key needed), then falls back
 * to WMI/position-based template decoding. Never throws.
 *
 * @param vin  17-character Vehicle Identification Number
 * @returns    Decoded vehicle data, or null if VIN is invalid/undecodable
 */
export async function decodeVIN(vin: string): Promise<DecodedVIN | null> {
  const cleaned = vin.trim().toUpperCase();

  if (!isValidVIN(cleaned)) return null;

  // Strategy 1: NHTSA vPIC API
  const nhtsaResult = await decodeViaNHTSA(cleaned);
  if (nhtsaResult) return nhtsaResult;

  // Strategy 2: WMI template fallback
  return decodeViaTemplate(cleaned);
}
