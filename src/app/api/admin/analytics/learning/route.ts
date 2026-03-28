/**
 * GET /api/admin/analytics/learning — Current learning insights
 *
 * Returns computed LearningInsights derived from all tracked events
 * across deals, service, comms, reviews, and digital retail modules.
 */
import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getLearningInsights } from "@/lib/learning-aggregator";

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      insights: {
        top_lead_sources: ["Organic Search", "Direct", "Social Media"],
        avg_close_time_days: 12,
        best_performing_model: "RAM 1500",
        recommendation: "Focus on follow-up speed — leads contacted within 1 hour convert 3x better.",
      },
      dealer_id: "shadow",
    });
  }

  const dealerId = authResult.user.dealer_id;

  try {
    const insights = await getLearningInsights(dealerId);
    return NextResponse.json({ insights, dealer_id: dealerId });
  } catch (err) {
    console.error("[api/admin/analytics/learning] Error:", err);
    return NextResponse.json(
      { error: "Failed to compute learning insights" },
      { status: 500 },
    );
  }
}
