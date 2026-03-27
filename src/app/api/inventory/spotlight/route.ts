/**
 * GET /api/inventory/spotlight
 *
 * Returns up to `limit` spotlight vehicles for a dealer — used on the
 * homepage hero carousel and marketing landing pages.
 *
 * Query params:
 *   dealer_id  (required) — UUID of the dealer
 *   limit      (optional, default 6, max 12) — number of vehicles to return
 *
 * Response: { vehicles: VehicleSummary[], total: number, source: "db"|"sample" }
 */
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAMPLE_VEHICLES = [
  {
    id: "sample-1",
    vin: "1HGBH41JXMN109186",
    year: 2024,
    make: "Honda",
    model: "Accord",
    trim: "Sport",
    price: 28999,
    condition: "new",
    exterior_color: "Sonic Gray Pearl",
    photo_url: null,
    is_featured: true,
  },
  {
    id: "sample-2",
    vin: "1FTFW1ET5EFC28161",
    year: 2023,
    make: "Ford",
    model: "F-150",
    trim: "XLT",
    price: 42500,
    condition: "used",
    exterior_color: "Oxford White",
    photo_url: null,
    is_featured: true,
  },
  {
    id: "sample-3",
    vin: "5YJSA1E26MF424792",
    year: 2024,
    make: "Tesla",
    model: "Model S",
    trim: "Long Range",
    price: 79999,
    condition: "new",
    exterior_color: "Pearl White",
    photo_url: null,
    is_featured: true,
  },
];

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const dealerId = searchParams.get("dealer_id");
  const limitParam = searchParams.get("limit") ?? "6";

  // Validate dealer_id
  if (!dealerId) {
    return NextResponse.json(
      { error: "dealer_id query parameter is required" },
      { status: 400 },
    );
  }
  if (!UUID_RE.test(dealerId)) {
    return NextResponse.json(
      { error: "dealer_id must be a valid UUID" },
      { status: 400 },
    );
  }

  // Validate limit
  const limit = parseInt(limitParam, 10);
  if (isNaN(limit) || limit < 1 || limit > 12) {
    return NextResponse.json(
      { error: "limit must be between 1 and 12" },
      { status: 400 },
    );
  }

  try {
    const result = await query(
      `SELECT
         v.id,
         v.vin,
         v.year,
         v.make,
         v.model,
         v.trim,
         v.price,
         v.condition,
         v.exterior_color,
         (v.photos->0->>'url') AS photo_url,
         COALESCE((v.metadata->>'is_featured')::boolean, false) AS is_featured
       FROM vehicles v
       WHERE v.dealer_id = $1
         AND v.status = 'available'
       ORDER BY
         COALESCE((v.metadata->>'is_featured')::boolean, false) DESC,
         v.created_at DESC
       LIMIT $2`,
      [dealerId, limit],
    );

    // Strip internal fields before sending to client
    const vehicles = result.rows.map(({ dealer_id: _d, deleted_at: _del, internal_cost: _ic, ...safe }) => safe);
    return NextResponse.json({
      vehicles,
      total: vehicles.length,
      source: "db",
    });
  } catch {
    // DB unavailable — return sample data so the homepage always renders
    return NextResponse.json({
      vehicles: SAMPLE_VEHICLES.slice(0, limit),
      total: SAMPLE_VEHICLES.length,
      source: "sample",
    });
  }
}
