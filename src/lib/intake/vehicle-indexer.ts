/**
 * Vehicle indexing utility for Qdrant vector search.
 *
 * Provides functions to index, bulk-index, and remove vehicles from the
 * 'wolfpack_vehicles' Qdrant collection. Uses vehicleToText() for text
 * representation and embedText() for vector generation (OpenAI or local
 * trigram fallback).
 *
 * Every operation degrades gracefully — a missing or unreachable Qdrant
 * instance returns false / zero-indexed, never throws.
 */

import { embedText, vehicleToText, getVectorDimension } from "@/lib/embeddings";
import {
  createCollection,
  upsertPoints,
  deletePoints,
  healthCheck,
} from "@/lib/qdrant-client";
import {
  placeholderVehicles,
  type PlaceholderVehicle,
} from "@/lib/placeholder-data";
import { query } from "@/lib/db";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const COLLECTION_NAME = "wolfpack_vehicles";
const BATCH_SIZE = 20;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert a VIN string to a stable numeric ID for Qdrant.
 */
function vinToId(vin: string): number {
  let hash = 0;
  for (let i = 0; i < vin.length; i++) {
    hash = (hash * 31 + vin.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

/**
 * Ensure the Qdrant collection exists, creating it if needed.
 * Returns false if Qdrant is unavailable.
 */
async function ensureCollection(): Promise<boolean> {
  const healthy = await healthCheck();
  if (!healthy) return false;

  const dim = getVectorDimension();
  return createCollection(COLLECTION_NAME, dim);
}

/* ------------------------------------------------------------------ */
/*  Data source helpers                                                */
/* ------------------------------------------------------------------ */

const DEALER_ID =
  process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

/**
 * Attempt to load vehicles from PostgreSQL. Returns null if DB is
 * unavailable, letting the caller fall back to placeholder data.
 */
async function loadVehiclesFromDB(): Promise<PlaceholderVehicle[] | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const result = await query(
      `SELECT vin, year, make, model, COALESCE(trim, '') AS trim,
              price, COALESCE(msrp, price) AS msrp, mileage,
              COALESCE(fuel_type, 'Gasoline') AS fuel,
              COALESCE(transmission, 'Automatic') AS transmission,
              condition, COALESCE(body_style, 'Sedan') AS "bodyStyle",
              COALESCE(exterior_color, 'Unknown') AS "exteriorColor",
              COALESCE(interior_color, 'Unknown') AS "interiorColor",
              COALESCE(drivetrain, 'FWD') AS drivetrain,
              COALESCE(engine, 'Unknown') AS engine,
              COALESCE(stock_number, '') AS "stockNumber",
              features,
              COALESCE(photo_url, '') AS photo,
              COALESCE(thumbnail_url, '') AS thumbnail
       FROM vehicles
       WHERE dealer_id = $1 AND status = 'available'
       ORDER BY created_at DESC
       LIMIT 500`,
      [DEALER_ID],
    );

    if ((result.rows as any[]).length === 0) return null;

    return (result.rows as any[]).map((r: any) => ({
      vin: r.vin,
      year: r.year,
      make: r.make,
      model: r.model,
      trim: r.trim ?? "",
      price: Number(r.price),
      msrp: Number(r.msrp),
      mileage: Number(r.mileage),
      fuel: r.fuel ?? "Gasoline",
      transmission: r.transmission ?? "Automatic",
      gradient: "from-brand-400 to-brand-600",
      condition: r.condition ?? "used",
      bodyStyle: r.bodyStyle ?? "Sedan",
      exteriorColor: r.exteriorColor ?? "Unknown",
      interiorColor: r.interiorColor ?? "Unknown",
      drivetrain: r.drivetrain ?? "FWD",
      engine: r.engine ?? "Unknown",
      mpg: r.mpg_city && r.mpg_highway
        ? `${r.mpg_city} city / ${r.mpg_highway} hwy`
        : "N/A",
      stockNumber: r.stockNumber ?? "",
      features: Array.isArray(r.features) ? r.features : [],
      photo: r.photo ?? "",
      thumbnail: r.thumbnail ?? "",
    })) as PlaceholderVehicle[];
  } catch (err) {
    console.error("[vehicle-indexer] DB load failed, will use placeholders:", err);
    return null;
  }
}

/**
 * Get all indexable vehicles: DB first, placeholder fallback.
 */
async function getAllVehicles(): Promise<{
  vehicles: PlaceholderVehicle[];
  source: "database" | "placeholder";
}> {
  const dbVehicles = await loadVehiclesFromDB();
  if (dbVehicles && dbVehicles.length > 0) {
    return { vehicles: dbVehicles, source: "database" };
  }
  return { vehicles: placeholderVehicles, source: "placeholder" };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Index a single vehicle into Qdrant.
 *
 * Creates the collection if it does not exist, generates a vector
 * embedding from vehicleToText(), and upserts the point with the
 * full vehicle as payload. Returns false if Qdrant is unavailable.
 */
export async function indexVehicleInQdrant(
  vehicle: PlaceholderVehicle,
): Promise<boolean> {
  try {
    const ready = await ensureCollection();
    if (!ready) {
      console.warn("[vehicle-indexer] Qdrant unavailable, skipping index for", vehicle.vin);
      return false;
    }

    const text = vehicleToText(vehicle);
    const vector = await embedText(text);
    const id = vinToId(vehicle.vin);

    const success = await upsertPoints(COLLECTION_NAME, [
      {
        id,
        vector,
        payload: { ...vehicle },
      },
    ]);

    if (success) {
      console.log("[vehicle-indexer] Indexed", vehicle.vin);
    }

    return success;
  } catch (err) {
    console.error("[vehicle-indexer] Error indexing", vehicle.vin, err);
    return false;
  }
}

/**
 * Index all vehicles into Qdrant for the given dealer.
 *
 * Loads from PostgreSQL if DATABASE_URL is set, otherwise uses
 * placeholder data. Indexes in batches for reliability.
 *
 * @param dealerId - Used for logging context (DB filter uses env DEALER_ID)
 */
export async function indexAllVehicles(
  dealerId: string = DEALER_ID,
): Promise<{ indexed: number; failed: number; source: string }> {
  const ready = await ensureCollection();
  if (!ready) {
    console.warn("[vehicle-indexer] Qdrant unavailable, cannot index vehicles");
    const { vehicles } = await getAllVehicles();
    return { indexed: 0, failed: vehicles.length, source: "qdrant_unavailable" };
  }

  const { vehicles, source } = await getAllVehicles();
  console.log(
    `[vehicle-indexer] Indexing ${vehicles.length} vehicles from ${source} for dealer ${dealerId}`,
  );

  let indexed = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < vehicles.length; i += BATCH_SIZE) {
    const batch = vehicles.slice(i, i + BATCH_SIZE);

    try {
      const points = await Promise.all(
        batch.map(async (v) => {
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
      if (success) {
        indexed += batch.length;
      } else {
        failed += batch.length;
      }
    } catch (err) {
      console.error(`[vehicle-indexer] Batch ${i}-${i + batch.length} failed:`, err);
      failed += batch.length;
    }
  }

  console.log(
    `[vehicle-indexer] Done: ${indexed} indexed, ${failed} failed (source: ${source})`,
  );

  return { indexed, failed, source };
}

/**
 * Remove a vehicle from the Qdrant index by VIN.
 * Returns false if Qdrant is unavailable or the deletion fails.
 */
export async function removeVehicleFromQdrant(vin: string): Promise<boolean> {
  try {
    const healthy = await healthCheck();
    if (!healthy) {
      console.warn("[vehicle-indexer] Qdrant unavailable, cannot remove", vin);
      return false;
    }

    const id = vinToId(vin);
    const success = await deletePoints(COLLECTION_NAME, [id]);

    if (success) {
      console.log("[vehicle-indexer] Removed", vin);
    }

    return success;
  } catch (err) {
    console.error("[vehicle-indexer] Error removing", vin, err);
    return false;
  }
}
