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
