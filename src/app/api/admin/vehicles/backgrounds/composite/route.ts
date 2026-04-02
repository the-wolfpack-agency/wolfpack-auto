/**
 * POST /api/admin/vehicles/backgrounds/composite — Generate composite image
 *
 * Full pipeline: fetch cutout + background, composite via Sharp, upload result.
 *
 * Accepts JSON body:
 *   vin: vehicle VIN
 *   vehicle_id: vehicle UUID
 *   cutout_url: URL of transparent vehicle cutout (from remove-bg)
 *   background_type: "preset" | "custom"
 *   preset_id: preset ID (when background_type=preset)
 *   custom_bg_id: custom background UUID (when background_type=custom)
 *   options: { add_shadow, add_reflection, vehicle_scale, vehicle_position, ... }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackBackground } from "@/lib/analytics-hooks";
import { compositeVehicle, generateCompositeThumbnail } from "@/lib/image-compositor";
import {
  generateBackgroundCSS,
  isValidPresetId,
  type CompositeOptions,
} from "@/lib/background-generator";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id;

  let body: {
    vin?: string;
    vehicle_id?: string;
    cutout_url?: string;
    background_type?: string;
    preset_id?: string;
    custom_bg_id?: string;
    dealer_colors?: { primary: string; secondary: string };
    options?: Partial<CompositeOptions>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { vin, vehicle_id, cutout_url, background_type = "preset", preset_id, custom_bg_id, dealer_colors, options } = body;

  if (!vin || typeof vin !== "string") {
    return NextResponse.json({ error: "vin is required" }, { status: 400 });
  }
  if (!cutout_url || typeof cutout_url !== "string") {
    return NextResponse.json({ error: "cutout_url is required" }, { status: 400 });
  }

  trackBackground("background.composite_started", dealerId, {
    vin,
    background_type,
    preset_id: preset_id ?? "",
    custom_bg_id: custom_bg_id ?? "",
  });

  try {
    // Fetch the vehicle cutout
    const cutoutRes = await fetch(cutout_url);
    if (!cutoutRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch cutout from ${cutout_url}: ${cutoutRes.status}` },
        { status: 400 },
      );
    }
    const cutoutBuffer = Buffer.from(await cutoutRes.arrayBuffer());

    // Prepare background
    let backgroundBuffer: Buffer | undefined;
    let backgroundCSS: string | undefined;

    if (background_type === "custom" && custom_bg_id) {
      // Fetch custom background from DB + R2
      if (process.env.DATABASE_URL) {
        const { query } = await import("@/lib/db");
        const { rows } = await query(
          `SELECT original_url, optimized_url FROM custom_backgrounds
           WHERE id = $1::uuid AND dealer_id = $2`,
          [custom_bg_id, dealerId],
        );
        if (rows.length === 0) {
          return NextResponse.json(
            { error: "Custom background not found" },
            { status: 404 },
          );
        }
        const bgUrl = rows[0].optimized_url || rows[0].original_url;
        const bgRes = await fetch(bgUrl);
        if (bgRes.ok) {
          backgroundBuffer = Buffer.from(await bgRes.arrayBuffer());
        }
      }
    } else if (background_type === "preset" && preset_id) {
      if (!isValidPresetId(preset_id)) {
        return NextResponse.json({ error: `Invalid preset: ${preset_id}` }, { status: 400 });
      }
      backgroundCSS = generateBackgroundCSS(preset_id, undefined, dealer_colors);
    } else {
      return NextResponse.json(
        { error: "Either preset_id or custom_bg_id is required" },
        { status: 400 },
      );
    }

    // Run compositing pipeline
    const result = await compositeVehicle({
      cutout_buffer: cutoutBuffer,
      background_buffer: backgroundBuffer,
      background_css: backgroundCSS,
      options,
    });

    // Generate thumbnail
    const thumbnail = await generateCompositeThumbnail(result.buffer);

    // Upload results to R2
    const timestamp = Date.now();
    let compositeUrl = "";
    let compositeKey = "";
    let thumbnailUrl = "";
    let thumbnailKey = "";

    if (process.env.R2_ACCOUNT_ID) {
      const { uploadImage } = await import("@/lib/storage");
      const ext = result.format === "png" ? "png" : result.format === "jpeg" ? "jpg" : "webp";

      const [compResult, thumbResult] = await Promise.all([
        uploadImage(dealerId, vin, `${timestamp}_composite.${ext}`, result.buffer),
        uploadImage(dealerId, vin, `${timestamp}_composite_thumb.webp`, thumbnail.buffer),
      ]);

      compositeKey = compResult.key;
      compositeUrl = compResult.publicUrl;
      thumbnailKey = thumbResult.key;
      thumbnailUrl = thumbResult.publicUrl;
    } else {
      const { getPublicUrl } = await import("@/lib/storage");
      compositeKey = `dealers/${dealerId}/vehicles/${vin}/${timestamp}_composite.webp`;
      compositeUrl = getPublicUrl(compositeKey);
      thumbnailKey = `dealers/${dealerId}/vehicles/${vin}/${timestamp}_composite_thumb.webp`;
      thumbnailUrl = getPublicUrl(thumbnailKey);
    }

    // Update or create assignment in DB
    if (process.env.DATABASE_URL && vehicle_id) {
      try {
        const { query } = await import("@/lib/db");

        // Deactivate existing
        await query(
          `UPDATE vehicle_background_assignments SET is_active = false
           WHERE dealer_id = $1 AND vehicle_id = $2::uuid AND is_active = true`,
          [dealerId, vehicle_id],
        );

        // Create composite assignment
        await query(
          `INSERT INTO vehicle_background_assignments
             (dealer_id, vehicle_id, vin, background_type, preset_id, custom_bg_id,
              composite_key, composite_url, cutout_key, cutout_url,
              composite_width, composite_height, applied_method)
           VALUES ($1, $2::uuid, $3, 'composite', $4, $5::uuid,
                   $6, $7, $8, $9,
                   $10, $11, 'ai_composite')`,
          [
            dealerId, vehicle_id, vin,
            preset_id ?? null, custom_bg_id ?? null,
            compositeKey, compositeUrl,
            "", cutout_url,
            result.width, result.height,
          ],
        );
      } catch (err) {
        console.error("[api/composite] DB error:", err);
      }
    }

    trackBackground("background.composite_completed", dealerId, {
      vin,
      background_type,
      processing_ms: result.processing_ms,
      output_size: result.size,
      width: result.width,
      height: result.height,
      format: result.format,
    });

    return NextResponse.json({
      vin,
      composite_url: compositeUrl,
      thumbnail_url: thumbnailUrl,
      width: result.width,
      height: result.height,
      size: result.size,
      format: result.format,
      processing_ms: result.processing_ms,
      background_type,
      preset_id: preset_id ?? null,
      custom_bg_id: custom_bg_id ?? null,
    });
  } catch (err) {
    trackBackground("background.composite_failed", dealerId, {
      vin,
      error: err instanceof Error ? err.message : "Unknown error",
    });

    console.error("[api/composite] Error:", err);
    return NextResponse.json(
      { error: "Compositing failed", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
