import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { trackVehiclePipeline } from "@/lib/analytics-hooks";
import {
  acquireVehicle,
  updateMilestone,
  getVehiclePipeline,
  alertSlowMovers,
  type DeliveryStage,
} from "@/lib/vehicle-delivery-tracker";

/* -------------------------------------------------------------------------- */
/* Demo data                                                                   */
/* -------------------------------------------------------------------------- */

const DEMO_PIPELINE = {
  dealerId: "demo",
  stages: {
    acquired: [
      { vin: "1HGCV1F34LA000010", dealerId: "demo", currentStage: "acquired", milestones: [{ stage: "acquired", timestamp: "2026-04-01T10:00:00Z" }], acquiredAt: "2026-04-01T10:00:00Z", lastUpdated: "2026-04-01T10:00:00Z", vehicleInfo: { year: 2025, make: "Honda", model: "Accord", stockNumber: "A1001" } },
    ],
    in_transit: [
      { vin: "5TFDY5F10LX000020", dealerId: "demo", currentStage: "in_transit", milestones: [{ stage: "acquired", timestamp: "2026-03-28T10:00:00Z" }, { stage: "in_transit", timestamp: "2026-03-29T10:00:00Z" }], acquiredAt: "2026-03-28T10:00:00Z", lastUpdated: "2026-03-29T10:00:00Z", vehicleInfo: { year: 2026, make: "Toyota", model: "Tundra", stockNumber: "T2002" } },
    ],
    arrived: [],
    inspection: [
      { vin: "WBAJA5C50KB000030", dealerId: "demo", currentStage: "inspection", milestones: [{ stage: "acquired", timestamp: "2026-03-25T10:00:00Z" }, { stage: "arrived", timestamp: "2026-03-27T10:00:00Z" }, { stage: "inspection", timestamp: "2026-03-28T10:00:00Z" }], acquiredAt: "2026-03-25T10:00:00Z", lastUpdated: "2026-03-28T10:00:00Z", vehicleInfo: { year: 2025, make: "BMW", model: "530i", stockNumber: "B3003" } },
    ],
    reconditioning: [],
    photos: [
      { vin: "1G1YY22G965000040", dealerId: "demo", currentStage: "photos", milestones: [{ stage: "acquired", timestamp: "2026-03-20T10:00:00Z" }, { stage: "photos", timestamp: "2026-03-26T10:00:00Z" }], acquiredAt: "2026-03-20T10:00:00Z", lastUpdated: "2026-03-26T10:00:00Z", vehicleInfo: { year: 2025, make: "Chevrolet", model: "Corvette", stockNumber: "C4004" } },
    ],
    listed: [
      { vin: "5YJ3E1EA1NF000050", dealerId: "demo", currentStage: "listed", milestones: [{ stage: "acquired", timestamp: "2026-03-15T10:00:00Z" }, { stage: "listed", timestamp: "2026-03-22T10:00:00Z" }], acquiredAt: "2026-03-15T10:00:00Z", lastUpdated: "2026-03-22T10:00:00Z", vehicleInfo: { year: 2026, make: "Tesla", model: "Model 3", stockNumber: "T5005" } },
    ],
    sold: [],
    delivered: [],
  },
  totalVehicles: 5,
  averageTimeToList: 7,
  averageTimeToDeliver: 0,
};

/* -------------------------------------------------------------------------- */
/* GET /api/admin/vehicle-pipeline                                             */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      pipeline: DEMO_PIPELINE,
      slowMovers: [
        { vin: "1G1YY22G965000040", currentStage: "photos", daysInStage: 8, thresholdDays: 7, vehicleInfo: { year: 2025, make: "Chevrolet", model: "Corvette", stockNumber: "C4004" } },
      ],
    });
  }

  try {
    const pipeline = getVehiclePipeline(dealerId);
    const slowMovers = alertSlowMovers(dealerId, 7);

    if (slowMovers.length > 0) {
      trackVehiclePipeline("vehicle_pipeline.slow_mover_detected", dealerId, {
        count: slowMovers.length,
      });
    }

    return NextResponse.json({ pipeline, slowMovers });
  } catch (err) {
    console.error("[vehicle-pipeline] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load vehicle pipeline" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/vehicle-pipeline                                            */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;

  let body: {
    action: "acquire" | "update_milestone";
    vin?: string;
    milestone?: DeliveryStage;
    vehicleInfo?: { year: number; make: string; model: string; stockNumber?: string };
    notes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.action === "acquire") {
      if (!body.vin) {
        return NextResponse.json({ error: "vin is required" }, { status: 400 });
      }
      const vehicle = acquireVehicle(body.vin, dealerId, body.vehicleInfo);
      trackVehiclePipeline("vehicle_pipeline.milestone_updated", dealerId, {
        vin: body.vin,
        milestone: "acquired",
      });
      return NextResponse.json({ vehicle });
    }

    if (body.action === "update_milestone") {
      if (!body.vin || !body.milestone) {
        return NextResponse.json(
          { error: "vin and milestone are required" },
          { status: 400 },
        );
      }
      const vehicle = updateMilestone(body.vin, body.milestone, undefined, body.notes);
      if (!vehicle) {
        return NextResponse.json(
          { error: "Vehicle not found or invalid milestone progression" },
          { status: 404 },
        );
      }
      trackVehiclePipeline("vehicle_pipeline.milestone_updated", dealerId, {
        vin: body.vin,
        milestone: body.milestone,
      });
      return NextResponse.json({ vehicle });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[vehicle-pipeline] POST error:", err);
    return NextResponse.json(
      { error: "Failed to process vehicle pipeline action" },
      { status: 500 },
    );
  }
}
