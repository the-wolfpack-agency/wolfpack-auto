/**
 * GET  /api/admin/vehicles/backgrounds — List all backgrounds (presets + custom)
 * POST /api/admin/vehicles/backgrounds — Apply a background to a vehicle
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackBackground } from "@/lib/analytics-hooks";
import {
  getAvailableBackgrounds,
  getPresetById,
  generateBackgroundCSS,
  isValidPresetId,
  type CustomBackground,
} from "@/lib/background-generator";

/* -------------------------------------------------------------------------- */
/* GET — list presets + custom backgrounds                                     */
/* -------------------------------------------------------------------------- */

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id;
  const presets = getAvailableBackgrounds();

  // Load system backgrounds (available to all dealers) + dealer custom backgrounds
  let systemBackgrounds: CustomBackground[] = [];
  let customBackgrounds: CustomBackground[] = [];

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      // System backgrounds (is_system=true, shared across all dealers)
      const { rows: sysRows } = await query(
        `SELECT id, dealer_id, name, description, category, tags,
                original_url, optimized_url, thumbnail_url,
                width, height, file_size, position, fit, overlay_opacity,
                is_active, is_system, sort_order,
                times_applied, engagement_score, created_at
         FROM custom_backgrounds
         WHERE is_system = true AND is_active = true
         ORDER BY sort_order ASC`,
        [],
      );
      systemBackgrounds = sysRows as CustomBackground[];

      // Dealer's own custom backgrounds
      const { rows: customRows } = await query(
        `SELECT id, dealer_id, name, description, category, tags,
                original_url, optimized_url, thumbnail_url,
                width, height, file_size, position, fit, overlay_opacity,
                is_active, is_system, sort_order,
                times_applied, engagement_score, created_at
         FROM custom_backgrounds
         WHERE dealer_id = $1 AND is_system = false AND is_active = true
         ORDER BY sort_order ASC, created_at DESC`,
        [dealerId],
      );
      customBackgrounds = customRows as CustomBackground[];
    } catch (err) {
      console.error("[api/backgrounds] Failed to load backgrounds:", err);
    }
  }

  // Also provide system background metadata from code (fallback when DB empty)
  let systemMeta: { id: string; name: string; description: string; category: string; tags: string[] }[] = [];
  if (systemBackgrounds.length === 0) {
    const { getSystemBackgroundMeta } = await import("@/lib/system-backgrounds");
    systemMeta = getSystemBackgroundMeta();
  }

  return NextResponse.json({
    presets,
    system: systemBackgrounds,
    system_meta: systemMeta,
    custom: customBackgrounds,
    preset_count: presets.length,
    system_count: systemBackgrounds.length || systemMeta.length,
    custom_count: customBackgrounds.length,
    total_count: presets.length + (systemBackgrounds.length || systemMeta.length) + customBackgrounds.length,
  });
}

/* -------------------------------------------------------------------------- */
/* POST — apply a background (preset or custom) to a vehicle                   */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id;

  let body: {
    vin?: string;
    vehicle_id?: string;
    background_type?: string;
    preset_id?: string;
    custom_bg_id?: string;
    dealer_colors?: { primary: string; secondary: string };
    vehicle_color?: string;
    method?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { vin, vehicle_id, background_type = "preset", preset_id, custom_bg_id, dealer_colors, vehicle_color, method = "manual" } = body;

  if (!vin || typeof vin !== "string") {
    return NextResponse.json({ error: "vin is required (string)" }, { status: 400 });
  }

  // Validate based on type
  let css: string | null = null;
  let presetName: string | null = null;

  if (background_type === "preset") {
    if (!preset_id || !isValidPresetId(preset_id)) {
      return NextResponse.json(
        { error: `Invalid preset_id. Use GET to list available presets.` },
        { status: 400 },
      );
    }
    const presetDef = getPresetById(preset_id)!;
    css = generateBackgroundCSS(preset_id, vehicle_color, dealer_colors);
    presetName = presetDef.name;
  } else if (background_type === "custom") {
    if (!custom_bg_id) {
      return NextResponse.json(
        { error: "custom_bg_id is required when background_type is 'custom'" },
        { status: 400 },
      );
    }
  } else if (background_type !== "composite") {
    return NextResponse.json(
      { error: "background_type must be 'preset', 'custom', or 'composite'" },
      { status: 400 },
    );
  }

  // Persist assignment to DB
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      // Deactivate any existing assignment for this vehicle
      if (vehicle_id) {
        await query(
          `UPDATE vehicle_background_assignments SET is_active = false, updated_at = now()
           WHERE dealer_id = $1 AND vehicle_id = $2::uuid AND is_active = true`,
          [dealerId, vehicle_id],
        );
      }

      // Create new assignment
      await query(
        `INSERT INTO vehicle_background_assignments
           (dealer_id, vehicle_id, vin, background_type, preset_id, custom_bg_id, css_override, applied_method)
         VALUES ($1, $2::uuid, $3, $4, $5, $6::uuid, $7, $8)`,
        [
          dealerId,
          vehicle_id ?? null,
          vin,
          background_type,
          preset_id ?? null,
          custom_bg_id ?? null,
          css,
          method,
        ],
      );

      // Increment times_applied on custom background
      if (background_type === "custom" && custom_bg_id) {
        await query(
          `UPDATE custom_backgrounds SET times_applied = times_applied + 1, updated_at = now()
           WHERE id = $1::uuid AND dealer_id = $2`,
          [custom_bg_id, dealerId],
        );
      }
    } catch (err) {
      console.error("[api/backgrounds] DB error applying background:", err);
    }
  }

  trackBackground("background.applied", dealerId, {
    vin,
    background_type,
    preset_id: preset_id ?? "",
    custom_bg_id: custom_bg_id ?? "",
    method,
  });

  return NextResponse.json({
    vin,
    background_type,
    preset_id: preset_id ?? null,
    preset_name: presetName,
    custom_bg_id: custom_bg_id ?? null,
    css,
    applied_method: method,
    applied_at: new Date().toISOString(),
  });
}
