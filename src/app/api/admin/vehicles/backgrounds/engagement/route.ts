/**
 * POST /api/admin/vehicles/backgrounds/engagement — Track photo engagement events
 *
 * Accepts JSON body:
 *   vin: vehicle VIN
 *   event: "view" | "dwell" | "click"
 *   dwell_ms: number (for dwell events)
 *   background_type: "preset" | "custom" | "composite" | "none"
 *   preset_id: string (optional)
 *
 * Fire-and-forget from the client. Always returns 200.
 */
import { NextRequest, NextResponse } from "next/server";
import { trackBackground, trackPhotoEngagement } from "@/lib/analytics-hooks";
import { requireAuth } from "@/lib/auth-guard";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  try {
    const body = await request.json();
    const { vin, event, dwell_ms, background_type, preset_id } = body as {
      vin?: string;
      event?: string;
      dwell_ms?: number;
      background_type?: string;
      preset_id?: string;
    };

    if (!vin || !event) {
      return NextResponse.json({ ok: true }); // Silent fail for engagement
    }

    const dealerId = "unknown"; // Engagement can come from public pages

    // Track in analytics system
    if (event === "view") {
      trackPhotoEngagement("photo.dwell", dealerId, {
        vin,
        background_type: background_type ?? "none",
        preset_id: preset_id ?? "",
        event_type: "view",
      });
    } else if (event === "dwell") {
      trackPhotoEngagement("photo.dwell", dealerId, {
        vin,
        background_type: background_type ?? "none",
        preset_id: preset_id ?? "",
        dwell_ms: dwell_ms ?? 0,
        event_type: "dwell",
      });
    } else if (event === "click") {
      trackPhotoEngagement("photo.first_clicked", dealerId, {
        vin,
        background_type: background_type ?? "none",
        preset_id: preset_id ?? "",
        event_type: "click",
      });
    }

    // Update assignment counters in DB
    if (process.env.DATABASE_URL && vin) {
      try {
        const { query } = await import("@/lib/db");

        if (event === "view") {
          await query(
            `UPDATE vehicle_background_assignments
             SET views = views + 1
             WHERE vin = $1 AND is_active = true`,
            [vin],
          );
        } else if (event === "click") {
          await query(
            `UPDATE vehicle_background_assignments
             SET clicks = clicks + 1
             WHERE vin = $1 AND is_active = true`,
            [vin],
          );
        } else if (event === "dwell" && dwell_ms) {
          // Running average: new_avg = ((old_avg * views) + new_dwell) / (views + 1)
          await query(
            `UPDATE vehicle_background_assignments
             SET avg_dwell_ms = CASE
               WHEN views > 0 THEN ((avg_dwell_ms * views) + $2) / (views + 1)
               ELSE $2
             END
             WHERE vin = $1 AND is_active = true`,
            [vin, dwell_ms],
          );
        }
      } catch {
        /* swallow — engagement tracking must never fail */
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Always 200 for engagement
  }
}
