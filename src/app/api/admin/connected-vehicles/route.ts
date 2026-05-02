/**
 * GET /api/admin/connected-vehicles — list connected vehicles for the dealer.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackServerEvent } from "@/lib/analytics";
import { listConnectedVehiclesForDealer } from "@/lib/connected-vehicle";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ vehicles: [], mode: "shadow" });
  }

  const dealerId = getDealerId(auth);
  try {
    const vehicles = await listConnectedVehiclesForDealer(dealerId);
    try {
      await trackServerEvent("telemetry.connected_vehicles_listed", {
        dealer_id: dealerId,
        count: vehicles.length,
      });
    } catch {
      /* analytics never blocks */
    }
    return NextResponse.json({ vehicles });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ vehicles: [], mode: "shadow" });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
