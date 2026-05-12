/**
 * GET /api/admin/vehicles/[id]/recalls
 *
 * Returns the open NHTSA recalls + applicable manufacturer TSBs for a
 * specific vehicle. `[id]` may be the vehicle UUID OR the VIN — both are
 * accepted because the service write-up screen and the inventory page key
 * on different identifiers historically.
 *
 * Fires `service.recall_flagged` and `service.tsb_flagged` analytics events
 * fire-and-forget for every flagged item so the learning loop can score
 * "writers who ignore flagged recalls" vs. "writers who act on them."
 *
 * Auth: requireAuth(). Tenant: dealer_id from session.
 *
 * Errors:
 *   200 — vehicle resolved, report attached
 *   401 — no session
 *   404 — vehicle not found (or wrong dealer — info-disclosure-safe collapse)
 *   500 — unexpected failure
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { buildVehicleRecallReport, loadVehicle } from "@/lib/recalls";
import { trackService } from "@/lib/analytics-hooks";

interface RouteContext {
  params: Promise<{ vin: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      vehicle_id: null,
      recalls: [],
      tsbs: [],
      shadow_mode: true,
    });
  }

  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { vin } = await context.params;
  if (!vin || typeof vin !== "string") {
    return NextResponse.json({ error: "Vehicle vin is required" }, { status: 400 });
  }

  const dealerId = authResult.user.dealer_id;

  try {
    const vehicle = await loadVehicle(dealerId, vin);
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const report = await buildVehicleRecallReport(dealerId, vehicle);

    // Fire analytics fire-and-forget — never block the response.
    try {
      for (const r of report.open_recalls) {
        if (r.status === "open") {
          trackService("service.recall_flagged", dealerId, {
            vehicle_id: vehicle.id,
            recall_id: r.id,
            nhtsa_campaign_id: r.nhtsa_campaign_id,
            severity: r.severity,
          });
        }
      }
      for (const t of report.tsbs) {
        trackService("service.tsb_flagged", dealerId, {
          vehicle_id: vehicle.id,
          tsb_id: t.id,
          manufacturer: t.manufacturer,
          bulletin_id: t.bulletin_id,
        });
      }
    } catch {
      /* analytics must never throw */
    }

    return NextResponse.json(report);
  } catch (err) {
    console.error("[GET /api/admin/vehicles/[id]/recalls] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
