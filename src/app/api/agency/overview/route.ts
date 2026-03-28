import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface AgencyOverview {
  total_dealers: number;
  active_dealers: number;
  total_leads: number;
  total_deals: number;
  total_revenue_mtd: number;
  avg_leads_per_dealer: number;
  avg_revenue_per_dealer: number;
  top_performer: { name: string; revenue: number } | null;
}

/* -------------------------------------------------------------------------- */
/* GET /api/agency/overview — agency-wide aggregate metrics                   */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (authResult.user.role !== "admin") {
    return NextResponse.json(
      { error: "Agency-level access required" },
      { status: 403 },
    );
  }

  if (!process.env.DATABASE_URL) {
    // Shadow mode sample data
    const overview: AgencyOverview = {
      total_dealers: 3,
      active_dealers: 2,
      total_leads: 273,
      total_deals: 42,
      total_revenue_mtd: 797500,
      avg_leads_per_dealer: 91,
      avg_revenue_per_dealer: 265833,
      top_performer: { name: "Wolfpack Auto", revenue: 412500 },
    };
    return NextResponse.json({ overview });
  }

  try {
    const { query } = await import("@/lib/db");

    const dealerCount = await query(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active
       FROM dealers`,
    );

    const leadCount = await query(
      `SELECT COUNT(*)::int AS cnt FROM leads WHERE deleted_at IS NULL`,
    );

    const dealStats = await query(
      `SELECT
        COUNT(*)::int AS cnt,
        COALESCE(SUM(total_amount), 0)::numeric AS revenue
       FROM deals
       WHERE created_at >= date_trunc('month', CURRENT_DATE)`,
    );

    const topPerformer = await query(
      `SELECT d.name, COALESCE(SUM(dl.total_amount), 0)::numeric AS revenue
       FROM dealers d
       LEFT JOIN deals dl ON dl.dealer_id = d.id
         AND dl.created_at >= date_trunc('month', CURRENT_DATE)
       GROUP BY d.id, d.name
       ORDER BY revenue DESC
       LIMIT 1`,
    );

    const row = dealerCount.rows[0] as { total: number; active: number };
    const totalDealers = row.total || 1;

    const overview: AgencyOverview = {
      total_dealers: row.total,
      active_dealers: row.active,
      total_leads: (leadCount.rows[0] as { cnt: number }).cnt,
      total_deals: (dealStats.rows[0] as { cnt: number }).cnt,
      total_revenue_mtd: Number((dealStats.rows[0] as { revenue: number }).revenue),
      avg_leads_per_dealer: Math.round(
        (leadCount.rows[0] as { cnt: number }).cnt / totalDealers,
      ),
      avg_revenue_per_dealer: Math.round(
        Number((dealStats.rows[0] as { revenue: number }).revenue) / totalDealers,
      ),
      top_performer: topPerformer.rows[0]
        ? {
            name: (topPerformer.rows[0] as { name: string }).name,
            revenue: Number((topPerformer.rows[0] as { revenue: number }).revenue),
          }
        : null,
    };

    return NextResponse.json({ overview });
  } catch (err) {
    console.error("[api/agency/overview] DB error:", err);
    // Fallback to shadow data
    return NextResponse.json({
      overview: {
        total_dealers: 0,
        active_dealers: 0,
        total_leads: 0,
        total_deals: 0,
        total_revenue_mtd: 0,
        avg_leads_per_dealer: 0,
        avg_revenue_per_dealer: 0,
        top_performer: null,
      },
    });
  }
}
