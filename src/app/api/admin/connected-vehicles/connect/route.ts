/**
 * POST /api/admin/connected-vehicles/connect
 * Manually associate a VIN + customer + provider device id. Used for both
 * admin override and the test harness — production path is the OEM/aftermarket
 * onboarding flow which lands here too.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackServerEvent } from "@/lib/analytics";
import { connectVehicle, type Provider } from "@/lib/connected-vehicle";

export const runtime = "nodejs";

const Body = z.object({
  vin: z.string().min(11).max(17),
  customer_id: z.string().min(1),
  provider: z.enum(["samsara", "geotab", "oem_native", "aftermarket"]),
  provider_device_id: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const dealerId = getDealerId(auth);

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { id: "shadow-id", mode: "shadow" },
      { status: 201 },
    );
  }

  try {
    const result = await connectVehicle({
      dealer_id: dealerId,
      customer_id: parsed.customer_id,
      vin: parsed.vin,
      provider: parsed.provider as Provider,
      provider_device_id: parsed.provider_device_id,
    });
    try {
      await trackServerEvent("telemetry.vehicle_connected", {
        dealer_id: dealerId,
        provider: parsed.provider,
        vin: parsed.vin,
      });
    } catch {
      /* analytics never blocks */
    }
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json(
        { id: "shadow-id", mode: "shadow" },
        { status: 201 },
      );
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
