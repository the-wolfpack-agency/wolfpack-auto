/**
 * NHTSA vPIC (Vehicle Product Information Catalog) client.
 *
 * REAL public API — no key required.
 * Docs: https://vpic.nhtsa.dot.gov/api/
 *
 * Endpoints used:
 *   /vehicles/DecodeVinValues/<VIN>?format=json
 *     => year/make/model/trim/body/engine/fuel-type/etc.
 *
 * Cached for 24h via @/lib/cache; a VIN's decoded payload never changes.
 *
 * Per .ai/integrations.md every external call goes through a wrapper that
 * returns typed results — call sites never call fetch() directly.
 */

import { cacheGet, cacheSet } from "@/lib/cache";

const BASE_URL = "https://vpic.nhtsa.dot.gov/api";
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h

/** A subset of the NHTSA DecodeVinValues fields the DOS actually uses. */
export interface NhtsaVehicleSpec {
  vin: string;
  modelYear: number | null;
  make: string;
  model: string;
  trim: string | null;
  bodyClass: string | null;
  engineCylinders: string | null;
  fuelType: string | null;
  driveType: string | null;
  transmissionStyle: string | null;
  plantCountry: string | null;
  errorCode: string;
  errorText: string;
  rawAt: string;
}

export interface NhtsaError {
  kind: "nhtsa_error";
  message: string;
}

export type NhtsaResult =
  | { ok: true; spec: NhtsaVehicleSpec }
  | { ok: false; error: NhtsaError };

/**
 * Decode a VIN via the NHTSA public API. Returns a typed Result-like union;
 * never throws to call sites.
 *
 * The NHTSA API returns 200 with an errorCode field on bad VINs, so the
 * caller must check `result.ok` AND `result.spec.errorCode === "0"` for
 * full confidence.
 */
export async function decodeVin(vin: string): Promise<NhtsaResult> {
  const trimmed = vin?.trim()?.toUpperCase();
  if (!trimmed || trimmed.length !== 17) {
    return {
      ok: false,
      error: { kind: "nhtsa_error", message: "VIN must be 17 characters" },
    };
  }

  const cacheKey = `nhtsa:vin:${trimmed}`;
  const cached = await cacheGet<NhtsaVehicleSpec>(cacheKey);
  if (cached) {
    return { ok: true, spec: cached };
  }

  try {
    const url = `${BASE_URL}/vehicles/DecodeVinValues/${trimmed}?format=json`;
    const res = await fetch(url, {
      // Vercel Function safe — short timeout via AbortController.
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Wolfpack-Auto-DOS/1.0 (+market-intel)" },
    });

    if (!res.ok) {
      return {
        ok: false,
        error: {
          kind: "nhtsa_error",
          message: `NHTSA returned HTTP ${res.status}`,
        },
      };
    }

    const json = (await res.json()) as {
      Results?: Array<Record<string, string>>;
    };
    const row = json.Results?.[0];
    if (!row) {
      return {
        ok: false,
        error: { kind: "nhtsa_error", message: "NHTSA returned empty results" },
      };
    }

    const spec: NhtsaVehicleSpec = {
      vin: trimmed,
      modelYear: row.ModelYear ? parseInt(row.ModelYear, 10) || null : null,
      make: row.Make ?? "",
      model: row.Model ?? "",
      trim: row.Trim || null,
      bodyClass: row.BodyClass || null,
      engineCylinders: row.EngineCylinders || null,
      fuelType: row.FuelTypePrimary || null,
      driveType: row.DriveType || null,
      transmissionStyle: row.TransmissionStyle || null,
      plantCountry: row.PlantCountry || null,
      errorCode: row.ErrorCode ?? "",
      errorText: row.ErrorText ?? "",
      rawAt: new Date().toISOString(),
    };

    // Even errored decodes cache briefly — NHTSA rate-limits repeat lookups.
    await cacheSet(cacheKey, spec, CACHE_TTL_SECONDS);

    return { ok: true, spec };
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "nhtsa_error",
        message:
          err instanceof Error
            ? err.message
            : "Unknown NHTSA fetch error",
      },
    };
  }
}
