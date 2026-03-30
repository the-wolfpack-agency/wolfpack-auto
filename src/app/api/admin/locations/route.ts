import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackSystem } from "@/lib/analytics-hooks";
import crypto from "node:crypto";

/* -------------------------------------------------------------------------- */
/* Zod schemas                                                                */
/* -------------------------------------------------------------------------- */

const createLocationSchema = z.object({
  name: z.string().min(1, "Location name is required").max(200),
  address_street: z.string().max(500).default(""),
  address_city: z.string().max(100).default(""),
  address_state: z.string().max(50).default(""),
  address_zip: z.string().max(20).default(""),
  phone: z.string().max(30).default(""),
  email: z.string().email("Invalid email").or(z.literal("")).default(""),
  is_primary: z.boolean().default(false),
});

/* -------------------------------------------------------------------------- */
/* Mock data for shadow mode                                                  */
/* -------------------------------------------------------------------------- */

const MOCK_LOCATIONS = [
  {
    id: "loc_main_001",
    dealer_id: "demo-dealer",
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
    created_at: "2026-03-25T00:00:00Z",
  },
  {
    id: "loc_service_002",
    dealer_id: "demo-dealer",
    name: "Service Center",
    address_street: "200 Service Rd",
    address_city: "Raleigh",
    address_state: "NC",
    address_zip: "27602",
    phone: "(919) 555-0200",
    email: "service@wolfpackmotors.com",
    is_primary: false,
    is_active: true,
    vehicle_count: 12,
    created_at: "2026-03-26T00:00:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/locations — List all locations for dealer                    */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = getDealerId(authResult);

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ locations: MOCK_LOCATIONS });
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
       WHERE dl.dealer_id = $1 AND dl.is_active = true
       ORDER BY dl.is_primary DESC, dl.name`,
      [dealerId],
    );
    return NextResponse.json({ locations: result.rows });
  } catch (err) {
    console.error("[locations] DB error:", err);
    return NextResponse.json({ locations: MOCK_LOCATIONS });
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/locations — Add a new location                             */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = getDealerId(authResult);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createLocationSchema.safeParse(body);
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
  const locationId = `loc_${crypto.randomUUID().slice(0, 8)}_${Date.now().toString(36)}`;

  if (!process.env.DATABASE_URL) {
    try {
      trackSystem("system.vehicle_updated", dealerId, {
        action: "location_created",
        location_id: locationId,
        location_name: data.name,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json(
      {
        id: locationId,
        dealer_id: dealerId,
        ...data,
        is_active: true,
        vehicle_count: 0,
        created_at: new Date().toISOString(),
      },
      { status: 201 },
    );
  }

  try {
    const { query } = await import("@/lib/db");

    // If this is the first location, make it primary regardless
    const existing = await query(
      `SELECT COUNT(*)::int AS cnt FROM dealer_locations WHERE dealer_id = $1 AND is_active = true`,
      [dealerId],
    );
    const isFirst = (existing.rows[0]?.cnt ?? 0) === 0;
    const isPrimary = isFirst || data.is_primary;

    // If setting as primary, unset any existing primary
    if (isPrimary) {
      await query(
        `UPDATE dealer_locations SET is_primary = false, updated_at = NOW()
         WHERE dealer_id = $1 AND is_primary = true`,
        [dealerId],
      );
    }

    await query(
      `INSERT INTO dealer_locations (
        id, dealer_id, name,
        address_street, address_city, address_state, address_zip,
        phone, email, is_primary, is_active,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7,
        $8, $9, $10, true,
        NOW(), NOW()
      )`,
      [
        locationId,
        dealerId,
        data.name,
        data.address_street,
        data.address_city,
        data.address_state,
        data.address_zip,
        data.phone,
        data.email,
        isPrimary,
      ],
    );

    try {
      trackSystem("system.vehicle_updated", dealerId, {
        action: "location_created",
        location_id: locationId,
        location_name: data.name,
        is_primary: isPrimary,
      });
    } catch { /* analytics never blocks */ }

    return NextResponse.json(
      {
        id: locationId,
        dealer_id: dealerId,
        name: data.name,
        address_street: data.address_street,
        address_city: data.address_city,
        address_state: data.address_state,
        address_zip: data.address_zip,
        phone: data.phone,
        email: data.email,
        is_primary: isPrimary,
        is_active: true,
        vehicle_count: 0,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[locations] Create error:", err);
    return NextResponse.json(
      { error: "Failed to create location" },
      { status: 500 },
    );
  }
}
