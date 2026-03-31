import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import {
  generateInsights,
  getPricingBenchmark,
  getRegionalDemand,
  getNetworkStats,
} from "@/lib/cross-dealer-intelligence";

/**
 * GET /api/admin/analytics/intelligence
 *
 * Returns anonymized cross-dealer insights for the authenticated dealer.
 *
 * Query params:
 *   ?type=pricing_benchmark&make=Toyota&model=Camry&year=2024
 *     → returns specific pricing benchmark
 *   ?type=regional_demand&zip_prefix=021
 *     → returns demand signals for a ZIP region
 *   (no params)
 *     → returns all insights for the dealer
 *
 * All data is anonymized — no dealer names, no customer PII, no exact inventory.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  try {
    // Track analytics event for intelligence usage
    // (fire-and-forget, do not await)
    void trackIntelligenceEvent(dealerId, type ?? "all_insights");

    // Specific pricing benchmark request
    if (type === "pricing_benchmark") {
      const make = searchParams.get("make");
      const model = searchParams.get("model");
      const yearStr = searchParams.get("year");

      if (!make || !model || !yearStr) {
        return NextResponse.json(
          { error: "Missing required params: make, model, year" },
          { status: 400 },
        );
      }

      const year = parseInt(yearStr, 10);
      if (isNaN(year) || year < 1990 || year > 2030) {
        return NextResponse.json(
          { error: "Invalid year — must be between 1990 and 2030" },
          { status: 400 },
        );
      }

      const zipPrefix = searchParams.get("zip_prefix") ?? "021";
      const benchmark = await getPricingBenchmark(make, model, year, zipPrefix);

      return NextResponse.json({ benchmark }, {
        headers: securityHeaders(),
      });
    }

    // Regional demand request
    if (type === "regional_demand") {
      const zipPrefix = searchParams.get("zip_prefix") ?? "021";
      const demand = await getRegionalDemand(zipPrefix);

      return NextResponse.json({ demand }, {
        headers: securityHeaders(),
      });
    }

    // Default: return all insights + network stats
    const [insights, networkStats] = await Promise.all([
      generateInsights(dealerId),
      getNetworkStats(),
    ]);

    return NextResponse.json(
      {
        insights,
        network_stats: networkStats,
        generated_at: new Date().toISOString(),
      },
      { headers: securityHeaders() },
    );
  } catch (err) {
    console.error("[api/admin/analytics/intelligence] Unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to generate intelligence insights" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function securityHeaders(): Record<string, string> {
  return {
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}

/**
 * Track that the intelligence endpoint was consumed.
 * Fire-and-forget — never blocks the response.
 */
async function trackIntelligenceEvent(dealerId: string, insightType: string) {
  try {
    if (!process.env.DATABASE_URL) return;
    const { pool: dbPool } = await import("@/lib/db");
    await dbPool.query(
      `INSERT INTO analytics_events (dealer_id, event_type, action, page, session_id, user_fingerprint, timestamp, metadata)
       VALUES ($1, 'system.intelligence_served', $2, '/admin/market-intelligence', 'system', 'system', NOW(), $3)`,
      [dealerId, insightType, JSON.stringify({ insight_type: insightType })],
    );
  } catch {
    // Analytics tracking failure must never break the main response
  }
}
