/**
 * GET  /api/admin/pricing  — return latest pricing report (cached < 24h)
 * POST /api/admin/pricing  — force regenerate + persist recommendations
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { query } from "@/lib/db";
import { generatePricingReport } from "@/lib/pricing-engine";
import { trackDeal } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* GET                                                                        */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  // Shadow mode — no DB available
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      cached: false,
      generatedAt: new Date(),
      totalVehicles: 0,
      immediateAction: [],
      soonAction: [],
      monitorAction: [],
      projectedRevenueImpact: 0,
      avgDaysOnLot: 0,
      stalledVehicles: 0,
    });
  }

  try {
    // Check for recent recommendations (< 24 hours old)
    const recent = await query(
      `SELECT
         pr.id,
         pr.vehicle_id,
         pr.current_price,
         pr.recommended_price,
         pr.action,
         pr.urgency,
         pr.reason,
         pr.generated_at,
         pr.applied_at,
         pr.dismissed_at,
         v.vin,
         v.year,
         v.make,
         v.model,
         COALESCE(v.trim, '') AS trim,
         COALESCE(v.condition, 'used') AS condition,
         v.created_at AS vehicle_created_at
       FROM pricing_recommendations pr
       JOIN vehicles v ON v.id = pr.vehicle_id
      WHERE pr.dealer_id = $1
        AND pr.generated_at > NOW() - INTERVAL '24 hours'
        AND pr.dismissed_at IS NULL
        AND pr.applied_at IS NULL
      ORDER BY pr.generated_at DESC`,
      [dealerId],
    );

    if (recent.rows.length > 0) {
      // Build a lightweight report summary from cached data
      const rows = recent.rows as any[];
      const immediateAction = rows.filter((r) => r.urgency === "immediate");
      const soonAction = rows.filter((r) => r.urgency === "soon");
      const monitorAction = rows.filter(
        (r) => r.urgency === "monitor" || r.urgency === "none",
      );

      const projectedRevenueImpact = rows
        .filter((r) => Number(r.recommended_price) < Number(r.current_price))
        .reduce(
          (sum, r) =>
            sum + (Number(r.current_price) - Number(r.recommended_price)),
          0,
        );

      return NextResponse.json({
        cached: true,
        generatedAt: rows[0].generated_at,
        totalVehicles: rows.length,
        immediateAction,
        soonAction,
        monitorAction,
        projectedRevenueImpact,
        avgDaysOnLot: 0, // not stored in table; will be refreshed on POST
        stalledVehicles: immediateAction.length,
      });
    }

    // No fresh cache — generate on the fly (does not persist)
    const report = await generatePricingReport(dealerId);
    return NextResponse.json({ cached: false, ...report });
  } catch (err) {
    console.error("[GET /api/admin/pricing] Error, returning empty report:", err);
    return NextResponse.json({
      cached: false,
      generatedAt: new Date(),
      totalVehicles: 0,
      immediateAction: [],
      soonAction: [],
      monitorAction: [],
      projectedRevenueImpact: 0,
      avgDaysOnLot: 0,
      stalledVehicles: 0,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* POST — force regenerate + persist                                          */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  // Shadow mode — no DB available
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      cached: false,
      generatedAt: new Date(),
      totalVehicles: 0,
      immediateAction: [],
      soonAction: [],
      monitorAction: [],
      projectedRevenueImpact: 0,
      avgDaysOnLot: 0,
      stalledVehicles: 0,
    });
  }

  // Rate limit: 10 regenerations per hour
  const rl = await checkRateLimit(`pricing-regenerate:${dealerId}`, 10, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded — pricing report can be regenerated at most 10 times per hour",
        resetAt: rl.resetAt,
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(rl.resetAt),
        },
      },
    );
  }

  try {
    const report = await generatePricingReport(dealerId);
    const allAnalyses = [
      ...report.immediateAction,
      ...report.soonAction,
      ...report.monitorAction,
    ];

    // Persist to pricing_recommendations (upsert by vehicle_id within dealer)
    // Delete stale recs first, then insert fresh batch
    if (allAnalyses.length > 0) {
      await query(
        `DELETE FROM pricing_recommendations WHERE dealer_id = $1`,
        [dealerId],
      );

      for (const a of allAnalyses) {
        await query(
          `INSERT INTO pricing_recommendations
             (dealer_id, vehicle_id, current_price, recommended_price,
              action, urgency, reason, generated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT DO NOTHING`,
          [
            dealerId,
            a.vehicleId,
            a.currentPrice,
            a.recommendedPrice,
            a.action,
            a.urgency,
            a.actionReason,
          ],
        );
      }
    }

    try { trackDeal("deal.pricing_generated", authResult?.user?.dealer_id ?? "system", { action: "pricing_generated", vehicle_count: allAnalyses.length }); } catch {}
    return NextResponse.json({ cached: false, ...report });
  } catch (err) {
    console.error("[POST /api/admin/pricing] Error, returning empty report:", err);
    return NextResponse.json({
      cached: false,
      generatedAt: new Date(),
      totalVehicles: 0,
      immediateAction: [],
      soonAction: [],
      monitorAction: [],
      projectedRevenueImpact: 0,
      avgDaysOnLot: 0,
      stalledVehicles: 0,
    });
  }
}
