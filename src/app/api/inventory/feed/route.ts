import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { trackSystem } from "@/lib/analytics-hooks";

/**
 * POST /api/inventory/feed — DMS vehicle feed ingestion endpoint.
 *
 * This is the plug-in point for real dealer inventory data.
 * Accepts vehicle data in a normalized format from any DMS provider.
 *
 * Supported DMS systems (via adapter pattern):
 *  - vAuto / Provision (Cox Automotive)
 *  - DealerSocket
 *  - CDK Global / Fortellis
 *  - Frazer / Wayne Reaves
 *  - HomeNet / Dealer.com
 *  - Manual CSV upload
 *  - Generic webhook
 *
 * To connect a real DMS:
 *  1. Set DEALER_FEED_API_KEY in environment
 *  2. Point DMS webhook to POST /api/inventory/feed
 *  3. Map DMS fields to the schema below (or write an adapter in src/lib/dms-adapters/)
 */

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const VehicleSchema = z.object({
  vin: z.string().length(17, "VIN must be exactly 17 characters"),
  year: z.number().int().min(1900).max(2030),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  trim: z.string().max(100).default(""),
  price: z.number().min(0),
  msrp: z.number().min(0).optional(),
  mileage: z.number().int().min(0),
  condition: z.enum(["New", "Used", "Certified"]),
  bodyStyle: z.string().max(50).default(""),
  fuel: z.string().max(50).default("Gasoline"),
  transmission: z.string().max(50).default("Automatic"),
  drivetrain: z.string().max(50).default(""),
  engine: z.string().max(100).default(""),
  exteriorColor: z.string().max(100).default(""),
  interiorColor: z.string().max(100).default(""),
  mpg: z.string().max(50).default(""),
  stockNumber: z.string().max(50).default(""),
  features: z.array(z.string()).default([]),
  photos: z.array(z.string().url()).default([]),
  status: z.enum(["active", "pending", "sold", "removed"]).default("active"),
});

const FeedPayload = z.object({
  dealer_id: z.string().min(1),
  source: z.string().min(1), // "vauto", "dealersocket", "csv", "manual", etc.
  vehicles: z.array(VehicleSchema).min(1).max(500),
});

export type Vehicle = z.infer<typeof VehicleSchema>;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function validateApiKey(request: NextRequest): boolean {
  const key = process.env.DEALER_FEED_API_KEY;
  if (!key) return true; // No key configured = dev mode, allow all

  const provided = request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace("Bearer ", "");

  return provided === key;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const UPSERT_SQL = `
  INSERT INTO vehicles (
    dealer_id, vin, year, make, model, trim, price, msrp, mileage, condition,
    body_style, fuel, transmission, drivetrain, engine, exterior_color,
    interior_color, mpg, stock_number, features, photos, status, updated_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW()
  )
  ON CONFLICT (dealer_id, vin) DO UPDATE SET
    year = EXCLUDED.year,
    make = EXCLUDED.make,
    model = EXCLUDED.model,
    trim = EXCLUDED.trim,
    price = EXCLUDED.price,
    msrp = EXCLUDED.msrp,
    mileage = EXCLUDED.mileage,
    condition = EXCLUDED.condition,
    body_style = EXCLUDED.body_style,
    fuel = EXCLUDED.fuel,
    transmission = EXCLUDED.transmission,
    drivetrain = EXCLUDED.drivetrain,
    engine = EXCLUDED.engine,
    exterior_color = EXCLUDED.exterior_color,
    interior_color = EXCLUDED.interior_color,
    mpg = EXCLUDED.mpg,
    stock_number = EXCLUDED.stock_number,
    features = EXCLUDED.features,
    photos = EXCLUDED.photos,
    status = EXCLUDED.status,
    updated_at = NOW()
  RETURNING *
`;

interface UpsertResult {
  vehicle: Vehicle | Record<string, unknown>;
  persisted: boolean;
}

async function upsertVehicle(
  dealerId: string,
  v: Vehicle,
): Promise<UpsertResult> {
  // Shadow mode — no DATABASE_URL, skip DB entirely
  if (!process.env.DATABASE_URL) {
    return { vehicle: v, persisted: false };
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query(UPSERT_SQL, [
      dealerId,
      v.vin,
      v.year,
      v.make,
      v.model,
      v.trim,
      v.price,
      v.msrp ?? null,
      v.mileage,
      v.condition,
      v.bodyStyle,
      v.fuel,
      v.transmission,
      v.drivetrain,
      v.engine,
      v.exteriorColor,
      v.interiorColor,
      v.mpg,
      v.stockNumber,
      JSON.stringify(v.features),
      JSON.stringify(v.photos),
      v.status,
    ]);
    return { vehicle: result.rows[0] ?? v, persisted: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);
    // Table doesn't exist yet — graceful fallback
    if (message.includes("does not exist")) {
      console.warn(
        `[feed] vehicles table not yet created — running in shadow mode for VIN ${v.vin}`,
      );
      return { vehicle: v, persisted: false };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Auth check
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = FeedPayload.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "validation_failed",
          details: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 422 },
      );
    }

    const { dealer_id, source, vehicles } = parsed.data;

    const results: UpsertResult[] = [];
    for (const v of vehicles) {
      const result = await upsertVehicle(dealer_id, v);
      results.push(result);

      // Fire analytics for every vehicle — even in shadow mode
      trackSystem("system.vehicle_added", dealer_id, {
        vin: v.vin,
        source,
        year: v.year,
        make: v.make,
        model: v.model,
        price: v.price,
        condition: v.condition,
        persisted: result.persisted,
      });
    }

    const persisted = results.filter((r) => r.persisted).length;
    const shadow = results.length - persisted;

    return NextResponse.json(
      {
        accepted: vehicles.length,
        persisted,
        shadow,
        dealer_id,
        source,
        vehicles: results.map((r) => r.vehicle),
        vins: vehicles.map((v) => v.vin),
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }
}

/**
 * GET /api/inventory/feed — Feed status / health check.
 */
export async function GET() {
  return NextResponse.json({
    status: "ready",
    supported_sources: [
      "vauto",
      "dealersocket",
      "cdk_fortellis",
      "frazer",
      "homenet",
      "csv",
      "manual",
      "webhook",
    ],
    schema_version: "1.0",
    max_batch_size: 500,
    auth_required: !!process.env.DEALER_FEED_API_KEY,
  });
}
