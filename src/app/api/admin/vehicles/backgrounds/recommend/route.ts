/**
 * GET  /api/admin/vehicles/backgrounds/recommend?vin=xxx — Recommend background for one vehicle
 * POST /api/admin/vehicles/backgrounds/recommend       — Batch recommendations for multiple VINs
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";
import {
  getRecommendedBackground,
  getBatchBackgroundPlan,
} from "@/lib/background-generator";
import { getVehicleByVin } from "@/lib/data";

/* -------------------------------------------------------------------------- */
/* GET — single vehicle recommendation                                        */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const vin = request.nextUrl.searchParams.get("vin");
  if (!vin) {
    return NextResponse.json({ error: "vin query parameter is required" }, { status: 400 });
  }

  // Try to look up vehicle data for richer recommendation
  let vehicleAttrs: {
    color?: string;
    body_type?: string;
    price?: number;
    condition?: string;
    make?: string;
  } = {};

  try {
    const { data: vehicle } = await getVehicleByVin(vin);
    if (vehicle) {
      vehicleAttrs = {
        color: vehicle.exteriorColor,
        body_type: ((vehicle as unknown as Record<string, string>).bodyStyle) ?? "",
        price: vehicle.price,
        condition: vehicle.condition,
        make: vehicle.make,
      };
    }
  } catch {
    // Vehicle lookup failed — still return a default recommendation
  }

  const rec = getRecommendedBackground(vehicleAttrs);

  trackSystem("system.vehicle_updated", vin, {
    action: "background.auto_recommended",
    preset: rec.preset,
    module: "backgrounds",
  });

  return NextResponse.json({ vin, ...rec });
}

/* -------------------------------------------------------------------------- */
/* POST — batch recommendations                                               */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: { vins?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { vins } = body;
  if (!Array.isArray(vins) || vins.length === 0) {
    return NextResponse.json(
      { error: "vins must be a non-empty array of VIN strings" },
      { status: 400 },
    );
  }

  if (vins.length > 200) {
    return NextResponse.json(
      { error: "Maximum 200 VINs per batch request" },
      { status: 400 },
    );
  }

  // Look up each vehicle for richer recommendations
  const vehicles = await Promise.all(
    vins.map(async (vin) => {
      try {
        const { data: vehicle } = await getVehicleByVin(vin);
        if (vehicle) {
          return {
            vin,
            color: vehicle.exteriorColor,
            body_type: ((vehicle as unknown as Record<string, string>).bodyStyle) ?? "",
            price: vehicle.price,
            condition: vehicle.condition,
            make: vehicle.make,
          };
        }
      } catch {
        // Fall through to default
      }
      return { vin };
    }),
  );

  const plan = getBatchBackgroundPlan(vehicles);

  trackSystem("system.vehicle_updated", "batch", {
    action: "background.batch_recommended",
    count: plan.length,
    module: "backgrounds",
  });

  return NextResponse.json({ recommendations: plan, count: plan.length });
}
