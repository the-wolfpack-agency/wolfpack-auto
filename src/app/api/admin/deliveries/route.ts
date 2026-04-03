import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/deliveries — Delivery list                                  */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ deliveries: [], slots: [], summary: { total: 0, pending: 0, in_transit: 0, delivered: 0 } });
  }
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  const { getDeliveryHistory, getAvailableSlots } = await import(
    "@/lib/delivery-scheduling"
  );

  try {
    if (date) {
      const slots = await getAvailableSlots(dealerId, date);
      return NextResponse.json({ slots });
    }

    const deliveries = await getDeliveryHistory(dealerId);
    return NextResponse.json({ deliveries });
  } catch (err) {
    // Table may not exist yet — return empty data gracefully
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ deliveries: [], slots: [], summary: { total: 0, pending: 0, in_transit: 0, delivered: 0 } });
    }
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/*  POST /api/admin/deliveries — Schedule a delivery                           */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);
  const body = await request.json();

  const { vehicleVin, customerId, customerName, customerPhone, deliveryAddress, slotId, distanceMiles, vehiclePrice, notes } = body;

  if (!vehicleVin || !customerId || !customerName || !deliveryAddress || !slotId) {
    return NextResponse.json(
      { error: "Missing required fields: vehicleVin, customerId, customerName, deliveryAddress, slotId" },
      { status: 400 },
    );
  }

  const { scheduleDelivery } = await import("@/lib/delivery-scheduling");

  const delivery = await scheduleDelivery(
    dealerId,
    { vehicleVin, customerId, customerName, customerPhone: customerPhone ?? "", deliveryAddress, slotId, notes },
    distanceMiles ?? 10,
    vehiclePrice ?? 0,
  );

  return NextResponse.json({ delivery }, { status: 201 });
}
