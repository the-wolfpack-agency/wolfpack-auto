import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { upsertPoints, createCollection, type QdrantPoint } from "@/lib/qdrant-client";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";
const QDRANT_COLLECTION = "vehicles";
const VECTOR_DIM = 384;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface RouteContext {
  params: Promise<{ vin: string }>;
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/vehicles/[vin]                                              */
/* -------------------------------------------------------------------------- */

export async function GET(
  _req: NextRequest,
  context: RouteContext,
) {
  // --- Authentication ---
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  try {
    const { vin } = await context.params;

    if (!vin) {
      return NextResponse.json({ error: "VIN is required" }, { status: 400 });
    }

    const result = await query(
      `SELECT
        id, vin, stock_number,
        year, make, model, trim, body_style,
        exterior_color, interior_color,
        engine, transmission, drivetrain, fuel_type,
        mpg_city, mpg_highway,
        msrp, price, internet_price,
        condition, mileage, status,
        photos, photo_count,
        description, features,
        created_at, updated_at
      FROM vehicles
      WHERE dealer_id = $1 AND vin = $2
      LIMIT 1`,
      [dealerId, vin.toUpperCase()],
    );

    const vehicle = (result.rows as any[])[0];

    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    return NextResponse.json(vehicle);
  } catch (err) {
    console.error("[GET /api/admin/vehicles/[vin]] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* PUT /api/admin/vehicles/[vin]                                              */
/* -------------------------------------------------------------------------- */

export async function PUT(
  req: NextRequest,
  context: RouteContext,
) {
  // --- Authentication ---
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  try {
    const { vin } = await context.params;

    if (!vin) {
      return NextResponse.json({ error: "VIN is required" }, { status: 400 });
    }

    const body = await req.json();

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      );
    }

    // Build dynamic SET clause from provided fields
    const allowedFields: Record<string, string> = {
      stock_number: "stock_number",
      year: "year",
      make: "make",
      model: "model",
      trim: "trim",
      body_style: "body_style",
      exterior_color: "exterior_color",
      interior_color: "interior_color",
      engine: "engine",
      transmission: "transmission",
      drivetrain: "drivetrain",
      fuel_type: "fuel_type",
      mpg_city: "mpg_city",
      mpg_highway: "mpg_highway",
      msrp: "msrp",
      price: "price",
      internet_price: "internet_price",
      condition: "condition",
      mileage: "mileage",
      status: "status",
      description: "description",
    };

    const setClauses: string[] = [];
    const params: unknown[] = [dealerId, vin.toUpperCase()];
    let idx = 3;

    for (const [key, col] of Object.entries(allowedFields)) {
      if (key in body) {
        setClauses.push(`${col} = $${idx}`);
        params.push(body[key]);
        idx++;
      }
    }

    // Handle photos (JSONB) — merge or replace
    if ("photos" in body && Array.isArray(body.photos)) {
      setClauses.push(`photos = $${idx}`);
      params.push(JSON.stringify(body.photos));
      idx++;

      setClauses.push(`photo_count = $${idx}`);
      params.push(body.photos.length);
      idx++;
    }

    // Handle features (JSONB)
    if ("features" in body && Array.isArray(body.features)) {
      setClauses.push(`features = $${idx}`);
      params.push(JSON.stringify(body.features));
      idx++;
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 },
      );
    }

    const sql = `
      UPDATE vehicles
      SET ${setClauses.join(", ")}, updated_at = now()
      WHERE dealer_id = $1 AND vin = $2
      RETURNING id, vin, year, make, model, trim, price, status, updated_at
    `;

    const result = await query(sql, params);
    const updated = (result.rows as any[])[0];

    if (!updated) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    // Audit log: record vehicle update (fire-and-forget)
    void auditLog("vehicle.update", {
      vin: vin.toUpperCase(),
      fields_changed: Object.keys(body).filter((k) => k in allowedFields || k === "photos" || k === "features"),
    }).catch(() => {});

    // Re-index in Qdrant
    reindexVehicle(vin.toUpperCase(), body, dealerId).catch(() => {});

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PUT /api/admin/vehicles/[vin]] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Qdrant re-index helper                                                     */
/* -------------------------------------------------------------------------- */

async function reindexVehicle(vin: string, data: Record<string, unknown>, dealerId: string) {
  try {
    await createCollection(QDRANT_COLLECTION, VECTOR_DIM);

    const text = [
      data.year != null ? String(data.year) : "",
      data.make,
      data.model,
      data.trim,
      data.body_style,
      data.condition,
      data.exterior_color,
      data.engine,
      data.fuel_type,
      data.description,
      ...(Array.isArray(data.features) ? data.features : []),
    ]
      .filter(Boolean)
      .join(" ");

    if (!text.trim()) return;

    const vector = await embedText(text);

    const point: QdrantPoint = {
      id: vin,
      vector,
      payload: {
        vin,
        dealer_id: dealerId,
        year: data.year,
        make: data.make,
        model: data.model,
        trim: data.trim ?? "",
        price: data.price,
        condition: data.condition ?? "used",
        status: data.status ?? "available",
        body_style: data.body_style ?? "",
        photo_url: Array.isArray(data.photos) ? (data.photos[0] as any)?.url ?? "" : "",
      },
    };

    await upsertPoints(QDRANT_COLLECTION, [point]);
  } catch (err) {
    console.error("[admin/vehicles] Qdrant re-index failed:", err);
  }
}
