import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { DEMO_HOUSEHOLDS } from "@/lib/household";

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/households                                                  */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);
  const { searchParams } = new URL(request.url);
  const householdId = searchParams.get("householdId");

  // Shadow mode — return demo data
  if (!process.env.DATABASE_URL) {
    if (householdId) {
      const household = DEMO_HOUSEHOLDS.find((h) => h.id === householdId);
      if (!household) {
        return NextResponse.json({ error: "Household not found" }, { status: 404 });
      }
      return NextResponse.json({ household });
    }

    return NextResponse.json({
      households: DEMO_HOUSEHOLDS.map((h) => ({
        id: h.id,
        familyName: h.familyName,
        memberCount: h.members.length,
        vehicleCount: h.vehicles.length,
        lifetimeValue: h.lifetimeValue.totalRevenue,
        opportunityCount: h.opportunities.length,
      })),
      stats: {
        totalHouseholds: DEMO_HOUSEHOLDS.length,
        avgLifetimeValue: Math.round(
          DEMO_HOUSEHOLDS.reduce((s, h) => s + h.lifetimeValue.totalRevenue, 0) /
            DEMO_HOUSEHOLDS.length,
        ),
        avgVehiclesPerHousehold:
          Math.round(
            (DEMO_HOUSEHOLDS.reduce((s, h) => s + h.vehicles.length, 0) /
              DEMO_HOUSEHOLDS.length) *
              10,
          ) / 10,
        totalOpportunities: DEMO_HOUSEHOLDS.reduce(
          (s, h) => s + h.opportunities.length,
          0,
        ),
      },
    });
  }

  // Production — query from DB
  const { query } = await import("@/lib/db");

  if (householdId) {
    const result = await query(
      `SELECT * FROM households WHERE id = $1 AND dealer_id = $2`,
      [householdId, dealerId],
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Household not found" }, { status: 404 });
    }
    return NextResponse.json({ household: result.rows[0] });
  }

  const result = await query(
    `SELECT h.id, h.family_name AS "familyName",
            COUNT(DISTINCT hm.customer_id) AS "memberCount",
            COUNT(DISTINCT hv.vehicle_id) AS "vehicleCount",
            COALESCE(SUM(hv.purchase_price), 0) AS "lifetimeValue"
     FROM households h
     LEFT JOIN household_members hm ON h.id = hm.household_id
     LEFT JOIN household_vehicles hv ON h.id = hv.household_id
     WHERE h.dealer_id = $1
     GROUP BY h.id, h.family_name
     ORDER BY "lifetimeValue" DESC`,
    [dealerId],
  );

  return NextResponse.json({ households: result.rows });
}

/* -------------------------------------------------------------------------- */
/*  POST /api/admin/households — detect & create households                    */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);

  // Shadow mode — return simulated detection results
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      detected: DEMO_HOUSEHOLDS.length,
      created: 0,
      message: "Household detection complete. 3 households already exist in demo mode.",
      households: DEMO_HOUSEHOLDS.map((h) => ({
        id: h.id,
        familyName: h.familyName,
        memberCount: h.members.length,
      })),
    });
  }

  // Production — run detection algorithm
  const { query } = await import("@/lib/db");
  const body = await request.json().catch(() => ({}));
  const _strategy = (body as Record<string, string>).strategy ?? "auto";

  // Fetch all customers for this dealer
  const customers = await query(
    `SELECT id, first_name AS "firstName", last_name AS "lastName",
            email, phone, address, zip
     FROM customers
     WHERE dealer_id = $1
       AND id NOT IN (SELECT customer_id FROM household_members)`,
    [dealerId],
  );

  // For now, return the count — actual matching uses detectHouseholdMatches
  return NextResponse.json({
    detected: 0,
    created: 0,
    candidateCount: customers.rows.length,
    message: `Found ${customers.rows.length} unlinked customers. Run matching to group them.`,
  });
}
