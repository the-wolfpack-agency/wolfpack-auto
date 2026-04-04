import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackCohort } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/analytics/cohorts — Retention matrix                        */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);
  const { searchParams } = new URL(request.url);
  const periodType = (searchParams.get("period") ?? "month") as "week" | "month";

  // Shadow mode — return demo retention matrix
  if (!process.env.DATABASE_URL) {
    const { getDemoRetentionMatrix, identifyChurnRisk } = await import(
      "@/lib/retention-cohorts"
    );
    const matrix = getDemoRetentionMatrix();
    const churnRisks = identifyChurnRisk(matrix);

    trackCohort("cohort.analysis_generated", dealerId, { period: periodType, shadow: true });

    return NextResponse.json({
      matrix,
      churnRisks,
      dealerId,
    });
  }

  // Production — build from analytics events
  const { query } = await import("@/lib/db");
  const { buildRetentionMatrix, identifyChurnRisk } = await import(
    "@/lib/retention-cohorts"
  );

  const result = await query(
    `SELECT user_fingerprint AS "visitorId", timestamp
     FROM analytics_events
     WHERE metadata->>'dealer_id' = $1
       AND timestamp > NOW() - INTERVAL '6 months'
     ORDER BY timestamp ASC`,
    [dealerId],
  );

  const events = result.rows.map((r: Record<string, unknown>) => ({
    visitorId: String(r.visitorId),
    timestamp: String(r.timestamp),
  }));

  const matrix = buildRetentionMatrix(events, periodType);
  const churnRisks = identifyChurnRisk(matrix);

  trackCohort("cohort.analysis_generated", dealerId, { period: periodType, event_count: events.length });

  return NextResponse.json({ matrix, churnRisks, dealerId });
}
