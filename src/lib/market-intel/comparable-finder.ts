/**
 * Comparable listing finder — surfaces other inventory similar to a target
 * vehicle within a configurable radius.
 *
 * Status: MOCK by default. Returns a deterministic-but-realistic set of
 * comparables based on the target year/make/model + a value spread around
 * the dealer's price.
 *
 * To activate real data:
 *   - Plug in Cars.com / AutoTrader / CarGurus partner feeds inside
 *     `realComparableSource(...)` and gate on a process.env API key.
 *   - The migration 065 `market_comparable_listings.comp_source` column
 *     already accepts `cars_com | autotrader | cargurus | manual` enums.
 *
 * Cached for 24h via @/lib/cache to avoid hammering external feeds.
 */

import { cacheGet, cacheSet } from "@/lib/cache";
import type { ComparableListing, TargetVehicle } from "@/lib/market-intel/types";

const CACHE_TTL_SECONDS = 60 * 60 * 24;

/** Configurable radius defaults — dealer can override per-vehicle via API. */
export const DEFAULT_RADIUS_MILES = 100;
export const DEFAULT_COMP_COUNT = 8;

export interface FindComparablesOptions {
  radiusMiles?: number;
  limit?: number;
}

/**
 * Returns mock comparable listings until a real feed partnership lands.
 * `comparablesCount === 0` is a legitimate response when the target is
 * very rare; the caller (signal-generator) downgrades confidence then.
 */
export async function findComparables(
  target: TargetVehicle,
  opts: FindComparablesOptions = {},
): Promise<ComparableListing[]> {
  const radius = opts.radiusMiles ?? DEFAULT_RADIUS_MILES;
  const limit = opts.limit ?? DEFAULT_COMP_COUNT;

  const cacheK = `market-intel:comps:${target.vehicleId}:${radius}:${limit}`;
  const cached = await cacheGet<ComparableListing[]>(cacheK);
  if (cached) return cached;

  const comps = buildMockComparables(target, radius, limit);
  await cacheSet(cacheK, comps, CACHE_TTL_SECONDS);
  return comps;
}

/**
 * Builds a stable, deterministic set of mock comparables.
 *
 * Distribution: prices centered on `target.ourPriceCents` with a +/-12% band,
 * miles centered on the target's miles (+/-15%), distance bucketed 5..radius
 * miles. Always flagged `isMock: true` and `comp_source: "mock"` so the UI
 * + future devs see at a glance these are not real listings.
 */
function buildMockComparables(
  target: TargetVehicle,
  radiusMiles: number,
  limit: number,
): ComparableListing[] {
  const seed = hashString(`${target.vehicleId}:${target.vin}`);
  const list: ComparableListing[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < limit; i++) {
    const rng = pseudoRandom(seed + i * 17);

    // Price spread: -12% to +12% of our price.
    const priceMult = 0.88 + rng() * 0.24;
    const compPriceCents = Math.max(
      100_000,
      Math.round((target.ourPriceCents || 2_500_000) * priceMult),
    );

    // Miles spread: -15% to +15% of target (or estimate from age if missing).
    const targetMiles = target.miles ?? Math.max(0, (new Date().getUTCFullYear() - target.year) * 12_000);
    const milesMult = 0.85 + rng() * 0.3;
    const compMiles = Math.max(0, Math.round(targetMiles * milesMult));

    const distance = 5 + Math.round(rng() * (radiusMiles - 5));

    list.push({
      compSource: "mock",
      compVinOrId: `MOCK-${seed.toString(36)}-${i}`,
      compYear: target.year,
      compMake: target.make,
      compModel: target.model,
      compTrim: target.trim,
      compPriceCents,
      compMiles,
      compDistanceMiles: distance,
      compDealerName: `Comparable Dealer ${i + 1}`,
      compUrl: undefined,
      isMock: true,
      capturedAt: now,
    });
  }

  // Sort ascending by price so the dashboard "lowest comp" is index 0.
  list.sort((a, b) => a.compPriceCents - b.compPriceCents);
  return list;
}

/* ------------------------------------------------------------------ */
/*  Pseudo-random helpers (no external deps; deterministic per seed)   */
/* ------------------------------------------------------------------ */

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Mulberry32-style PRNG. Deterministic for a given seed. */
function pseudoRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * STUB — wire this up once a partner feed is signed.
 * Returns null today; signal-generator falls back to mock comparables.
 */
export async function realComparableSource(
  _target: TargetVehicle,
  _opts: FindComparablesOptions = {},
): Promise<ComparableListing[] | null> {
  // Intentionally null. Future implementation:
  //  - if process.env.CARS_COM_FEED_API_KEY: fetch + map to ComparableListing[]
  //  - if process.env.AUTOTRADER_FEED_KEY: fetch + map
  // Each branch must set isMock = false and comp_source to the right enum.
  return null;
}
