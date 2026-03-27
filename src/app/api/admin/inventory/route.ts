/**
 * POST /api/admin/inventory
 *
 * Create a new vehicle in inventory. Thin wrapper around the canonical
 * /api/admin/vehicles route so both URL shapes work from the admin UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";

const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/i;

export async function POST(req: NextRequest) {
  // Authentication
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  try {
    const body = await req.json();

    const {
      vin,
      year,
      make,
      model,
      trim,
      price,
      msrp,
      mileage,
      condition,
      fuel_type,
      transmission,
      exterior_color,
      body_style,
      description,
      status,
    } = body as Record<string, unknown>;

    // Validate required fields
    const missing: string[] = [];
    if (!vin || typeof vin !== "string") missing.push("vin");
    if (typeof year !== "number" || (year as number) < 1900) missing.push("year (number >= 1900)");
    if (!make || typeof make !== "string") missing.push("make");
    if (!model || typeof model !== "string") missing.push("model");
    if (typeof price !== "number" || (price as number) <= 0) missing.push("price (number > 0)");

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing or invalid required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const vinStr = (vin as string).toUpperCase();

    if (!VIN_PATTERN.test(vinStr)) {
      return NextResponse.json(
        { error: "VIN must be exactly 17 characters (A-Z, 0-9, no I/O/Q)" },
        { status: 400 },
      );
    }

    const { rows } = await pool.query(
      `INSERT INTO vehicles (
         dealer_id, vin,
         year, make, model, trim,
         price, msrp,
         mileage, condition,
         fuel_type, transmission,
         exterior_color, body_style,
         description, status,
         created_at, updated_at
       ) VALUES (
         $1, $2,
         $3, $4, $5, $6,
         $7, $8,
         $9, $10,
         $11, $12,
         $13, $14,
         $15, $16,
         NOW(), NOW()
       )
       RETURNING id, vin, year, make, model, trim, price, status, created_at`,
      [
        dealerId,
        vinStr,
        year,
        make,
        model,
        trim ?? null,
        price,
        msrp ?? price,
        mileage ?? 0,
        condition ?? "used",
        fuel_type ?? "gasoline",
        transmission ?? "automatic",
        exterior_color ?? null,
        body_style ?? null,
        description ?? null,
        status ?? "available",
      ],
    );

    const created = rows[0];

    void auditLog("vehicle.create", {
      vin: vinStr,
      make: make as string,
      model: model as string,
    }).catch(() => {});

    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const pgErr = err as { code?: string; message?: string };
    if (pgErr?.code === "23505") {
      return NextResponse.json(
        { error: "A vehicle with this VIN already exists for this dealer" },
        { status: 409 },
      );
    }
    console.error("[POST /api/admin/inventory] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
