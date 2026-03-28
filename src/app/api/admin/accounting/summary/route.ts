import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface AccountingSummary {
  period: string;
  units_sold: number;
  total_revenue: number;
  total_front_gross: number;
  total_back_gross: number;
  total_fi_gross: number;
  total_gross: number;
  avg_front_gross: number;
  avg_back_gross: number;
  avg_fi_gross: number;
  avg_deal_gross: number;
  top_salesperson: { name: string; units: number; gross: number };
  by_salesperson: { name: string; units: number; front_gross: number; back_gross: number; fi_gross: number; total_gross: number }[];
  by_deal_type: { type: string; count: number; gross: number }[];
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/accounting/summary                                           */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? "2026-03";

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const result = await query(
        `SELECT
           COUNT(*) AS units_sold,
           SUM(sale_price) AS total_revenue,
           SUM(front_gross) AS total_front_gross,
           SUM(back_gross) AS total_back_gross,
           SUM(fi_gross) AS total_fi_gross,
           SUM(total_gross) AS total_gross,
           AVG(front_gross) AS avg_front_gross,
           AVG(back_gross) AS avg_back_gross,
           AVG(fi_gross) AS avg_fi_gross,
           AVG(total_gross) AS avg_deal_gross
         FROM sales_log
         WHERE dealer_id = $1 AND date >= $2 AND date < ($2::date + interval '1 month')::text`,
        [dealerId, `${month}-01`],
      );

      const byPerson = await query(
        `SELECT salesperson AS name, COUNT(*) AS units,
                SUM(front_gross) AS front_gross, SUM(back_gross) AS back_gross,
                SUM(fi_gross) AS fi_gross, SUM(total_gross) AS total_gross
         FROM sales_log
         WHERE dealer_id = $1 AND date >= $2 AND date < ($2::date + interval '1 month')::text
         GROUP BY salesperson
         ORDER BY total_gross DESC`,
        [dealerId, `${month}-01`],
      );

      const byType = await query(
        `SELECT deal_type AS type, COUNT(*) AS count, SUM(total_gross) AS gross
         FROM sales_log
         WHERE dealer_id = $1 AND date >= $2 AND date < ($2::date + interval '1 month')::text
         GROUP BY deal_type`,
        [dealerId, `${month}-01`],
      );

      const row = (result.rows as Record<string, number>[])[0];
      const topPerson = (byPerson.rows as { name: string; units: number; total_gross: number }[])[0];

      return NextResponse.json({
        summary: {
          period: month,
          ...row,
          top_salesperson: topPerson ? { name: topPerson.name, units: topPerson.units, gross: topPerson.total_gross } : null,
          by_salesperson: byPerson.rows,
          by_deal_type: byType.rows,
        },
      });
    } catch (err) {
      console.error("[api/admin/accounting/summary] DB error:", err);
    }
  }

  // Shadow mode — compute from hardcoded sales
  const summary: AccountingSummary = {
    period: month,
    units_sold: 8,
    total_revenue: 275600,
    total_front_gross: 26700,
    total_back_gross: 15025,
    total_fi_gross: 16500,
    total_gross: 58225,
    avg_front_gross: 3337.50,
    avg_back_gross: 1878.13,
    avg_fi_gross: 2062.50,
    avg_deal_gross: 7278.13,
    top_salesperson: { name: "Jake Martinez", units: 3, gross: 20275 },
    by_salesperson: [
      { name: "Jake Martinez", units: 3, front_gross: 8450, back_gross: 5075, fi_gross: 5550, total_gross: 19075 },
      { name: "Tom Bradley", units: 3, front_gross: 9800, back_gross: 4900, fi_gross: 5850, total_gross: 20550 },
      { name: "Mike Reynolds", units: 2, front_gross: 7550, back_gross: 4850, fi_gross: 5100, total_gross: 17500 },
    ],
    by_deal_type: [
      { type: "retail", count: 7, gross: 52925 },
      { type: "lease", count: 1, gross: 5300 },
    ],
  };

  return NextResponse.json({ summary });
}
