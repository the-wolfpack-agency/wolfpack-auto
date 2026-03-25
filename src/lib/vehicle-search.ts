/**
 * Vehicle search layer — vector-first with keyword fallback.
 *
 * Search flow:
 *  1. If QDRANT_URL is set, try vector similarity search
 *  2. If Qdrant is unavailable or returns 0 results, keyword search on placeholder data
 *  3. Always returns at least the placeholder data (never "no results")
 */

import {
  placeholderVehicles,
  type PlaceholderVehicle,
} from "@/lib/placeholder-data";
import {
  searchPoints,
  upsertPoints,
  createCollection,
  healthCheck,
  type QdrantFilter,
} from "@/lib/qdrant-client";
import { embedText, vehicleToText, getVectorDimension } from "@/lib/embeddings";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface VehicleSearchResult {
  vehicles: PlaceholderVehicle[];
  source: "vector" | "keyword" | "placeholder";
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const COLLECTION_NAME = "wolfpack_vehicles";

/** Synonym map for common search terms → vehicle field values. */
const SYNONYMS: Record<string, string[]> = {
  suv: ["suv", "crossover"],
  crossover: ["suv", "crossover"],
  truck: ["truck", "pickup"],
  pickup: ["truck", "pickup"],
  car: ["sedan", "coupe"],
  sedan: ["sedan"],
  coupe: ["coupe"],
  convertible: ["convertible"],
  van: ["van", "minivan"],
  minivan: ["van", "minivan"],
  ev: ["electric"],
  electric: ["electric"],
  hybrid: ["hybrid"],
  cheap: ["_sort_price_asc"],
  affordable: ["_sort_price_asc"],
  budget: ["_sort_price_asc"],
  luxury: ["_sort_price_desc"],
  expensive: ["_sort_price_desc"],
  new: ["new"],
  used: ["used"],
  certified: ["certified"],
  cpo: ["certified"],
  "pre-owned": ["certified"],
  awd: ["all-wheel drive", "awd"],
  "4wd": ["4x4", "4wd", "four-wheel"],
  "4x4": ["4x4", "4wd"],
};

/* ------------------------------------------------------------------ */
/*  Keyword search (always-available fallback)                         */
/* ------------------------------------------------------------------ */

/**
 * Score a vehicle against a set of query tokens.
 */
function scoreVehicle(
  vehicle: PlaceholderVehicle,
  tokens: string[],
): number {
  let score = 0;
  const searchable = [
    vehicle.make,
    vehicle.model,
    vehicle.trim,
    vehicle.bodyStyle,
    vehicle.fuel,
    vehicle.exteriorColor,
    vehicle.interiorColor,
    vehicle.drivetrain,
    vehicle.engine,
    vehicle.condition,
    ...vehicle.features,
  ]
    .join(" ")
    .toLowerCase();

  for (const token of tokens) {
    if (searchable.includes(token)) {
      score += 1;
    }
    // Check synonyms
    const synonyms = SYNONYMS[token];
    if (synonyms) {
      for (const syn of synonyms) {
        if (syn.startsWith("_sort_")) continue; // handled separately
        if (searchable.includes(syn.toLowerCase())) {
          score += 1;
        }
      }
    }
  }

  return score;
}

/**
 * Simple keyword search across placeholder vehicles.
 * Tokenizes the query, scores each vehicle, returns sorted results.
 */
export function keywordSearchVehicles(
  query: string,
  vehicles: PlaceholderVehicle[],
  limit: number = 5,
): PlaceholderVehicle[] {
  const lower = query.toLowerCase();
  const tokens = lower
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (tokens.length === 0) return vehicles.slice(0, limit);

  // Check for price range queries: "under $30K", "below 30000"
  let maxPrice: number | null = null;
  let minPrice: number | null = null;
  const priceMatch = lower.match(
    /(?:under|below|less\s*than|up\s*to|max)\s*\$?([\d,]+)\s*k?\b/,
  );
  if (priceMatch) {
    let val = parseInt(priceMatch[1].replace(/,/g, ""), 10);
    if (val < 1000) val *= 1000; // "30k" → 30000
    maxPrice = val;
  }
  const priceMinMatch = lower.match(
    /(?:over|above|more\s*than|at\s*least|min)\s*\$?([\d,]+)\s*k?\b/,
  );
  if (priceMinMatch) {
    let val = parseInt(priceMinMatch[1].replace(/,/g, ""), 10);
    if (val < 1000) val *= 1000;
    minPrice = val;
  }

  // Check for sort directive from synonyms
  let sortPriceAsc = false;
  let sortPriceDesc = false;
  for (const token of tokens) {
    const synonyms = SYNONYMS[token];
    if (synonyms) {
      if (synonyms.includes("_sort_price_asc")) sortPriceAsc = true;
      if (synonyms.includes("_sort_price_desc")) sortPriceDesc = true;
    }
  }

  // Score and filter
  let scored = vehicles
    .map((v) => ({ vehicle: v, score: scoreVehicle(v, tokens) }))
    .filter((s) => s.score > 0);

  // Apply price filters
  if (maxPrice !== null) {
    scored = scored.filter((s) => s.vehicle.price <= maxPrice!);
    // If price filter yielded nothing, search all vehicles within price
    if (scored.length === 0) {
      scored = vehicles
        .filter((v) => v.price <= maxPrice!)
        .map((v) => ({ vehicle: v, score: 1 }));
    }
  }
  if (minPrice !== null) {
    scored = scored.filter((s) => s.vehicle.price >= minPrice!);
  }

  // Sort
  if (sortPriceAsc) {
    scored.sort((a, b) => a.vehicle.price - b.vehicle.price);
  } else if (sortPriceDesc) {
    scored.sort((a, b) => b.vehicle.price - a.vehicle.price);
  } else {
    scored.sort((a, b) => b.score - a.score);
  }

  return scored.slice(0, limit).map((s) => s.vehicle);
}

/* ------------------------------------------------------------------ */
/*  Vector search (Qdrant)                                             */
/* ------------------------------------------------------------------ */

async function vectorSearch(
  query: string,
  limit: number,
  filter?: QdrantFilter,
): Promise<PlaceholderVehicle[] | null> {
  // Check if Qdrant is configured and healthy
  const healthy = await healthCheck();
  if (!healthy) return null;

  try {
    const queryVector = await embedText(query);
    const results = await searchPoints(
      COLLECTION_NAME,
      queryVector,
      limit,
      filter,
    );

    if (results.length === 0) return null;

    // Map Qdrant results back to PlaceholderVehicle objects
    const vehicles: PlaceholderVehicle[] = [];
    for (const result of results) {
      const payload = result.payload;
      if (!payload) continue;

      // Reconstruct vehicle from payload
      const vehicle: PlaceholderVehicle = {
        vin: (payload.vin as string) ?? "",
        year: (payload.year as number) ?? 0,
        make: (payload.make as string) ?? "",
        model: (payload.model as string) ?? "",
        trim: (payload.trim as string) ?? "",
        price: (payload.price as number) ?? 0,
        msrp: (payload.msrp as number) ?? 0,
        mileage: (payload.mileage as number) ?? 0,
        fuel: (payload.fuel as string) ?? "",
        transmission: (payload.transmission as string) ?? "",
        gradient: (payload.gradient as string) ?? "",
        condition: (payload.condition as string) ?? "",
        bodyStyle: (payload.bodyStyle as string) ?? "",
        exteriorColor: (payload.exteriorColor as string) ?? "",
        interiorColor: (payload.interiorColor as string) ?? "",
        drivetrain: (payload.drivetrain as string) ?? "",
        engine: (payload.engine as string) ?? "",
        mpg: (payload.mpg as string) ?? "",
        stockNumber: (payload.stockNumber as string) ?? "",
        features: (payload.features as string[]) ?? [],
        tag: (payload.tag as string) ?? undefined,
        photo: (payload.photo as string) ?? "",
        thumbnail: (payload.thumbnail as string) ?? "",
      };
      vehicles.push(vehicle);
    }

    return vehicles.length > 0 ? vehicles : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main search function                                               */
/* ------------------------------------------------------------------ */

/**
 * Search vehicles using the best available strategy:
 *  1. Vector search (Qdrant) — if configured and healthy
 *  2. Keyword search — if vector unavailable or returned 0 results
 *  3. Placeholder data — if keyword search found nothing
 */
export async function searchVehiclesByQuery(
  query: string,
  limit: number = 5,
): Promise<VehicleSearchResult> {
  // Strategy 1: Qdrant vector search
  const vectorResults = await vectorSearch(query, limit);
  if (vectorResults && vectorResults.length > 0) {
    return { vehicles: vectorResults, source: "vector" };
  }

  // Strategy 2: Keyword search on placeholder data
  const keywordResults = keywordSearchVehicles(
    query,
    placeholderVehicles,
    limit,
  );
  if (keywordResults.length > 0) {
    return { vehicles: keywordResults, source: "keyword" };
  }

  // Strategy 3: Return all placeholder data (never empty)
  return {
    vehicles: placeholderVehicles.slice(0, limit),
    source: "placeholder",
  };
}

/* ------------------------------------------------------------------ */
/*  Indexing                                                           */
/* ------------------------------------------------------------------ */

/**
 * Index a single vehicle into Qdrant.
 */
export async function indexVehicleToQdrant(
  vehicle: PlaceholderVehicle,
): Promise<boolean> {
  const dim = getVectorDimension();
  const collectionReady = await createCollection(COLLECTION_NAME, dim);
  if (!collectionReady) return false;

  const text = vehicleToText(vehicle);
  const vector = await embedText(text);

  // Use VIN as the point ID (hash to numeric for Qdrant)
  const id = vinToId(vehicle.vin);

  const success = await upsertPoints(COLLECTION_NAME, [
    {
      id,
      vector,
      payload: { ...vehicle },
    },
  ]);

  return success;
}

/**
 * Bulk-index all vehicles into Qdrant. Idempotent.
 */
export async function indexAllVehiclesToQdrant(
  vehicles: PlaceholderVehicle[],
): Promise<{ indexed: number; failed: number }> {
  const dim = getVectorDimension();
  const collectionReady = await createCollection(COLLECTION_NAME, dim);
  if (!collectionReady) {
    return { indexed: 0, failed: vehicles.length };
  }

  const points = await Promise.all(
    vehicles.map(async (v) => {
      const text = vehicleToText(v);
      const vector = await embedText(text);
      return {
        id: vinToId(v.vin),
        vector,
        payload: { ...v },
      };
    }),
  );

  const success = await upsertPoints(COLLECTION_NAME, points);

  return {
    indexed: success ? vehicles.length : 0,
    failed: success ? 0 : vehicles.length,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert a VIN string to a numeric ID for Qdrant.
 * Uses a simple hash to produce a stable positive integer.
 */
function vinToId(vin: string): number {
  let hash = 0;
  for (let i = 0; i < vin.length; i++) {
    hash = (hash * 31 + vin.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}
