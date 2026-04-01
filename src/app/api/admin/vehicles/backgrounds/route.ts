/**
 * GET  /api/admin/vehicles/backgrounds — List available background presets
 * POST /api/admin/vehicles/backgrounds — Apply a background preset to a vehicle
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";
import {
  getAvailableBackgrounds,
  getPresetById,
  generateBackgroundCSS,
  trackBackgroundPerformance,
} from "@/lib/background-generator";

/* -------------------------------------------------------------------------- */
/* In-memory applied-backgrounds store (Postgres in production)               */
/* -------------------------------------------------------------------------- */

const appliedBackgrounds = new Map<
  string,
  { preset: string; css: string; applied_at: string }
>();

/** Exported for test access */
export function getAppliedBackgrounds() {
  return appliedBackgrounds;
}

/* -------------------------------------------------------------------------- */
/* GET                                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const presets = getAvailableBackgrounds();
  return NextResponse.json({ presets, count: presets.length });
}

/* -------------------------------------------------------------------------- */
/* POST                                                                       */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: { vin?: string; preset?: string; dealer_colors?: { primary: string; secondary: string }; vehicle_color?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { vin, preset, dealer_colors, vehicle_color } = body;

  if (!vin || typeof vin !== "string") {
    return NextResponse.json({ error: "vin is required (string)" }, { status: 400 });
  }
  if (!preset || typeof preset !== "string") {
    return NextResponse.json({ error: "preset is required (string)" }, { status: 400 });
  }

  const presetDef = getPresetById(preset);
  if (!presetDef) {
    return NextResponse.json(
      { error: `Unknown preset: ${preset}. Use GET to list available presets.` },
      { status: 400 },
    );
  }

  const css = generateBackgroundCSS(preset, vehicle_color, dealer_colors);

  appliedBackgrounds.set(vin, {
    preset,
    css,
    applied_at: new Date().toISOString(),
  });

  trackSystem("system.vehicle_updated", vin, {
    action: "background.applied",
    preset,
    module: "backgrounds",
  });

  return NextResponse.json({
    vin,
    preset,
    preset_name: presetDef.name,
    css,
    applied_at: appliedBackgrounds.get(vin)!.applied_at,
  });
}
