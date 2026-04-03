import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackSystem } from "@/lib/analytics-hooks";
import {
  calibrate,
  applyCalibration,
  getCalibrationHistory,
} from "@/lib/prediction-calibrator";

/**
 * GET /api/admin/analytics/calibration
 *
 * Returns the latest calibration result plus full history.
 */
export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ calibrated: false, message: "No database configured" });
  }

  const auth = await requireAuth();
  if (!isAuthenticated(auth)) return auth;

  const dealerId = getDealerId(auth);

  try {
    const history = await getCalibrationHistory(dealerId);
    const latest = history.length > 0 ? history[0] : null;

    return NextResponse.json({
      latest,
      history,
      dealer_id: dealerId,
    });
  } catch (err) {
    console.error("[calibration] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to retrieve calibration data" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/analytics/calibration
 *
 * Trigger a new calibration run. Compares predictions vs outcomes,
 * computes weight adjustments, and applies them.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!isAuthenticated(auth)) return auth;

  const dealerId = getDealerId(auth);
  const startTime = Date.now();

  try {
    // Parse optional period from request body
    let periodDays = 14;
    try {
      const body = await request.json();
      if (body.period_days && typeof body.period_days === "number") {
        periodDays = Math.max(7, Math.min(90, body.period_days));
      }
    } catch {
      // No body or invalid JSON — use default
    }

    // Run calibration
    const result = await calibrate(dealerId, periodDays);

    // Apply weight adjustments
    await applyCalibration(dealerId, result);

    // Track analytics event
    try {
      trackSystem("system.calibration_run" as any, dealerId, {
        accuracy: result.accuracy,
        precision: result.precision,
        recall: result.recall,
        f1_score: result.f1_score,
        sample_size: result.sample_size,
        period_days: result.period_days,
        duration_ms: Date.now() - startTime,
      });
    } catch { /* analytics must never throw */ }

    return NextResponse.json({
      success: true,
      result,
      applied: true,
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    console.error("[calibration] POST failed:", err);
    return NextResponse.json(
      { error: "Calibration failed" },
      { status: 500 },
    );
  }
}
