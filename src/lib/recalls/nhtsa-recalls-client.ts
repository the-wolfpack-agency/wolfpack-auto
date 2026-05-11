/**
 * NHTSA recalls API wrapper.
 *
 * The NHTSA recalls API is REAL and FREE (no key required):
 *   https://api.nhtsa.gov/recalls/recallsByVehicle?make=...&model=...&modelYear=...
 *
 * This module:
 *   1. Hits the live API (when allowed) and parses the response into our
 *      canonical `RecallRecord` shape.
 *   2. Caches aggressively (24h TTL) since recalls don't change minute-to-
 *      minute — most days the same VIN returns the same set.
 *   3. Heuristically classifies severity from the NHTSA consequence string.
 *
 * Per the call-site convention in `.ai/integrations.md`, this is the *only*
 * place that should call `fetch()` into NHTSA. Routes and the cron call
 * `fetchRecallsForVehicle` / `fetchRecallsByMake`, never raw fetch.
 */

import type { NHTSARecallApiRecord, RecallSeverity } from "./types";

const NHTSA_BASE_URL = "https://api.nhtsa.gov/recalls/recallsByVehicle";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 10_000;

interface CacheEntry {
  fetched_at: number;
  records: NHTSARecallApiRecord[];
}

const memoryCache = new Map<string, CacheEntry>();

/**
 * Build a deterministic cache key for a (make, model, year) lookup.
 */
function cacheKey(make: string, model: string, year: number): string {
  return `${make.toUpperCase()}|${model.toUpperCase()}|${year}`;
}

/**
 * Heuristic severity classifier. NHTSA does not categorize, so we infer.
 *
 * critical — death / fire / loss of control / crash / injury / airbag / brake failure
 * minor    — owner notification only / cosmetic / placard / label
 * moderate — everything else (default)
 *
 * Pure function — exported for unit testing.
 */
export function classifySeverity(record: {
  Consequence?: string;
  Summary?: string;
}): RecallSeverity {
  const text = `${record.Consequence ?? ""} ${record.Summary ?? ""}`.toLowerCase();

  const criticalKeywords = [
    "death",
    "fatal",
    "fire",
    "crash",
    "injury",
    "loss of control",
    "loss of vehicle control",
    "airbag",
    "air bag",
    "brake failure",
    "steering loss",
    "fuel leak",
    "electrical fire",
  ];
  if (criticalKeywords.some((k) => text.includes(k))) return "critical";

  const minorKeywords = [
    "owner notification",
    "label only",
    "placard",
    "cosmetic",
    "documentation",
  ];
  if (minorKeywords.some((k) => text.includes(k))) return "minor";

  return "moderate";
}

/**
 * Fetch raw NHTSA recall records for a (make, model, year). Cached 24h.
 *
 * Returns an empty array on network failure — never throws. The lib is meant
 * to fail open: a dead NHTSA upstream should NOT break the service write-up
 * screen, just suppress the flagging.
 */
export async function fetchRecallsForVehicle(
  make: string,
  model: string,
  year: number,
): Promise<NHTSARecallApiRecord[]> {
  if (!make || !model || !year) return [];

  const key = cacheKey(make, model, year);
  const cached = memoryCache.get(key);
  if (cached && Date.now() - cached.fetched_at < CACHE_TTL_MS) {
    return cached.records;
  }

  const url = `${NHTSA_BASE_URL}?make=${encodeURIComponent(
    make,
  )}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(
    String(year),
  )}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      // Next.js fetch revalidation: cache for 24h at the edge too.
      next: { revalidate: 60 * 60 * 24 },
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(
        `[nhtsa] Recalls API returned ${res.status} for ${make} ${model} ${year}`,
      );
      return [];
    }

    const json = (await res.json()) as { results?: NHTSARecallApiRecord[] };
    const records = Array.isArray(json.results) ? json.results : [];

    memoryCache.set(key, { fetched_at: Date.now(), records });
    return records;
  } catch (err) {
    console.warn(
      `[nhtsa] Recalls fetch failed for ${make} ${model} ${year}:`,
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}

/**
 * Fetch every recall NHTSA knows about for a given make (across years).
 * Used by the weekly cron refresh — narrows to the dealer-relevant years
 * in the SQL upsert.
 *
 * Iterates a 30-year window. Returns the union of all NHTSA records.
 */
export async function fetchRecallsByMake(
  make: string,
  options: { yearStart?: number; yearEnd?: number; models?: string[] } = {},
): Promise<NHTSARecallApiRecord[]> {
  const now = new Date().getUTCFullYear();
  const yearEnd = options.yearEnd ?? now + 1;
  const yearStart = options.yearStart ?? now - 29;
  const models = options.models ?? [];

  if (models.length === 0) return [];

  const all: NHTSARecallApiRecord[] = [];
  for (const model of models) {
    for (let year = yearStart; year <= yearEnd; year++) {
      // eslint-disable-next-line no-await-in-loop -- intentional serial fetch; NHTSA rate-limits aggressive parallelism
      const recs = await fetchRecallsForVehicle(make, model, year);
      all.push(...recs);
    }
  }
  return all;
}

/**
 * Internal — clear the memory cache. Exposed for tests only.
 */
export function __resetCacheForTests(): void {
  memoryCache.clear();
}

/**
 * Internal — report cache size. Exposed for tests only.
 */
export function __cacheSizeForTests(): number {
  return memoryCache.size;
}
