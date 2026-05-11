/**
 * GET /api/cron/recall-refresh — weekly NHTSA + TSB cache refresh.
 *
 * Pulls every common (make, model, year) tuple from the free NHTSA recalls
 * API and upserts into the local cache, then refreshes the (currently mock)
 * TSB cache. Idempotent: ON CONFLICT upsert lets us re-run safely.
 *
 * vercel.json schedule (suggested): Sunday 03:00 UTC, e.g. "0 3 * * 0".
 *
 * NHTSA recalls API is REAL and free (no key). TSB sources are paid; today
 * we use the MockTSBProvider and label all rows as `source: "mock"` in the
 * downstream report.
 */

import { NextRequest, NextResponse } from "next/server";
import { refreshRecallsAndTSBs } from "@/lib/recalls";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  if (cronSecret) {
    const provided = authHeader?.replace("Bearer ", "") ?? cronHeader;
    if (provided !== cronSecret) {
      return NextResponse.json(
        { error: "Unauthorized — invalid cron secret" },
        { status: 401 },
      );
    }
  }

  const startedAt = Date.now();

  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({
        success: true,
        message: "No database configured — refresh skipped",
        recalls_fetched: 0,
        recalls_upserted: 0,
        tsbs_upserted: 0,
        duration_ms: Date.now() - startedAt,
      });
    }

    const result = await refreshRecallsAndTSBs();
    return NextResponse.json({
      success: true,
      ...result,
      duration_ms: Date.now() - startedAt,
      next_run: "next Sunday at 03:00 UTC",
    });
  } catch (err) {
    console.error("[cron/recall-refresh] Cron failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Recall refresh cron failed",
        duration_ms: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
