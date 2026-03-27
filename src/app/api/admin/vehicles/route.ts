import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { embedText } from "@/lib/embeddings";
import { upsertPoints, createCollection, type QdrantPoint } from "@/lib/qdrant-client";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";
const QDRANT_COLLECTION = "vehicles";
const VECTOR_DIM = 384;

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

interface VehiclePayload {
  vin: string;
  stock_number?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  body_style?: string;
  exterior_color?: string;
  interior_color?: string;
  engine?: string;
  transmission?: string;
  drivetrain?: string;
  fuel_type?: string;
  mpg_city?: number | null;
  mpg_highway?: number | null;
  msrp?: number | null;
  price: number;
  internet_price?: number | null;
  condition?: string;
  mileage?: number;
  status?: string;
  photos?: Array<{
    url: string;
    alt: string;
    sort_order: number;
    is_primary: boolean;
  }>;
  description?: string;
  features?: string[];
}

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/i;

function validatePayload(
  body: unknown,
): { data: VehiclePayload; error: null } | { data: null; error: string } {
  if (!body || typeof body !== "object") {
    return { data: null, error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  // Required fields
  if (!b.vin || typeof b.vin !== "string") {
    return { data: null, error: "vin is required (string)" };
  }
  if (!VIN_PATTERN.test(b.vin)) {
    return { data: null, error: "vin must be 17 alphanumeric characters (no I, O, Q)" };
  }
  if (typeof b.year !== "number" || b.year < 1900) {
    return { data: null, error: "year is required (number >= 1900)" };
  }
  if (!b.make || typeof b.make !== "string") {
    return { data: null, error: "make is required (string)" };
  }
  if (!b.model || typeof b.model !== "string") {
    return { data: null, error: "model is required (string)" };
  }
  if (typeof b.price !== "number" || b.price <= 0) {
    return { data: null, error: "price is required (number > 0)" };
  }

  return {
    data: {
      vin: (b.vin as string).toUpperCase(),
      stock_number: str(b.stock_number, ""),
      year: b.year as number,
      make: b.make as string,
      model: b.model as string,
      trim: str(b.trim, ""),
      body_style: str(b.body_style, ""),
      exterior_color: str(b.exterior_color, ""),
      interior_color: str(b.interior_color, ""),
      engine: str(b.engine, ""),
      transmission: str(b.transmission, "automatic"),
      drivetrain: str(b.drivetrain, "fwd"),
      fuel_type: str(b.fuel_type, "gasoline"),
      mpg_city: nullableNum(b.mpg_city),
      mpg_highway: nullableNum(b.mpg_highway),
      msrp: nullableNum(b.msrp),
      price: b.price as number,
      internet_price: nullableNum(b.internet_price),
      condition: str(b.condition, "used"),
      mileage: typeof b.mileage === "number" ? b.mileage : 0,
      status: str(b.status, "available"),
      photos: Array.isArray(b.photos) ? b.photos as VehiclePayload["photos"] : [],
      description: str(b.description, ""),
      features: Array.isArray(b.features) ? (b.features as string[]) : [],
    },
    error: null,
  };
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function nullableNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/* -------------------------------------------------------------------------- */
/* Qdrant indexing helper                                                     */
/* -------------------------------------------------------------------------- */

async function indexVehicleInQdrant(data: VehiclePayload, dealerId: string) {
  try {
    await createCollection(QDRANT_COLLECTION, VECTOR_DIM);

    const text = [
      String(data.year),
      data.make,
      data.model,
      data.trim,
      data.body_style,
      data.condition,
      data.exterior_color,
      data.engine,
      data.fuel_type,
      data.description,
      ...(data.features ?? []),
    ]
      .filter(Boolean)
      .join(" ");

    const vector = await embedText(text);

    const point: QdrantPoint = {
      id: data.vin,
      vector,
      payload: {
        vin: data.vin,
        dealer_id: dealerId,
        year: data.year,
        make: data.make,
        model: data.model,
        trim: data.trim ?? "",
        price: data.price,
        condition: data.condition ?? "used",
        status: data.status ?? "available",
        body_style: data.body_style ?? "",
        photo_url: data.photos?.[0]?.url ?? "",
      },
    };

    await upsertPoints(QDRANT_COLLECTION, [point]);
  } catch (err) {
    // Non-critical: log and continue
    console.error("[admin/vehicles] Qdrant indexing failed:", err);
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/vehicles                                                   */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  // --- Authentication ---
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  try {
    const body = await req.json();
    const { data, error } = validatePayload(body);

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const d = data!;

    // Insert into PostgreSQL
    const result = await query(
      `INSERT INTO vehicles (
        dealer_id, vin, stock_number,
        year, make, model, trim, body_style,
        exterior_color, interior_color,
        engine, transmission, drivetrain, fuel_type,
        mpg_city, mpg_highway,
        msrp, price, internet_price,
        condition, mileage, status,
        photos, photo_count,
        description, features
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7, $8,
        $9, $10,
        $11, $12, $13, $14,
        $15, $16,
        $17, $18, $19,
        $20, $21, $22,
        $23, $24,
        $25, $26
      )
      RETURNING id, vin, year, make, model, trim, price, status, created_at`,
      [
        dealerId,
        d.vin,
        d.stock_number,
        d.year,
        d.make,
        d.model,
        d.trim,
        d.body_style,
        d.exterior_color,
        d.interior_color,
        d.engine,
        d.transmission,
        d.drivetrain,
        d.fuel_type,
        d.mpg_city,
        d.mpg_highway,
        d.msrp,
        d.price,
        d.internet_price,
        d.condition,
        d.mileage,
        d.status,
        JSON.stringify(d.photos ?? []),
        d.photos?.length ?? 0,
        d.description,
        JSON.stringify(d.features ?? []),
      ],
    );

    const created = (result.rows as any[])[0];

    // Audit log: record vehicle creation (fire-and-forget)
    void auditLog("vehicle.create", {
      vin: d.vin,
      make: d.make,
      model: d.model,
    }).catch(() => {});

    // Index in Qdrant (async, non-blocking for the response)
    indexVehicleInQdrant(d, dealerId).catch(() => {});

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    // Handle unique constraint violation (duplicate VIN for dealer)
    if (err?.code === "23505") {
      return NextResponse.json(
        { error: "A vehicle with this VIN already exists for this dealer" },
        { status: 409 },
      );
    }

    console.error("[POST /api/admin/vehicles] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
