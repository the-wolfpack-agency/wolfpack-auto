import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackLender } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* GET /api/admin/lenders/[id]                                                */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT * FROM lender_profiles WHERE id = $1 AND dealer_id = $2`,
        [id, authResult.user.dealer_id],
      );
      if ((result.rows as unknown[]).length === 0) {
        return NextResponse.json({ error: "Lender not found" }, { status: 404 });
      }
      return NextResponse.json({ lender: result.rows[0] });
    } catch (err) {
      console.error("[api/admin/lenders/[id]] DB error:", err);
    }
  }

  // Shadow mock: return a sample lender
  return NextResponse.json({
    lender: {
      id,
      dealer_id: authResult.user.dealer_id,
      lender_name: "Chase Auto Finance",
      lender_code: "CHASE-4821",
      portal: "routeone",
      contact_email: "dealer.support@chase.com",
      contact_phone: "(800) 336-6675",
      rate_sheet: {
        tiers: [
          { min_score: 740, max_score: 850, rate: 4.49, max_term: 84 },
          { min_score: 700, max_score: 739, rate: 5.99, max_term: 75 },
          { min_score: 660, max_score: 699, rate: 7.49, max_term: 72 },
        ],
      },
      buy_rates: { spread: 2.0, max_markup: 2.5 },
      active: true,
      created_at: "2025-08-15T10:00:00Z",
    },
  });
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/lenders/[id]                                              */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dealerId = authResult.user.dealer_id;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const setClauses: string[] = ["updated_at = NOW()"];
      const queryParams: unknown[] = [];
      let idx = 1;

      const allowedFields = ["lender_name", "lender_code", "portal", "contact_email", "contact_phone", "active"];
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          setClauses.push(`${field} = $${idx++}`);
          queryParams.push(body[field]);
        }
      }
      // JSONB fields
      if (body.rate_sheet !== undefined) {
        setClauses.push(`rate_sheet = $${idx++}`);
        queryParams.push(JSON.stringify(body.rate_sheet));
      }
      if (body.buy_rates !== undefined) {
        setClauses.push(`buy_rates = $${idx++}`);
        queryParams.push(JSON.stringify(body.buy_rates));
      }

      const result = await query(
        `UPDATE lender_profiles SET ${setClauses.join(", ")} WHERE id = $${idx} AND dealer_id = $${idx + 1} RETURNING *`,
        [...queryParams, id, dealerId],
      );

      if ((result.rows as unknown[]).length === 0) {
        return NextResponse.json({ error: "Lender not found" }, { status: 404 });
      }

      try { trackLender("lender.updated", dealerId, { lender_id: id }); } catch {}

      return NextResponse.json({ lender: result.rows[0], updated: true });
    } catch (err) {
      console.error("[api/admin/lenders/[id]] DB update error:", err);
    }
  }

  // Shadow mode
  try { trackLender("lender.updated", dealerId, { lender_id: id }); } catch {}

  return NextResponse.json({
    lender: { id, ...body, dealer_id: dealerId, updated_at: new Date().toISOString() },
    updated: true,
  });
}
