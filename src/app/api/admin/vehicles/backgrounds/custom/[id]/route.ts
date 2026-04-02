/**
 * GET    /api/admin/vehicles/backgrounds/custom/[id] — Get custom background details
 * PATCH  /api/admin/vehicles/backgrounds/custom/[id] — Update custom background metadata
 * DELETE /api/admin/vehicles/backgrounds/custom/[id] — Soft-delete custom background
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackBackground } from "@/lib/analytics-hooks";
import { validateCustomBackgroundInput } from "@/lib/background-generator";

/* -------------------------------------------------------------------------- */
/* GET                                                                         */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id;
  const { id } = await params;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { query } = await import("@/lib/db");
    const { rows } = await query(
      `SELECT * FROM custom_backgrounds WHERE id = $1::uuid AND dealer_id = $2`,
      [id, dealerId],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Background not found" }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("[api/custom/[id]] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH                                                                       */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id;
  const { id } = await params;

  let body: {
    name?: string;
    description?: string;
    category?: string;
    tags?: string[];
    position?: string;
    fit?: string;
    overlay_opacity?: number;
    sort_order?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate fields that are present
  const validation = validateCustomBackgroundInput({
    name: body.name,
    category: body.category,
    position: body.position,
    fit: body.fit,
    overlay_opacity: body.overlay_opacity,
  });
  // Only validate name if it was actually provided
  const errors = validation.errors.filter((e) => {
    if (e.includes("Name is required") && body.name === undefined) return false;
    return true;
  });
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { query } = await import("@/lib/db");

    // Build dynamic UPDATE
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const addField = (col: string, val: unknown) => {
      if (val !== undefined) {
        sets.push(`${col} = $${idx++}`);
        values.push(val);
      }
    };

    addField("name", body.name);
    addField("description", body.description);
    addField("category", body.category);
    addField("tags", body.tags);
    addField("position", body.position);
    addField("fit", body.fit);
    addField("overlay_opacity", body.overlay_opacity);
    addField("sort_order", body.sort_order);

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id, dealerId);
    const idIdx = idx++;
    const dealerIdx = idx;

    const { rows } = await query(
      `UPDATE custom_backgrounds SET ${sets.join(", ")}
       WHERE id = $${idIdx}::uuid AND dealer_id = $${dealerIdx}
       RETURNING *`,
      values,
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Background not found" }, { status: 404 });
    }

    trackBackground("background.custom_updated", dealerId, {
      background_id: id,
      fields_updated: sets.length,
    });

    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("[api/custom/[id]] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* DELETE (soft delete)                                                         */
/* -------------------------------------------------------------------------- */

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id;
  const { id } = await params;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { query } = await import("@/lib/db");

    // Soft delete
    const { rowCount } = await query(
      `UPDATE custom_backgrounds SET is_active = false
       WHERE id = $1::uuid AND dealer_id = $2 AND is_active = true`,
      [id, dealerId],
    );

    if (rowCount === 0) {
      return NextResponse.json({ error: "Background not found" }, { status: 404 });
    }

    // Deactivate any assignments using this background
    await query(
      `UPDATE vehicle_background_assignments SET is_active = false
       WHERE custom_bg_id = $1::uuid AND dealer_id = $2 AND is_active = true`,
      [id, dealerId],
    );

    trackBackground("background.custom_deleted", dealerId, {
      background_id: id,
    });

    return NextResponse.json({ deleted: true, id });
  } catch (err) {
    console.error("[api/custom/[id]] DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
