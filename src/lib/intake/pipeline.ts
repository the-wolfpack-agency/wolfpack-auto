/**
 * Central vehicle intake pipeline.
 *
 * Orchestrates the full onboarding flow for vehicles entering the system:
 *  1. Validate and normalize vehicle data
 *  2. Generate listing description (AI or template)
 *  3. Process photos (download, optimize, upload to R2)
 *  4. Upsert vehicle in PostgreSQL
 *  5. Generate embedding and upsert in Qdrant (AI search)
 *  6. Store vehicle node in Neo4j (relationship queries)
 *  7. Return detailed IntakeResult
 *
 * Every step degrades gracefully -- a Qdrant outage or missing API key
 * does not prevent the vehicle from being stored in the primary database.
 */

import { query } from "@/lib/db";
import { embedText, getVectorDimension } from "@/lib/embeddings";
import {
  createCollection,
  upsertPoints,
  healthCheck as qdrantHealthCheck,
} from "@/lib/qdrant-client";
import { normalizeVehicle } from "@/lib/dms/normalizer";
import type { DMSProvider } from "@/lib/dms/types";
import { generateListing } from "./listing-generator";
import { processVehiclePhotos, type RawPhoto } from "./photo-processor";
import type { Vehicle } from "@/types/vehicle";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface IntakeResult {
  vin: string;
  status: "created" | "updated" | "skipped" | "error";
  description_generated: boolean;
  photos_processed: number;
  indexed_in_qdrant: boolean;
  indexed_in_neo4j: boolean;
  errors: string[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const VEHICLE_COLLECTION = "wolfpack_vehicles";
const BATCH_SIZE = 10;

/* ------------------------------------------------------------------ */
/*  Neo4j helper (lightweight HTTP API)                                */
/* ------------------------------------------------------------------ */

async function upsertNeo4jVehicle(vehicle: Partial<Vehicle>): Promise<boolean> {
  const neo4jUrl = process.env.NEO4J_URL;
  if (!neo4jUrl) return false;

  const neo4jUser = process.env.NEO4J_USER ?? "neo4j";
  const neo4jPassword = process.env.NEO4J_PASSWORD ?? "";

  const cypher = `
    MERGE (v:Vehicle {vin: $vin})
    SET v.year = $year,
        v.make = $make,
        v.model = $model,
        v.trim = $trim,
        v.body_style = $body_style,
        v.price = $price,
        v.mileage = $mileage,
        v.condition = $condition,
        v.fuel_type = $fuel_type,
        v.drivetrain = $drivetrain,
        v.exterior_color = $exterior_color,
        v.updated_at = datetime()
    WITH v
    MERGE (m:Make {name: $make})
    MERGE (v)-[:MADE_BY]->(m)
    WITH v
    MERGE (md:Model {name: $model, make: $make})
    MERGE (v)-[:IS_MODEL]->(md)
    WITH v
    MERGE (bs:BodyStyle {name: $body_style})
    MERGE (v)-[:HAS_BODY_STYLE]->(bs)
    RETURN v.vin AS vin
  `;

  try {
    const res = await fetch(`${neo4jUrl}/db/neo4j/tx/commit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${neo4jUser}:${neo4jPassword}`).toString("base64")}`,
      },
      body: JSON.stringify({
        statements: [
          {
            statement: cypher,
            parameters: {
              vin: vehicle.vin ?? "",
              year: vehicle.year ?? 0,
              make: vehicle.make ?? "",
              model: vehicle.model ?? "",
              trim: vehicle.trim ?? "",
              body_style: vehicle.body_style ?? "",
              price: vehicle.price ?? 0,
              mileage: vehicle.mileage ?? 0,
              condition: vehicle.condition ?? "used",
              fuel_type: vehicle.fuel_type ?? "gasoline",
              drivetrain: vehicle.drivetrain ?? "fwd",
              exterior_color: vehicle.exterior_color ?? "",
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return false;

    const data = (await res.json()) as { errors: unknown[] };
    return data.errors.length === 0;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Qdrant indexing                                                     */
/* ------------------------------------------------------------------ */

function vinToId(vin: string): number {
  let hash = 0;
  for (let i = 0; i < vin.length; i++) {
    hash = (hash * 31 + vin.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

async function indexInQdrant(vehicle: Partial<Vehicle>): Promise<boolean> {
  const healthy = await qdrantHealthCheck();
  if (!healthy) return false;

  try {
    const dim = getVectorDimension();
    const ready = await createCollection(VEHICLE_COLLECTION, dim);
    if (!ready) return false;

    const searchText = [
      String(vehicle.year ?? ""),
      vehicle.make ?? "",
      vehicle.model ?? "",
      vehicle.trim ?? "",
      vehicle.body_style ?? "",
      vehicle.fuel_type ?? "",
      vehicle.drivetrain ?? "",
      vehicle.exterior_color ?? "",
      vehicle.interior_color ?? "",
      vehicle.condition ?? "",
      vehicle.mileage ? `${vehicle.mileage} miles` : "",
      vehicle.price ? `$${vehicle.price}` : "",
      vehicle.engine ?? "",
      ...(vehicle.features ?? []),
    ].join(" ");

    const vector = await embedText(searchText);

    return await upsertPoints(VEHICLE_COLLECTION, [
      {
        id: vinToId(vehicle.vin ?? ""),
        vector,
        payload: {
          vin: vehicle.vin,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim,
          price: vehicle.price,
          mileage: vehicle.mileage,
          condition: vehicle.condition,
          bodyStyle: vehicle.body_style,
          exteriorColor: vehicle.exterior_color,
          interiorColor: vehicle.interior_color,
          drivetrain: vehicle.drivetrain,
          fuel: vehicle.fuel_type,
          transmission: vehicle.transmission,
          engine: vehicle.engine,
          features: vehicle.features,
        },
      },
    ]);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Single vehicle intake                                              */
/* ------------------------------------------------------------------ */

/**
 * Process a single vehicle through the full intake pipeline.
 *
 * Steps:
 *  1. Validate and normalize data
 *  2. Generate listing description if missing
 *  3. Process photos (download, optimize, upload)
 *  4. Upsert in PostgreSQL
 *  5. Index in Qdrant (vector search)
 *  6. Store in Neo4j (graph queries)
 */
export async function processVehicleIntake(
  vehicle: Partial<Vehicle>,
  dealerId: string,
): Promise<IntakeResult> {
  const errors: string[] = [];
  const vin = vehicle.vin ?? "";

  if (!vin) {
    return {
      vin: "",
      status: "error",
      description_generated: false,
      photos_processed: 0,
      indexed_in_qdrant: false,
      indexed_in_neo4j: false,
      errors: ["Missing VIN"],
    };
  }

  // ------------------------------------------------------------------
  // Step 1: Validate required fields
  // ------------------------------------------------------------------

  if (!vehicle.year || !vehicle.make || !vehicle.model || !vehicle.price) {
    return {
      vin,
      status: "error",
      description_generated: false,
      photos_processed: 0,
      indexed_in_qdrant: false,
      indexed_in_neo4j: false,
      errors: ["Missing required fields: year, make, model, and price are required"],
    };
  }

  // ------------------------------------------------------------------
  // Step 2: Generate listing description if missing
  // ------------------------------------------------------------------

  let descriptionGenerated = false;

  if (!vehicle.description || vehicle.description.trim() === "") {
    try {
      const listing = await generateListing(vehicle);
      vehicle.description = listing.description;
      descriptionGenerated = true;
    } catch (err) {
      errors.push(
        `Listing generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Step 3: Process photos
  // ------------------------------------------------------------------

  let photosProcessed = 0;

  if (vehicle.photos && vehicle.photos.length > 0) {
    try {
      const rawPhotos: RawPhoto[] = vehicle.photos.map((p) => ({
        url: p.url,
        alt: p.alt,
      }));

      const processed = await processVehiclePhotos(rawPhotos, dealerId, vin);
      photosProcessed = processed.length;

      if (processed.length > 0) {
        vehicle.photos = processed.map((p) => ({
          url: p.url,
          alt: p.alt,
          sort_order: p.sort_order,
          is_primary: p.is_primary,
        }));
        vehicle.photo_count = processed.length;
      }
    } catch (err) {
      errors.push(
        `Photo processing failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Step 4: Upsert in PostgreSQL
  // ------------------------------------------------------------------

  let dbStatus: "created" | "updated" | "error" = "error";

  try {
    const existing = await query<{ id: string }>(
      `SELECT id FROM vehicles WHERE dealer_id = $1 AND vin = $2`,
      [dealerId, vin],
    );

    if (existing.rows.length > 0) {
      await query(
        `UPDATE vehicles SET
          stock_number    = $3,
          year            = $4,
          make            = $5,
          model           = $6,
          trim            = $7,
          body_style      = $8,
          exterior_color  = $9,
          interior_color  = $10,
          engine          = $11,
          transmission    = $12,
          drivetrain      = $13,
          fuel_type       = $14,
          mpg_city        = $15,
          mpg_highway     = $16,
          msrp            = $17,
          price           = $18,
          internet_price  = $19,
          condition       = $20,
          mileage         = $21,
          status          = $22,
          photos          = $23,
          photo_count     = $24,
          description     = $25,
          features        = $26,
          updated_at      = now()
        WHERE dealer_id = $1 AND vin = $2`,
        [
          dealerId,
          vin,
          vehicle.stock_number ?? "",
          vehicle.year,
          vehicle.make,
          vehicle.model,
          vehicle.trim ?? "",
          vehicle.body_style ?? "",
          vehicle.exterior_color ?? "",
          vehicle.interior_color ?? "",
          vehicle.engine ?? "",
          vehicle.transmission ?? "automatic",
          vehicle.drivetrain ?? "fwd",
          vehicle.fuel_type ?? "gasoline",
          vehicle.mpg_city ?? null,
          vehicle.mpg_highway ?? null,
          vehicle.msrp ?? null,
          vehicle.price,
          vehicle.internet_price ?? null,
          vehicle.condition ?? "used",
          vehicle.mileage ?? 0,
          vehicle.status ?? "available",
          JSON.stringify(vehicle.photos ?? []),
          vehicle.photo_count ?? 0,
          vehicle.description ?? "",
          JSON.stringify(vehicle.features ?? []),
        ],
      );
      dbStatus = "updated";
    } else {
      await query(
        `INSERT INTO vehicles (
          dealer_id, vin, stock_number, year, make, model, trim,
          body_style, exterior_color, interior_color, engine,
          transmission, drivetrain, fuel_type, mpg_city, mpg_highway,
          msrp, price, internet_price, condition, mileage, status,
          photos, photo_count, description, features
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22,
          $23, $24, $25, $26
        )`,
        [
          dealerId,
          vin,
          vehicle.stock_number ?? "",
          vehicle.year,
          vehicle.make,
          vehicle.model,
          vehicle.trim ?? "",
          vehicle.body_style ?? "",
          vehicle.exterior_color ?? "",
          vehicle.interior_color ?? "",
          vehicle.engine ?? "",
          vehicle.transmission ?? "automatic",
          vehicle.drivetrain ?? "fwd",
          vehicle.fuel_type ?? "gasoline",
          vehicle.mpg_city ?? null,
          vehicle.mpg_highway ?? null,
          vehicle.msrp ?? null,
          vehicle.price,
          vehicle.internet_price ?? null,
          vehicle.condition ?? "used",
          vehicle.mileage ?? 0,
          vehicle.status ?? "available",
          JSON.stringify(vehicle.photos ?? []),
          vehicle.photo_count ?? 0,
          vehicle.description ?? "",
          JSON.stringify(vehicle.features ?? []),
        ],
      );
      dbStatus = "created";
    }
  } catch (err) {
    errors.push(
      `Database error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return {
      vin,
      status: "error",
      description_generated: descriptionGenerated,
      photos_processed: photosProcessed,
      indexed_in_qdrant: false,
      indexed_in_neo4j: false,
      errors,
    };
  }

  // ------------------------------------------------------------------
  // Step 5: Index in Qdrant (non-blocking — DB is the source of truth)
  // ------------------------------------------------------------------

  let indexedInQdrant = false;
  try {
    indexedInQdrant = await indexInQdrant(vehicle);
  } catch (err) {
    errors.push(
      `Qdrant indexing failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ------------------------------------------------------------------
  // Step 6: Store in Neo4j (non-blocking)
  // ------------------------------------------------------------------

  let indexedInNeo4j = false;
  try {
    indexedInNeo4j = await upsertNeo4jVehicle(vehicle);
  } catch (err) {
    errors.push(
      `Neo4j upsert failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return {
    vin,
    status: dbStatus,
    description_generated: descriptionGenerated,
    photos_processed: photosProcessed,
    indexed_in_qdrant: indexedInQdrant,
    indexed_in_neo4j: indexedInNeo4j,
    errors,
  };
}

/* ------------------------------------------------------------------ */
/*  Bulk intake                                                        */
/* ------------------------------------------------------------------ */

/**
 * Process multiple vehicles in batches.
 *
 * Processes vehicles in batches of 10 to balance throughput with
 * resource usage. Collects all results and returns them together.
 */
export async function processBulkIntake(
  vehicles: Partial<Vehicle>[],
  dealerId: string,
): Promise<IntakeResult[]> {
  const results: IntakeResult[] = [];

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < vehicles.length; i += BATCH_SIZE) {
    const batch = vehicles.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map((vehicle) => processVehicleIntake(vehicle, dealerId)),
    );

    results.push(...batchResults);
  }

  return results;
}
