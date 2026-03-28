/**
 * PUT  /api/admin/inventory/[vin]  — update a vehicle
 * DELETE /api/admin/inventory/[vin] — remove a vehicle from inventory
 */
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";

interface RouteContext {
  params: Promise<{ vin: string }>;
}

/* -------------------------------------------------------------------------- */
/* PUT /api/admin/inventory/[vin]                                             */
/* -------------------------------------------------------------------------- */

export async function PUT(req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ id: "shadow", vin: "SHADOW", updated: true, message: "Shadow mode — no database configured." });
  }

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

    // Build dynamic SET clause — only update fields the caller provides
    const allowedFields: Record<string, string> = {
      year: "year",
      make: "make",
      model: "model",
      trim: "trim",
      price: "price",
      msrp: "msrp",
      mileage: "mileage",
      condition: "condition",
      fuel_type: "fuel_type",
      transmission: "transmission",
      exterior_color: "exterior_color",
      interior_color: "interior_color",
      body_style: "body_style",
      description: "description",
      status: "status",
      stock_number: "stock_number",
      engine: "engine",
      drivetrain: "drivetrain",
    };

    const setClauses: string[] = [];
    const params: unknown[] = [dealerId, vin.toUpperCase()];
    let idx = 3;

    for (const [key, col] of Object.entries(allowedFields)) {
      if (key in body) {
        setClauses.push(`${col} = $${idx}`);
        params.push((body as Record<string, unknown>)[key]);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 },
      );
    }

    const sql = `
      UPDATE vehicles
      SET ${setClauses.join(", ")}, updated_at = NOW()
      WHERE dealer_id = $1 AND vin = $2
      RETURNING id, vin, year, make, model, trim, price, status, updated_at
    `;

    const { rows } = await pool.query(sql, params);
    const updated = rows[0];

    if (!updated) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    void auditLog("vehicle.update", {
      vin: vin.toUpperCase(),
      fields_changed: Object.keys(body as object).filter((k) => k in allowedFields),
    }).catch(() => {});

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PUT /api/admin/inventory/[vin]] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* DELETE /api/admin/inventory/[vin]                                          */
/* -------------------------------------------------------------------------- */

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ deleted: true, vin: "SHADOW" });
  }

  const dealerId = authResult.user.dealer_id;

  try {
    const { vin } = await context.params;
    if (!vin) {
      return NextResponse.json({ error: "VIN is required" }, { status: 400 });
    }

    const vinUpper = vin.toUpperCase();

    // Soft delete — preserve data for audit trail and recovery
    const { rows } = await pool.query(
      `UPDATE vehicles
       SET deleted_at = NOW()
       WHERE dealer_id = $1 AND vin = $2 AND deleted_at IS NULL
       RETURNING vin, year, make, model`,
      [dealerId, vinUpper],
    );

    const deleted = rows[0];

    if (!deleted) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    void auditLog("vehicle.delete", {
      vin: vinUpper,
      make: deleted.make,
      model: deleted.model,
    }).catch(() => {});

    return NextResponse.json({ deleted: true, vin: vinUpper });
  } catch (err) {
    console.error("[DELETE /api/admin/inventory/[vin]] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
