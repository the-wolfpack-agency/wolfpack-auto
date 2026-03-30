import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Zod schema                                                                 */
/* -------------------------------------------------------------------------- */

const updateLocationSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  address_street: z.string().max(500).optional(),
  address_city: z.string().max(100).optional(),
  address_state: z.string().max(50).optional(),
  address_zip: z.string().max(20).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email().or(z.literal("")).optional(),
  is_primary: z.boolean().optional(),
});

/* -------------------------------------------------------------------------- */
/* GET /api/admin/locations/[locationId] — Single location details            */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ locationId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = getDealerId(authResult);
  const { locationId } = await params;

  if (!locationId) {
    return NextResponse.json({ error: "Location ID is required" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      id: locationId,
      dealer_id: dealerId,
      name: "Main Showroom",
      address_street: "100 Auto Blvd",
      address_city: "Raleigh",
      address_state: "NC",
      address_zip: "27601",
      phone: "(919) 555-0100",
      email: "main@wolfpackmotors.com",
      is_primary: true,
      is_active: true,
      vehicle_count: 54,
    });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `SELECT dl.*,
              COALESCE(vc.cnt, 0)::int AS vehicle_count
       FROM dealer_locations dl
       LEFT JOIN (
         SELECT location_id, COUNT(*)::int AS cnt
         FROM vehicles
         WHERE location_id IS NOT NULL
         GROUP BY location_id
       ) vc ON vc.location_id = dl.id
       WHERE dl.id = $1 AND dl.dealer_id = $2 AND dl.is_active = true`,
      [locationId, dealerId],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error("[locations] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch location" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* PUT /api/admin/locations/[locationId] — Update location                    */
/* -------------------------------------------------------------------------- */

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ locationId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = getDealerId(authResult);
  const { locationId } = await params;

  if (!locationId) {
    return NextResponse.json({ error: "Location ID is required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateLocationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const data = parsed.data;

  if (!process.env.DATABASE_URL) {
    try {
      trackSystem("system.vehicle_updated", dealerId, {
        action: "location_updated",
        location_id: locationId,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json({
      id: locationId,
      dealer_id: dealerId,
      ...data,
      is_active: true,
      updated_at: new Date().toISOString(),
    });
  }

  try {
    const { query } = await import("@/lib/db");

    // Verify the location belongs to this dealer
    const existing = await query(
      `SELECT id, is_primary FROM dealer_locations WHERE id = $1 AND dealer_id = $2 AND is_active = true`,
      [locationId, dealerId],
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    // If setting as primary, unset any existing primary
    if (data.is_primary) {
      await query(
        `UPDATE dealer_locations SET is_primary = false, updated_at = NOW()
         WHERE dealer_id = $1 AND is_primary = true AND id != $2`,
        [dealerId, locationId],
      );
    }

    // Build dynamic SET clause from provided fields
    const setClauses: string[] = ["updated_at = NOW()"];
    const values: unknown[] = [];
    let paramIdx = 1;

    const fieldMap: Record<string, string> = {
      name: "name",
      address_street: "address_street",
      address_city: "address_city",
      address_state: "address_state",
      address_zip: "address_zip",
      phone: "phone",
      email: "email",
      is_primary: "is_primary",
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        setClauses.push(`${column} = $${paramIdx}`);
        values.push(data[key as keyof typeof data]);
        paramIdx++;
      }
    }

    values.push(locationId, dealerId);

    const result = await query(
      `UPDATE dealer_locations
       SET ${setClauses.join(", ")}
       WHERE id = $${paramIdx} AND dealer_id = $${paramIdx + 1} AND is_active = true
       RETURNING *`,
      values,
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    try {
      trackSystem("system.vehicle_updated", dealerId, {
        action: "location_updated",
        location_id: locationId,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error("[locations] PUT error:", err);
    return NextResponse.json({ error: "Failed to update location" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* DELETE /api/admin/locations/[locationId] — Soft-delete, reassign vehicles  */
/* -------------------------------------------------------------------------- */

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ locationId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = getDealerId(authResult);
  const { locationId } = await params;

  if (!locationId) {
    return NextResponse.json({ error: "Location ID is required" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    try {
      trackSystem("system.vehicle_updated", dealerId, {
        action: "location_deleted",
        location_id: locationId,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json({ success: true, id: locationId, vehicles_reassigned: 0 });
  }

  try {
    const { query } = await import("@/lib/db");

    // Verify the location exists and belongs to this dealer
    const existing = await query(
      `SELECT id, is_primary FROM dealer_locations WHERE id = $1 AND dealer_id = $2 AND is_active = true`,
      [locationId, dealerId],
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Location not found" }, { status: 404 });
    }

    // Cannot delete the primary location if other locations exist
    const location = existing.rows[0] as { id: string; is_primary: boolean };
    if (location.is_primary) {
      const otherCount = await query(
        `SELECT COUNT(*)::int AS cnt FROM dealer_locations
         WHERE dealer_id = $1 AND is_active = true AND id != $2`,
        [dealerId, locationId],
      );
      if ((otherCount.rows[0]?.cnt ?? 0) > 0) {
        return NextResponse.json(
          { error: "Cannot delete primary location while other locations exist. Set another location as primary first." },
          { status: 409 },
        );
      }
    }

    // Find the primary location to reassign vehicles
    const primary = await query(
      `SELECT id FROM dealer_locations
       WHERE dealer_id = $1 AND is_primary = true AND is_active = true AND id != $2
       LIMIT 1`,
      [dealerId, locationId],
    );
    const primaryId = primary.rows[0]?.id ?? null;

    // Reassign vehicles from this location to the primary
    const reassigned = await query(
      `UPDATE vehicles SET location_id = $1 WHERE location_id = $2 AND dealer_id = $3`,
      [primaryId, locationId, dealerId],
    );

    // Soft-delete the location
    await query(
      `UPDATE dealer_locations SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [locationId],
    );

    try {
      trackSystem("system.vehicle_updated", dealerId, {
        action: "location_deleted",
        location_id: locationId,
        vehicles_reassigned: reassigned.rowCount ?? 0,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json({
      success: true,
      id: locationId,
      vehicles_reassigned: reassigned.rowCount ?? 0,
      reassigned_to: primaryId,
    });
  } catch (err) {
    console.error("[locations] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete location" }, { status: 500 });
  }
}
