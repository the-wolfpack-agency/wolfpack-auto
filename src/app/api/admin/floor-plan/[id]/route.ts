import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackAccounting } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/floor-plan/[id] — update / curtail / pay off              */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;

  let body: {
    status?: "active" | "curtailed" | "paid_off" | "repossessed";
    interest_accrued?: number;
    fees?: number;
    notes?: string;
    payoff_date?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Analytics for payoffs (fire-and-forget)
  if (body.status === "paid_off") {
    try {
      trackAccounting("accounting.floor_plan_payoff", authResult.user.dealer_id, {
        floor_plan_id: id,
      });
    } catch { /* swallow */ }
  }

  // Database path
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const setClauses: string[] = ["updated_at = NOW()"];
      const queryParams: unknown[] = [];
      let idx = 1;

      if (body.status !== undefined) {
        setClauses.push(`status = $${idx++}`);
        queryParams.push(body.status);
      }
      if (body.interest_accrued !== undefined) {
        setClauses.push(`interest_accrued = $${idx++}`);
        queryParams.push(body.interest_accrued);
      }
      if (body.fees !== undefined) {
        setClauses.push(`fees = $${idx++}`);
        queryParams.push(body.fees);
      }
      if (body.notes !== undefined) {
        setClauses.push(`notes = $${idx++}`);
        queryParams.push(body.notes);
      }
      if (body.payoff_date !== undefined || body.status === "paid_off") {
        setClauses.push(`payoff_date = $${idx++}`);
        queryParams.push(body.payoff_date ?? new Date().toISOString().slice(0, 10));
      }

      const result = await query(
        `UPDATE floor_plan_lines SET ${setClauses.join(", ")}
         WHERE id = $${idx} AND dealer_id = $${idx + 1} RETURNING *`,
        [...queryParams, id, authResult.user.dealer_id],
      );

      if ((result.rows as any[]).length === 0) {
        return NextResponse.json({ error: "Floor plan line not found" }, { status: 404 });
      }
      return NextResponse.json({ line: result.rows[0] });
    } catch (err) {
      console.error("[api/admin/floor-plan/[id]] DB error:", err);
      // Fall through to mock
    }
  }

  // Shadow mode response
  return NextResponse.json({
    line: {
      id,
      ...body,
      payoff_date: body.status === "paid_off" ? (body.payoff_date ?? new Date().toISOString().slice(0, 10)) : undefined,
      updated_at: new Date().toISOString(),
      updated: true,
    },
  });
}
