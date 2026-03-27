import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/* -------------------------------------------------------------------------- */
/* GET /api/admin/trade-in                                                    */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  // Auth guard — must come first
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) {
    return authResult; // 401
  }

  // Parse query params
  const { searchParams } = new URL(request.url);
  const capturedOnly = searchParams.get("captured_only") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("page_size") ?? "25", 10)),
  );
  const offset = (page - 1) * pageSize;

  if (!process.env.DATABASE_URL) {
    // Shadow mode — return empty dataset
    return NextResponse.json(
      { estimates: [], total: 0, page, page_size: pageSize },
      { status: 200 },
    );
  }

  try {
    const { query } = await import("@/lib/db");

    const whereClause = capturedOnly ? "WHERE lead_captured = true" : "";

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM trade_in_estimates ${whereClause}`,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const estimatesResult = await query<Record<string, unknown>>(
      `SELECT
         id, dealer_id, year, make, model, trim, mileage,
         condition, accident_history, title_status, previous_owners,
         estimated_low, estimated_high, estimated_mid, valuation_factors,
         first_name, last_name, email, phone, lead_captured,
         ip_address, user_agent, converted_to_lead_id, created_at
       FROM trade_in_estimates
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );

    return NextResponse.json(
      {
        estimates: estimatesResult.rows,
        total,
        page,
        page_size: pageSize,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[api/admin/trade-in] Query failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch trade-in estimates" },
      { status: 500 },
    );
  }
}
