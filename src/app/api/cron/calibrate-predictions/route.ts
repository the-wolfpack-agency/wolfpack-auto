/**
 * GET /api/cron/calibrate-predictions — Vercel cron job endpoint
 *
 * Weekly auto-calibration: compares predicted lead scores against actual
 * outcomes for the past 14 days, adjusts signal weights, and stores
 * calibration history.
 *
 * Designed to run every Monday at 2 AM UTC via Vercel cron.
 *
 * vercel.json cron config:
 *   { "path": "/api/cron/calibrate-predictions", "schedule": "0 2 * * 1" }
 */
import { NextRequest, NextResponse } from "next/server";
import {
  calibrate,
  applyCalibration,
} from "@/lib/prediction-calibrator";

export async function GET(request: NextRequest) {
  // Validate cron secret — Vercel sends this as the Authorization header
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");

  if (cronSecret) {
    const providedSecret = authHeader?.replace("Bearer ", "") ?? cronHeader;
    if (providedSecret !== cronSecret) {
      return NextResponse.json(
        { error: "Unauthorized — invalid cron secret" },
        { status: 401 },
      );
    }
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      success: true,
      message: "No database configured — skipping calibration",
      calibrated: 0,
    });
  }

  const startTime = Date.now();

  try {
    const { query } = await import("@/lib/db");

    // Get all dealers that have scored leads
    const dealersResult = await query<{ id: string }>(
      `SELECT DISTINCT dealer_id AS id FROM leads
       WHERE predictive_score IS NOT NULL
         AND predicted_at > NOW() - INTERVAL '14 days'
         AND deleted_at IS NULL
       LIMIT 100`,
    );

    const dealerIds = dealersResult.rows.map((r) => r.id);
    let totalCalibrated = 0;
    let totalErrors = 0;
    const dealerResults: Array<{
      dealer_id: string;
      accuracy: number;
      precision: number;
      sample_size: number;
      applied: boolean;
    }> = [];

    for (const dealerId of dealerIds) {
      try {
        // Run calibration for this dealer
        const result = await calibrate(dealerId, 14);

        // Only apply if we have enough data
        if (result.sample_size >= 5) {
          await applyCalibration(dealerId, result);
          totalCalibrated++;
          dealerResults.push({
            dealer_id: dealerId,
            accuracy: result.accuracy,
            precision: result.precision,
            sample_size: result.sample_size,
            applied: true,
          });
        } else {
          dealerResults.push({
            dealer_id: dealerId,
            accuracy: result.accuracy,
            precision: result.precision,
            sample_size: result.sample_size,
            applied: false,
          });
        }
      } catch (err) {
        totalErrors++;
        console.error(`[cron/calibrate-predictions] Failed for dealer ${dealerId}:`, err);
      }
    }

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      dealers_processed: dealerIds.length,
      dealers_calibrated: totalCalibrated,
      total_errors: totalErrors,
      duration_ms: durationMs,
      dealer_results: dealerResults,
      next_run: "next Monday at 2 AM UTC",
    });
  } catch (err) {
    console.error("[cron/calibrate-predictions] Cron job failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Calibration cron failed",
        duration_ms: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}
