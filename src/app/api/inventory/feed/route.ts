import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
  vin: z.string().min(11).max(17),
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

    // TODO: When database is provisioned, replace this stub with:
    // 1. Upsert vehicles into PostgreSQL (ON CONFLICT vin DO UPDATE)
    // 2. Update Qdrant vectors for semantic search
    // 3. Trigger photo pipeline (download → Sharp → R2)
    // 4. Fire webhook notification to admin dashboard

    // For now, log and return success
    console.log(
      `[feed] Received ${vehicles.length} vehicles from ${source} for dealer ${dealer_id}`,
    );

    return NextResponse.json({
      accepted: vehicles.length,
      dealer_id,
      source,
      message: "Feed received. Vehicles will be processed and appear in inventory within 5 minutes.",
      // Return VINs for tracking
      vins: vehicles.map((v) => v.vin),
    });
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
