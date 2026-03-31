/**
 * GET /api/cron/predict-leads — Vercel cron job endpoint
 *
 * Scores all active leads for all dealers using the predictive lead scorer.
 * Updates lead records with latest predictive scores and fires analytics events.
 *
 * Designed to run every 6 hours via Vercel cron.
 *
 * vercel.json cron config:
 *   { "path": "/api/cron/predict-leads", "schedule": "0 0,6,12,18 * * *" }
 */
import { NextRequest, NextResponse } from "next/server";
import { predictLeadScore, type PredictiveScore } from "@/lib/predictive-lead-scorer";
import { trackLead } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* GET /api/cron/predict-leads                                                 */
/* -------------------------------------------------------------------------- */

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
      message: "No database configured — skipping predictive scoring",
      scored: 0,
    });
  }

  const startTime = Date.now();

  try {
    const { query } = await import("@/lib/db");

    // Get all active dealers
    const dealersResult = await query<{ id: string }>(
      `SELECT DISTINCT dealer_id AS id FROM leads
       WHERE status NOT IN ('sold', 'lost', 'converted')
         AND deleted_at IS NULL
       LIMIT 100`,
    );

    const dealerIds = dealersResult.rows.map((r) => r.id);
    let totalScored = 0;
    let totalErrors = 0;
    const dealerResults: Array<{ dealer_id: string; scored: number; errors: number }> = [];

    for (const dealerId of dealerIds) {
      // Get active leads for this dealer
      const leadsResult = await query<{ id: string }>(
        `SELECT id FROM leads
         WHERE dealer_id = $1
           AND status NOT IN ('sold', 'lost', 'converted')
           AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 200`,
        [dealerId],
      );

      let dealerScored = 0;
      let dealerErrors = 0;

      // Score in batches of 10
      const leadIds = leadsResult.rows.map((r) => r.id);
      const BATCH_SIZE = 10;

      for (let i = 0; i < leadIds.length; i += BATCH_SIZE) {
        const batch = leadIds.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (leadId) => {
            const score = await predictLeadScore(leadId, dealerId);
            return { leadId, score };
          }),
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            const { leadId, score } = result.value;

            // Persist score to lead record
            try {
              await query(
                `UPDATE leads
                    SET predictive_score = $1,
                        predictive_buy_window = $2,
                        predictive_confidence = $3,
                        predictive_action = $4,
                        predicted_at = NOW(),
                        updated_at = NOW()
                  WHERE id = $5`,
                [score.score, score.buy_window, score.confidence, score.recommended_action, leadId],
              );

              // Track analytics event
              try {
                trackLead("lead.scored", dealerId, {
                  action: "cron_predict",
                  lead_id: leadId,
                  score: score.score,
                  buy_window: score.buy_window,
                  temperature: score.temperature,
                });
              } catch { /* analytics must never throw */ }

              dealerScored++;
            } catch (err) {
              console.error(`[cron/predict-leads] Failed to persist score for ${leadId}:`, err);
              dealerErrors++;
            }
          } else {
            dealerErrors++;
            console.error("[cron/predict-leads] Score failed:", result.reason);
          }
        }
      }

      totalScored += dealerScored;
      totalErrors += dealerErrors;
      dealerResults.push({
        dealer_id: dealerId,
        scored: dealerScored,
        errors: dealerErrors,
      });
    }

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      dealers_processed: dealerIds.length,
      total_scored: totalScored,
      total_errors: totalErrors,
      duration_ms: durationMs,
      dealer_results: dealerResults,
      next_run: "in 6 hours",
    });
  } catch (err) {
    console.error("[cron/predict-leads] Cron job failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Predictive scoring cron failed",
        duration_ms: Date.now() - startTime,
      },
      { status: 500 },
    );
  }
}
