import { NextRequest, NextResponse } from "next/server";

/* -------------------------------------------------------------------------- */
/*  GET /api/service/delivery?id=... — Public delivery status check            */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const deliveryId = searchParams.get("id");

  if (!deliveryId) {
    return NextResponse.json(
      { error: "Delivery ID is required (use ?id=del_xxx)" },
      { status: 400 },
    );
  }

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      id: deliveryId,
      status: "in_transit",
      slotDate: new Date().toISOString().split("T")[0],
      slotTime: "13:00-15:00",
      estimatedArrival: new Date(Date.now() + 3600_000).toISOString(),
      lastUpdate: new Date(Date.now() - 1800_000).toISOString(),
    });
  }

  const { query } = await import("@/lib/db");
  const result = await query(
    `SELECT id, status, slot_date AS "slotDate", slot_time AS "slotTime", updated_at AS "lastUpdate"
     FROM deliveries WHERE id = $1`,
    [deliveryId],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}
