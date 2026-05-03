/**
 * POST /api/admin/vehicles/backgrounds/remove-bg — AI background removal
 *
 * Accepts JSON body:
 *   vin: vehicle VIN
 *   vehicle_id: vehicle UUID
 *   source_photo_url: URL of the vehicle photo to process
 *   provider: "replicate" | "remove_bg" (optional, default: replicate)
 *
 * Returns the transparent cutout URL (uploaded to R2) and processing metrics.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackBackground } from "@/lib/analytics-hooks";
import { removeBackground, isAIAvailable, getProviderHealth } from "@/lib/background-removal";
import type { AIProvider } from "@/lib/background-removal";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id;

  let body: {
    vin?: string;
    vehicle_id?: string;
    source_photo_url?: string;
    provider?: AIProvider;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { vin, vehicle_id, source_photo_url, provider } = body;

  if (!vin || typeof vin !== "string") {
    return NextResponse.json({ error: "vin is required" }, { status: 400 });
  }
  if (!source_photo_url || typeof source_photo_url !== "string") {
    return NextResponse.json({ error: "source_photo_url is required" }, { status: 400 });
  }

  // Check if any AI provider is available
  if (!isAIAvailable()) {
    return NextResponse.json(
      {
        error: "No AI provider available. Set REPLICATE_API_TOKEN or REMOVE_BG_API_KEY.",
        providers: getProviderHealth(),
      },
      { status: 503 },
    );
  }

  trackBackground("background.removal_started", dealerId, {
    vin,
    source_photo_url,
    provider: provider ?? "replicate",
  });

  // Create job record in DB
  let jobId: string | null = null;
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const { rows } = await query(
        `INSERT INTO background_jobs
           (dealer_id, vehicle_id, vin, source_photo_url, status, ai_provider)
         VALUES ($1, $2::uuid, $3, $4, 'removing_bg', $5)
         RETURNING id`,
        [dealerId, vehicle_id ?? null, vin, source_photo_url, provider ?? "replicate"],
      );
      jobId = rows[0]?.id;
    } catch (err) {
      console.error("[api/remove-bg] Failed to create job record:", err);
    }
  }

  try {
    // Run AI background removal
    const result = await removeBackground({
      source_url: source_photo_url,
      provider,
    });

    // Upload cutout to R2
    let cutoutUrl = "";
    let cutoutKey = "";
    const timestamp = Date.now();

    if (process.env.R2_ACCOUNT_ID) {
      const { uploadImage } = await import("@/lib/storage");
      const uploadResult = await uploadImage(
        dealerId,
        vin,
        `${timestamp}_cutout.png`,
        result.cutout_buffer,
      );
      cutoutKey = uploadResult.key;
      cutoutUrl = uploadResult.publicUrl;
    } else {
      const { getPublicUrl } = await import("@/lib/storage");
      cutoutKey = `dealers/${dealerId}/vehicles/${vin}/${timestamp}_cutout.png`;
      cutoutUrl = getPublicUrl(cutoutKey);
    }

    // Update job record
    if (process.env.DATABASE_URL && jobId) {
      try {
        const { query } = await import("@/lib/db");
        await /* audit-safe: A4 reason="jobId came from a tenant-scoped INSERT in this same request, so updating by jobId cannot leak across dealers" */ query(
          `UPDATE background_jobs
           SET status = 'completed', cutout_key = $1, cutout_url = $2,
               ai_prediction_id = $3, processing_ms = $4, cost_cents = $5,
               completed_at = now()
           WHERE id = $6::uuid`,
          [cutoutKey, cutoutUrl, result.prediction_id, result.processing_ms, result.cost_cents, jobId],
        );
      } catch (err) {
        console.error("[api/remove-bg] Failed to update job:", err);
      }
    }

    trackBackground("background.removal_completed", dealerId, {
      vin,
      provider: result.provider,
      model: result.model,
      processing_ms: result.processing_ms,
      cost_cents: result.cost_cents,
      cutout_size: result.size,
      width: result.width,
      height: result.height,
    });

    return NextResponse.json({
      job_id: jobId,
      vin,
      cutout_url: cutoutUrl,
      width: result.width,
      height: result.height,
      size: result.size,
      provider: result.provider,
      model: result.model,
      prediction_id: result.prediction_id,
      processing_ms: result.processing_ms,
      cost_cents: result.cost_cents,
    });
  } catch (err) {
    // Update job as failed
    if (process.env.DATABASE_URL && jobId) {
      try {
        const { query } = await import("@/lib/db");
        await /* audit-safe: A4 reason="jobId came from a tenant-scoped INSERT in this same request, so updating by jobId cannot leak across dealers" */ query(
          `UPDATE background_jobs
           SET status = 'failed', error_message = $1, retry_count = retry_count + 1
           WHERE id = $2::uuid`,
          [err instanceof Error ? err.message : "Unknown error", jobId],
        );
      } catch {
        /* swallow */
      }
    }

    trackBackground("background.removal_failed", dealerId, {
      vin,
      error: err instanceof Error ? err.message : "Unknown error",
    });

    console.error("[api/remove-bg] Error:", err);
    return NextResponse.json(
      { error: "Background removal failed", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* GET — check AI provider health                                              */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  return NextResponse.json({
    available: isAIAvailable(),
    providers: getProviderHealth(),
  });
}
