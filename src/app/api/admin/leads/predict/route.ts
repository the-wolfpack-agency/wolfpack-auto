/**
 * GET /api/admin/leads/predict  — Predictive scores for all active leads
 * POST /api/admin/leads/predict — Predictive score for a single lead
 *
 * Uses the 45+ behavioral signals from analytics_events to predict
 * purchase probability within a 7-day window.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import {
  predictLeadScore,
  predictBatchScores,
  type PredictiveScore,
} from "@/lib/predictive-lead-scorer";
import { trackLead } from "@/lib/analytics-hooks";

/** Fallback dealer UUID for demo mode. */
const DEALER_ID =
  process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

/* -------------------------------------------------------------------------- */
/* GET /api/admin/leads/predict — batch score all active leads                 */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id ?? DEALER_ID;

  try {
    const scores = await predictBatchScores(dealerId);

    // Convert Map to array for JSON serialization
    const predictions: Array<{ lead_id: string } & PredictiveScore> = [];
    for (const [leadId, score] of scores) {
      predictions.push({ lead_id: leadId, ...score });
    }

    // Track analytics — fire-and-forget
    try {
      trackLead("lead.scored", dealerId, {
        action: "batch_predict",
        leads_scored: predictions.length,
        avg_score: predictions.length > 0
          ? Math.round(predictions.reduce((s, p) => s + p.score, 0) / predictions.length)
          : 0,
        hot_leads: predictions.filter((p) => p.temperature === "hot").length,
      });
    } catch { /* analytics must never throw */ }

    return NextResponse.json({
      predictions,
      total: predictions.length,
      scored_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/admin/leads/predict] Batch scoring failed:", err);
    return NextResponse.json(
      { error: "Prediction failed" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/leads/predict — score a single lead                         */
/* -------------------------------------------------------------------------- */

const bodySchema = z.object({
  lead_id: z.string().min(1, "lead_id is required"),
});

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id ?? DEALER_ID;

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const { lead_id } = parsed.data;

  try {
    const score = await predictLeadScore(lead_id, dealerId);

    // Track analytics — fire-and-forget
    try {
      trackLead("lead.scored", dealerId, {
        action: "single_predict",
        lead_id,
        score: score.score,
        probability: score.probability,
        buy_window: score.buy_window,
        confidence: score.confidence,
        temperature: score.temperature,
      });
    } catch { /* analytics must never throw */ }

    // Persist the predictive score back to the lead record if DB is available
    if (process.env.DATABASE_URL) {
      void (async () => {
        try {
          const { query } = await import("@/lib/db");
          await query(
            `UPDATE leads
                SET predictive_score = $1,
                    predictive_buy_window = $2,
                    predictive_confidence = $3,
                    predictive_action = $4,
                    predicted_at = NOW(),
                    updated_at = NOW()
              WHERE id = $5`,
            [score.score, score.buy_window, score.confidence, score.recommended_action, lead_id],
          );
        } catch (err) {
          console.error("[api/admin/leads/predict] Failed to persist score:", err);
        }
      })();
    }

    return NextResponse.json({
      lead_id,
      ...score,
      scored_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/admin/leads/predict] Single scoring failed:", err);
    return NextResponse.json(
      { error: "Prediction failed" },
      { status: 500 },
    );
  }
}
