/**
 * Vehicle → applicable recalls + TSBs resolver.
 *
 * Pure functions: given an in-memory recall/TSB universe and a vehicle,
 * return the matching subset. The actual joins against Postgres live in
 * the route handlers and cron; this module is the matching logic, isolated
 * for fast unit testing.
 *
 * Match rules:
 *
 *   recall matches when
 *     make matches case-insensitively                 AND
 *     model matches case-insensitively                AND
 *     year_from <= vehicle.year <= year_to
 *
 *   tsb matches when
 *     manufacturer matches case-insensitively         AND
 *     vehicle.model is in tsb.models (case-insensitive) AND
 *     year_from <= vehicle.year <= year_to
 *
 * Both cases handle multi-match (a vehicle can have N recalls and M TSBs),
 * no-match (returns empty arrays, never null), and year-range overlap
 * boundaries (year_from and year_to are both inclusive).
 */

import type {
  RecallRecord,
  TSBRecord,
  VehicleForRecallLookup,
} from "./types";

function eqInsensitive(a: string, b: string): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

function modelInList(model: string, list: string[]): boolean {
  if (!Array.isArray(list)) return false;
  const m = (model ?? "").trim().toLowerCase();
  return list.some((entry) => (entry ?? "").trim().toLowerCase() === m);
}

function yearInRange(
  year: number | undefined | null,
  from: number,
  to: number,
): boolean {
  if (typeof year !== "number" || !Number.isFinite(year)) return false;
  return year >= from && year <= to;
}

/**
 * Match a vehicle against a universe of recalls.
 */
export function matchRecalls(
  vehicle: VehicleForRecallLookup,
  universe: RecallRecord[],
): RecallRecord[] {
  if (!vehicle || !Array.isArray(universe)) return [];
  return universe.filter(
    (r) =>
      eqInsensitive(r.make, vehicle.make) &&
      eqInsensitive(r.model, vehicle.model) &&
      yearInRange(vehicle.year, r.year_from, r.year_to),
  );
}

/**
 * Match a vehicle against a universe of TSBs.
 */
export function matchTSBs(
  vehicle: VehicleForRecallLookup,
  universe: TSBRecord[],
): TSBRecord[] {
  if (!vehicle || !Array.isArray(universe)) return [];
  return universe.filter(
    (t) =>
      eqInsensitive(t.manufacturer, vehicle.make) &&
      modelInList(vehicle.model, t.models) &&
      yearInRange(vehicle.year, t.year_from, t.year_to),
  );
}

/**
 * Combined resolver. Returns the matching subset of both universes.
 */
export function resolveForVehicle(
  vehicle: VehicleForRecallLookup,
  universe: { recalls: RecallRecord[]; tsbs: TSBRecord[] },
): { recalls: RecallRecord[]; tsbs: TSBRecord[] } {
  return {
    recalls: matchRecalls(vehicle, universe.recalls),
    tsbs: matchTSBs(vehicle, universe.tsbs),
  };
}
