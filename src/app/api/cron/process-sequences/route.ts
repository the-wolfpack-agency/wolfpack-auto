/**
 * GET /api/cron/process-sequences — Vercel cron job endpoint
 *
 * Processes all due follow-up sequence steps. Triggered every 15 minutes
 * by Vercel cron. Secured by CRON_SECRET header validation.
 *
 * vercel.json cron config:
 *   { "path": "/api/cron/process-sequences", "schedule": "* /15 * * * *" }
 */
import { NextRequest, NextResponse } from "next/server";
import { processDueSequenceSteps } from "@/lib/comms-scheduler";
import { trackComms } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* GET /api/cron/process-sequences                                             */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  // Validate cron secret — Vercel sends this as the Authorization header
  // for cron jobs, or we accept it as x-cron-secret for manual triggers.
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

  try {
    const result = await processDueSequenceSteps(50);

    // Track analytics — fire-and-forget
    try {
      const dealerId = process.env.DEALER_ID ?? "system";
      trackComms("comms.sequence_completed", dealerId, {
        processed: result.processed,
        skipped: result.skipped,
        errors: result.errors,
        trigger: "cron",
      });
    } catch { /* analytics must never throw */ }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("[api/cron/process-sequences] Error:", err);
    return NextResponse.json(
      { error: "Failed to process sequences" },
      { status: 500 },
    );
  }
}
