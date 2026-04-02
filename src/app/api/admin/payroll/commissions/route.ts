/**
 * GET  /api/admin/payroll/commissions — List commission entries
 * POST /api/admin/payroll/commissions — Calculate commission for a deal
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackPayroll } from "@/lib/analytics-hooks";
import { calculateDealCommission, type CommissionPlan } from "@/lib/payroll-integration";

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const { searchParams } = request.nextUrl;
  const employeeId = searchParams.get("employee_id");
  const status = searchParams.get("status");

  let commissions: Record<string, unknown>[] = [];

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      let sql = `SELECT ce.*, er.first_name, er.last_name, er.department
         FROM commission_entries ce
         JOIN employee_records er ON er.id = ce.employee_id
         WHERE ce.dealer_id = $1`;
      const params: unknown[] = [dealerId];

      if (employeeId) {
        params.push(employeeId);
        sql += ` AND ce.employee_id = $${params.length}::uuid`;
      }
      if (status) {
        params.push(status);
        sql += ` AND ce.status = $${params.length}`;
      }

      sql += " ORDER BY ce.created_at DESC LIMIT 100";

      const { rows } = await query(sql, params);
      commissions = rows;
    } catch (err) {
      console.error("[api/payroll/commissions] GET error:", err);
    }
  }

  return NextResponse.json({ commissions, count: commissions.length });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let body: {
    employee_id?: string;
    gross_profit?: number;
    source_type?: string;
    source_id?: string;
    plan?: Partial<CommissionPlan>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.employee_id || body.gross_profit === undefined) {
    return NextResponse.json(
      { error: "employee_id and gross_profit are required" },
      { status: 400 },
    );
  }

  const plan: CommissionPlan = {
    name: body.plan?.name ?? "Standard",
    type: body.plan?.type ?? "flat_pct",
    flat_rate: body.plan?.flat_rate ?? 25,
    tiers: body.plan?.tiers,
    minimum_per_deal: body.plan?.minimum_per_deal ?? 200,
  };

  const commission = calculateDealCommission(body.gross_profit, plan);

  // Save to DB
  let entryId: string | null = null;
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const { rows } = await query(
        `INSERT INTO commission_entries
           (dealer_id, employee_id, source_type, source_id,
            gross_profit, commission_pct, commission_amount, status)
         VALUES ($1, $2::uuid, $3, $4::uuid, $5, $6, $7, 'pending')
         RETURNING id`,
        [
          dealerId, body.employee_id, body.source_type ?? "deal",
          body.source_id ?? null, body.gross_profit, plan.flat_rate ?? 0,
          commission,
        ],
      );
      entryId = rows[0]?.id;
    } catch (err) {
      console.error("[api/payroll/commissions] POST error:", err);
    }
  }

  trackPayroll("payroll.commission_calculated", dealerId, {
    employee_id: body.employee_id,
    gross_profit: body.gross_profit,
    commission_amount: commission,
    plan_type: plan.type,
  });

  return NextResponse.json({
    id: entryId,
    employee_id: body.employee_id,
    gross_profit: body.gross_profit,
    commission_plan: plan.name,
    commission_pct: plan.flat_rate ?? 0,
    commission_amount: commission,
    status: "pending",
  });
}
