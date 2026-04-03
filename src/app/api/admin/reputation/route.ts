import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/reputation — Score, alerts, and reviews                     */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);

  const {
    getDemoReviews,
    calculateReputationScore,
    getReviewAlerts,
    detectSentimentShift,
  } = await import("@/lib/reputation-monitor");

  // Shadow mode — return demo data
  if (!process.env.DATABASE_URL) {
    const reviews = getDemoReviews();
    const score = calculateReputationScore(reviews);
    const alerts = getReviewAlerts(reviews);
    const trends = detectSentimentShift(reviews, 30);

    return NextResponse.json({
      score,
      alerts,
      reviews,
      trends,
      dealerId,
    });
  }

  // Production — query from reviews table
  const { query } = await import("@/lib/db");
  const result = await query(
    `SELECT id, source, author, rating, text, date, responded, response_text AS "responseText"
     FROM reviews
     WHERE dealer_id = $1
     ORDER BY date DESC
     LIMIT 100`,
    [dealerId],
  );

  const reviews = result.rows as any[];
  const score = calculateReputationScore(reviews);
  const alerts = getReviewAlerts(reviews);
  const trends = detectSentimentShift(reviews, 30);

  return NextResponse.json({ score, alerts, reviews, trends, dealerId });
}
