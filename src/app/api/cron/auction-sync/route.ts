/**
 * GET /api/cron/auction-sync — Vercel cron job endpoint.
 *
 * Pulls every active auction source, refreshes benchmarks, and scores
 * acquisition opportunities for every active dealer.
 *
 * vercel.json schedule (suggested): every 6 hours, e.g. "0 0,6,12,18 * * *".
 */
import { NextRequest, NextResponse } from "next/server";
import { syncAllSources, scoreAcquisitionOpportunities } from "@/lib/auction-feed";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  if (cronSecret) {
    const provided = authHeader?.replace("Bearer ", "") ?? cronHeader;
    if (provided !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized — invalid cron secret" }, { status: 401 });
    }
  }

  const startedAt = Date.now();

  try {
    const syncResults = await syncAllSources();

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({
        success: true,
        message: "No database configured — sync skipped",
        sync_results: syncResults,
        scoring_results: [],
        duration_ms: Date.now() - startedAt,
      });
    }

    const { query } = await import("@/lib/db");
    const dealers = await query<{ id: string }>(
      `SELECT id FROM dealers WHERE COALESCE(active, TRUE) = TRUE LIMIT 100`,
    ).catch(() => ({ rows: [] as { id: string }[] }));

    const scoringResults = [];
    for (const dealer of dealers.rows) {
      try {
        scoringResults.push(await scoreAcquisitionOpportunities(dealer.id));
      } catch (err) {
        console.error(`[cron/auction-sync] Score failed for ${dealer.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      sync_results: syncResults,
      scoring_results: scoringResults,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[cron/auction-sync] Cron failed:", err);
    return NextResponse.json(
      { success: false, error: "Cron failed", duration_ms: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
