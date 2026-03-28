import { NextRequest, NextResponse } from "next/server";
import { getInventoryRecommendations } from "@/lib/intake/recommendation-engine";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/**
 * GET /api/admin/intake/recommendations
 *
 * Returns inventory optimization recommendations:
 *  - Inventory gaps (high demand, low stock)
 *  - Slow movers (vehicles on lot > 60 days)
 *  - Pricing opportunities (over/under-priced vs market)
 *
 * dealer_id is taken from the authenticated session.
 */
export async function GET(_request: NextRequest) {
  // --- Authentication ---
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      dealer_id: "shadow",
      generated_at: new Date().toISOString(),
      inventory_gaps: [{ segment: "Compact SUV", demand_score: 87, current_stock: 2, recommended_stock: 6 }],
      slow_movers: [{ vin: "1HGCV1F34PA000001", days_on_lot: 78, make: "Honda", model: "Civic" }],
      pricing_opportunities: [{ vin: "5YJSA1E26MF000001", delta: -1200, recommendation: "Price reduction suggested" }],
    });
  }

  const dealerId = authResult.user.dealer_id;

  try {
    const recommendations = await getInventoryRecommendations(dealerId);

    return NextResponse.json({
      dealer_id: dealerId,
      generated_at: new Date().toISOString(),
      ...recommendations,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to generate recommendations",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
