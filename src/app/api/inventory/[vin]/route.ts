import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { esClient, VEHICLES_INDEX } from "@/lib/elasticsearch";
import { cacheGet, cacheSet } from "@/lib/cache";

/**
 * VIN format: 17 alphanumeric characters (excluding I, O, Q).
 */
const vinSchema = z
  .string()
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/i, "Invalid VIN format");

const querySchema = z.object({
  dealer_id: z.string().min(1, "dealer_id is required"),
});

interface VehicleDoc {
  vin: string;
  dealer_id: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  body_style: string;
  exterior_color: string;
  interior_color: string;
  engine: string;
  transmission: string;
  drivetrain: string;
  fuel_type: string;
  mpg_city: number | null;
  mpg_highway: number | null;
  msrp: number | null;
  price: number;
  internet_price: number | null;
  condition: string;
  mileage: number;
  status: string;
  description: string;
  features: string;
  photo_url: string | null;
  photo_count: number;
  stock_number: string;
  created_at: string;
  updated_at: string;
  days_on_lot: number;
}

interface RelatedVehicle {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number;
  photo_url: string | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { vin: rawVin } = await params;
  const vinResult = vinSchema.safeParse(rawVin);

  if (!vinResult.success) {
    return NextResponse.json(
      { error: "Invalid VIN format" },
      { status: 400 },
    );
  }

  const vin = vinResult.data.toUpperCase();

  // Validate dealer_id from query params
  const rawParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const queryResult = querySchema.safeParse(rawParams);

  if (!queryResult.success) {
    return NextResponse.json(
      { error: "dealer_id query parameter is required" },
      { status: 400 },
    );
  }

  const { dealer_id } = queryResult.data;
  const docId = `${dealer_id}:${vin}`;
  const cacheKey = `inventory:vehicle:${docId}`;

  try {
    // Check cache
    const cached = await cacheGet<{ vehicle: VehicleDoc; related: RelatedVehicle[] }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Try Elasticsearch first, fall back to PostgreSQL
    let vehicle: VehicleDoc | null = null;
    let related: RelatedVehicle[] = [];

    try {
      const vehicleResponse = await esClient.get({
        index: VEHICLES_INDEX,
        id: docId,
      });
      vehicle = vehicleResponse._source as VehicleDoc;

      // Fetch related vehicles from ES
      const priceRange = {
        gte: Math.floor(vehicle.price * 0.8),
        lte: Math.ceil(vehicle.price * 1.2),
      };

      const relatedResponse = await esClient.search({
        index: VEHICLES_INDEX,
        body: {
          size: 6,
          _source: ["vin", "year", "make", "model", "trim", "price", "mileage", "photo_url"],
          query: {
            bool: {
              filter: [
                { term: { dealer_id } },
                { term: { status: "available" } },
              ],
              must_not: [{ term: { vin } }],
              should: [
                {
                  bool: {
                    must: [
                      { term: { make: vehicle.make } },
                      { term: { model: vehicle.model } },
                    ],
                    boost: 2.0,
                  },
                },
                { range: { price: priceRange } },
              ],
              minimum_should_match: 1,
            },
          },
        },
      });

      related = relatedResponse.hits.hits.map(
        (hit) => hit._source as RelatedVehicle,
      );
    } catch (esErr: unknown) {
      const err = esErr as { meta?: { statusCode?: number } };
      if (err?.meta?.statusCode === 404) {
        // ES says vehicle doesn't exist — try DB before returning 404
      }

      // Elasticsearch unavailable or 404 — fall back to PostgreSQL
      if (process.env.DATABASE_URL) {
        try {
          const { query: dbQuery } = await import("@/lib/db");
          const dbResult = await dbQuery<VehicleDoc>(
            `SELECT * FROM vehicles WHERE vin = $1 AND dealer_id = $2 AND deleted_at IS NULL LIMIT 1`,
            [vin, dealer_id],
          );

          if (dbResult.rows.length === 0) {
            return NextResponse.json(
              { error: "Vehicle not found" },
              { status: 404 },
            );
          }

          vehicle = dbResult.rows[0];

          // Fetch related from DB (same make or similar price)
          const relatedResult = await dbQuery<RelatedVehicle>(
            `SELECT vin, year, make, model, trim, price, mileage, photo_url
             FROM vehicles
             WHERE dealer_id = $1
               AND vin != $2
               AND status = 'available'
               AND deleted_at IS NULL
               AND (make = $3 OR price BETWEEN $4 AND $5)
             ORDER BY
               CASE WHEN make = $3 AND model = $6 THEN 0
                    WHEN make = $3 THEN 1
                    ELSE 2 END,
               ABS(price - $7)
             LIMIT 6`,
            [
              dealer_id,
              vin,
              vehicle.make,
              Math.floor(vehicle.price * 0.8),
              Math.ceil(vehicle.price * 1.2),
              vehicle.model,
              vehicle.price,
            ],
          );
          related = relatedResult.rows;
        } catch {
          // DB also failed — return 404 (graceful, not 503)
          return NextResponse.json(
            { error: "Vehicle not found" },
            { status: 404 },
          );
        }
      } else {
        // No ES, no DB — return 404 instead of 503
        return NextResponse.json(
          { error: "Vehicle not found" },
          { status: 404 },
        );
      }
    }

    if (!vehicle) {
      return NextResponse.json(
        { error: "Vehicle not found" },
        { status: 404 },
      );
    }

    const result = { vehicle, related };

    // Cache for 60 seconds
    void cacheSet(cacheKey, result, 60);

    return NextResponse.json(result);
  } catch (err) {
    console.error(`[api/inventory/${vin}] Fetch failed:`, err);

    // Return 404 instead of 503 — a missing vehicle is not a service failure
    return NextResponse.json(
      { error: "Vehicle not found" },
      { status: 404 },
    );
  }
}
