/**
 * POST /api/admin/vehicles/backgrounds/batch — Batch apply backgrounds to inventory
 *
 * Modes:
 *   1. auto_recommend: Let the system pick the best preset for each vehicle
 *   2. apply_preset: Apply a single preset to all selected vehicles
 *   3. apply_custom: Apply a custom background to all selected vehicles
 *
 * Accepts JSON body:
 *   mode: "auto_recommend" | "apply_preset" | "apply_custom"
 *   vins: string[] (max 200)
 *   preset_id: preset ID (required for apply_preset)
 *   custom_bg_id: custom background UUID (required for apply_custom)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackBackground } from "@/lib/analytics-hooks";
import {
  getBatchBackgroundPlan,
  isValidPresetId,
  generateBackgroundCSS,
  type VehicleForBackground,
} from "@/lib/background-generator";

type BatchMode = "auto_recommend" | "apply_preset" | "apply_custom";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id;

  let body: {
    mode?: BatchMode;
    vins?: string[];
    preset_id?: string;
    custom_bg_id?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { mode = "auto_recommend", vins, preset_id, custom_bg_id } = body;

  if (!Array.isArray(vins) || vins.length === 0) {
    return NextResponse.json({ error: "vins must be a non-empty array" }, { status: 400 });
  }
  if (vins.length > 200) {
    return NextResponse.json({ error: "Maximum 200 vehicles per batch" }, { status: 400 });
  }

  // Validate mode-specific params
  if (mode === "apply_preset") {
    if (!preset_id || !isValidPresetId(preset_id)) {
      return NextResponse.json({ error: "Valid preset_id is required for apply_preset mode" }, { status: 400 });
    }
  }
  if (mode === "apply_custom") {
    if (!custom_bg_id) {
      return NextResponse.json({ error: "custom_bg_id is required for apply_custom mode" }, { status: 400 });
    }
  }

  const results: {
    vin: string;
    background_type: string;
    preset_id: string | null;
    custom_bg_id: string | null;
    reason: string | null;
    confidence: number | null;
  }[] = [];

  if (mode === "auto_recommend") {
    // Look up vehicle data for richer recommendations
    let vehicles: VehicleForBackground[] = vins.map((vin) => ({ vin }));

    if (process.env.DATABASE_URL) {
      try {
        const { query } = await import("@/lib/db");
        const { rows } = await query(
          `SELECT vin, exterior_color AS color, body_style AS body_type,
                  price, condition, make
           FROM vehicles
           WHERE dealer_id = $1 AND vin = ANY($2)`,
          [dealerId, vins],
        );
        const vehicleMap = new Map(rows.map((r: Record<string, unknown>) => [r.vin as string, r]));
        vehicles = vins.map((vin) => {
          const v = vehicleMap.get(vin);
          if (v) {
            return {
              vin,
              color: v.color as string | undefined,
              body_type: v.body_type as string | undefined,
              price: v.price as number | undefined,
              condition: v.condition as string | undefined,
              make: v.make as string | undefined,
            };
          }
          return { vin };
        });
      } catch (err) {
        console.error("[api/batch] Failed to look up vehicles:", err);
      }
    }

    const plan = getBatchBackgroundPlan(vehicles);
    for (const item of plan) {
      results.push({
        vin: item.vin,
        background_type: "preset",
        preset_id: item.recommended_preset,
        custom_bg_id: null,
        reason: item.reason,
        confidence: item.confidence,
      });
    }
  } else if (mode === "apply_preset") {
    for (const vin of vins) {
      results.push({
        vin,
        background_type: "preset",
        preset_id: preset_id!,
        custom_bg_id: null,
        reason: null,
        confidence: null,
      });
    }
  } else if (mode === "apply_custom") {
    for (const vin of vins) {
      results.push({
        vin,
        background_type: "custom",
        preset_id: null,
        custom_bg_id: custom_bg_id!,
        reason: null,
        confidence: null,
      });
    }
  }

  // Persist all assignments to DB
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      for (const r of results) {
        // Look up vehicle_id
        const { rows: vehicleRows } = await query(
          `SELECT id FROM vehicles WHERE dealer_id = $1 AND vin = $2 LIMIT 1`,
          [dealerId, r.vin],
        );
        const vehicleId = vehicleRows[0]?.id;

        if (vehicleId) {
          // Deactivate existing
          await query(
            `UPDATE vehicle_background_assignments SET is_active = false
             WHERE dealer_id = $1 AND vehicle_id = $2::uuid AND is_active = true`,
            [dealerId, vehicleId],
          );

          // Create new
          const css = r.preset_id ? generateBackgroundCSS(r.preset_id) : null;
          await query(
            `INSERT INTO vehicle_background_assignments
               (dealer_id, vehicle_id, vin, background_type, preset_id, custom_bg_id, css_override, applied_method)
             VALUES ($1, $2::uuid, $3, $4, $5, $6::uuid, $7, 'batch')`,
            [dealerId, vehicleId, r.vin, r.background_type, r.preset_id, r.custom_bg_id, css],
          );
        }
      }
    } catch (err) {
      console.error("[api/batch] DB error persisting batch:", err);
    }
  }

  trackBackground("background.batch_applied", dealerId, {
    mode,
    count: results.length,
    preset_id: preset_id ?? "",
    custom_bg_id: custom_bg_id ?? "",
  });

  return NextResponse.json({
    mode,
    applied: results,
    count: results.length,
  });
}
