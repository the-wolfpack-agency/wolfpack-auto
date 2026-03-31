import { NextRequest, NextResponse } from "next/server";
import { getRelatedVehicles, getRecommendationsForUser } from "@/lib/lookalike-engine";
import { trackServerEvent } from "@/lib/analytics";

/**
 * GET /api/inventory/recommendations
 *
 * Public endpoint — powers the customer-facing "Shoppers Also Viewed" section.
 * No auth required.
 *
 * Query params:
 *   ?vin=X          — returns related vehicles for that VIN (co-viewed)
 *   ?session=X      — returns personalized recommendations for that session fingerprint
 *   ?limit=N        — max results (default 5, max 10)
 *
 * Tracks `system.recommendation_served` analytics event for every request.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const vin = searchParams.get("vin");
  const session = searchParams.get("session");
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam ?? "5", 10) || 5, 1), 10);

  // Dealer ID: from query param, env, or default
  const dealerId =
    searchParams.get("dealer_id") ??
    process.env.DEALER_ID ??
    "00000000-0000-4000-a000-000000000001";

  if (!vin && !session) {
    return NextResponse.json(
      { error: "Either ?vin= or ?session= query parameter is required" },
      { status: 400 },
    );
  }

  try {
    let recommendations;
    let type: string;

    if (vin) {
      recommendations = await getRelatedVehicles(vin, dealerId, limit);
      type = "related_vehicles";
    } else {
      recommendations = await getRecommendationsForUser(session!, dealerId, limit);
      type = "user_recommendations";
    }

    // Track recommendation served event (fire-and-forget)
    trackServerEvent("system.recommendation_served", {
      type,
      vin: vin ?? "",
      session: session ?? "",
      result_count: String(recommendations.length),
      dealer_id: dealerId,
    }).catch(() => {});

    return NextResponse.json({
      type,
      recommendations,
      count: recommendations.length,
    });
  } catch (err) {
    console.error("[recommendations] GET failed:", err);
    return NextResponse.json(
      { error: "Failed to generate recommendations" },
      { status: 500 },
    );
  }
}
