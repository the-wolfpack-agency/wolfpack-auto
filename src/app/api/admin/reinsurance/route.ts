/**
 * GET  /api/admin/reinsurance — Reinsurance programs, performance summary, and P&L
 * POST /api/admin/reinsurance — Create or update a reinsurance program configuration
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackReinsurance } from "@/lib/analytics-hooks";
import {
  calculateProgramROI,
  type ReinsuranceProgram,
  type ProgramPerformance,
  type ProductBreakdown,
  type RiskAssessment,
} from "@/lib/reinsurance";

/* -------------------------------------------------------------------------- */
/* Demo data — returned when DATABASE_URL is not set (shadow mode)            */
/* -------------------------------------------------------------------------- */

function getDemoData(dealerId: string) {
  const programs: ReinsuranceProgram[] = [
    {
      id: "reinsprog-001",
      dealer_id: dealerId,
      name: "Dealer CFC Program",
      type: "CFC",
      status: "active",
      inception_date: "2024-01-15",
      cession_rate: 0.75,
      admin_fee_rate: 0.03,
      total_premiums: 485000,
      total_claims: 142000,
      total_admin_costs: 14550,
      retained_reserves: 328450,
      created_at: "2024-01-15T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    },
    {
      id: "reinsprog-002",
      dealer_id: dealerId,
      name: "Dealer DOWC Program",
      type: "DOWC",
      status: "active",
      inception_date: "2025-03-01",
      cession_rate: 0.85,
      admin_fee_rate: 0.025,
      total_premiums: 218000,
      total_claims: 54000,
      total_admin_costs: 5450,
      retained_reserves: 158550,
      created_at: "2025-03-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    },
  ];

  const productBreakdown: ProductBreakdown[] = [
    { category: "VSC", premiums_earned: 285000, claims_paid: 98000, loss_ratio: 0.3439, policies_sold: 342, claims_filed: 47 },
    { category: "GAP", premiums_earned: 125000, claims_paid: 38000, loss_ratio: 0.304, policies_sold: 289, claims_filed: 22 },
    { category: "maintenance", premiums_earned: 92000, claims_paid: 31000, loss_ratio: 0.3370, policies_sold: 198, claims_filed: 64 },
    { category: "tire_wheel", premiums_earned: 68000, claims_paid: 18000, loss_ratio: 0.2647, policies_sold: 176, claims_filed: 31 },
  ];

  const riskAssessment: RiskAssessment = {
    overall_risk: "low",
    claim_frequency: 8.12,
    claim_severity: 1195.12,
    frequency_trend: "stable",
    severity_trend: "stable",
    exposure_amount: 412000,
    reserve_adequacy: 1.18,
  };

  const performance: ProgramPerformance = {
    program_id: "reinsprog-001",
    dealer_id: dealerId,
    period_start: "2025-04-01",
    period_end: "2026-04-01",
    total_premiums_earned: 485000,
    total_claims_paid: 142000,
    loss_ratio: 0.2928,
    retained_reserves: 328450,
    admin_costs: 14550,
    net_profit: 328450,
    roi_pct: 67.72,
    product_breakdown: productBreakdown,
    risk_assessment: riskAssessment,
  };

  return { programs, performance, summary: { total_programs: programs.length, active_programs: 2 } };
}

/* -------------------------------------------------------------------------- */
/* GET                                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  // Shadow mode — return demo data when no database is configured
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(getDemoData(dealerId));
  }

  try {
    const { query } = await import("@/lib/db");

    const { rows: programs } = await query(
      `SELECT * FROM reinsurance_programs WHERE dealer_id = $1 ORDER BY inception_date DESC`,
      [dealerId],
    );

    // Calculate ROI for each program
    const enrichedPrograms = programs.map((p: ReinsuranceProgram) => ({
      ...p,
      roi_pct: calculateProgramROI(p),
    }));

    // Aggregate performance
    const totalPremiums = programs.reduce((s: number, p: ReinsuranceProgram) => s + (p.total_premiums || 0), 0);
    const totalClaims = programs.reduce((s: number, p: ReinsuranceProgram) => s + (p.total_claims || 0), 0);
    const totalAdmin = programs.reduce((s: number, p: ReinsuranceProgram) => s + (p.total_admin_costs || 0), 0);

    // Product breakdown from claims/policies tables
    const { rows: breakdown } = await query(
      `SELECT
         rp.product_category AS category,
         SUM(rp.ceded_premium) AS premiums_earned,
         COALESCE(SUM(rc.paid_amount), 0) AS claims_paid,
         COUNT(DISTINCT rp.id) AS policies_sold,
         COUNT(DISTINCT rc.id) AS claims_filed
       FROM reinsurance_policies rp
       LEFT JOIN reinsurance_claims rc ON rc.policy_id = rp.id AND rc.status = 'paid'
       WHERE rp.program_id IN (SELECT id FROM reinsurance_programs WHERE dealer_id = $1)
       GROUP BY rp.product_category`,
      [dealerId],
    );

    const productBreakdown = breakdown.map((b: Record<string, number | string>) => ({
      ...b,
      loss_ratio: Number(b.premiums_earned) > 0 ? Number(b.claims_paid) / Number(b.premiums_earned) : 0,
    }));

    const performance: ProgramPerformance = {
      program_id: programs[0]?.id ?? "",
      dealer_id: dealerId,
      period_start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      period_end: new Date().toISOString().split("T")[0],
      total_premiums_earned: totalPremiums,
      total_claims_paid: totalClaims,
      loss_ratio: totalPremiums > 0 ? totalClaims / totalPremiums : 0,
      retained_reserves: totalPremiums - totalClaims - totalAdmin,
      admin_costs: totalAdmin,
      net_profit: totalPremiums - totalClaims - totalAdmin,
      roi_pct: totalPremiums > 0 ? ((totalPremiums - totalClaims - totalAdmin) / totalPremiums) * 100 : 0,
      product_breakdown: productBreakdown as ProductBreakdown[],
      risk_assessment: {
        overall_risk: "low",
        claim_frequency: 0,
        claim_severity: 0,
        frequency_trend: "stable",
        severity_trend: "stable",
        exposure_amount: 0,
        reserve_adequacy: 1.0,
      },
    };

    return NextResponse.json({
      programs: enrichedPrograms,
      performance,
      summary: {
        total_programs: programs.length,
        active_programs: programs.filter((p: ReinsuranceProgram) => p.status === "active").length,
      },
    });
  } catch (err) {
    console.error("[api/reinsurance] GET error:", err);
    return NextResponse.json({ error: "Failed to load reinsurance data" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/* POST                                                                       */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let body: {
    action?: "create" | "update";
    program?: Partial<ReinsuranceProgram>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action ?? "create";
  const program = body.program;

  if (!program || !program.name || !program.type) {
    return NextResponse.json(
      { error: "program with name and type is required" },
      { status: 400 },
    );
  }

  // Shadow mode — return demo response
  if (!process.env.DATABASE_URL) {
    const demoProgram: ReinsuranceProgram = {
      id: `reinsprog-${Date.now()}`,
      dealer_id: dealerId,
      name: program.name,
      type: program.type as ReinsuranceProgram["type"],
      status: program.status ?? "pending",
      inception_date: program.inception_date ?? new Date().toISOString().split("T")[0],
      cession_rate: program.cession_rate ?? 0.75,
      admin_fee_rate: program.admin_fee_rate ?? 0.03,
      total_premiums: 0,
      total_claims: 0,
      total_admin_costs: 0,
      retained_reserves: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    trackReinsurance(
      action === "create" ? "reinsurance.program_created" : "reinsurance.program_updated",
      dealerId,
      { program_id: demoProgram.id, program_type: demoProgram.type, program_name: demoProgram.name },
    );

    return NextResponse.json({ program: demoProgram, action });
  }

  try {
    const { query } = await import("@/lib/db");

    if (action === "update" && program.id) {
      const { rows } = await query(
        `UPDATE reinsurance_programs
         SET name = COALESCE($1, name),
             type = COALESCE($2, type),
             status = COALESCE($3, status),
             cession_rate = COALESCE($4, cession_rate),
             admin_fee_rate = COALESCE($5, admin_fee_rate),
             updated_at = NOW()
         WHERE id = $6 AND dealer_id = $7
         RETURNING *`,
        [program.name, program.type, program.status, program.cession_rate, program.admin_fee_rate, program.id, dealerId],
      );

      if (rows.length === 0) {
        return NextResponse.json({ error: "Program not found" }, { status: 404 });
      }

      trackReinsurance("reinsurance.program_updated", dealerId, {
        program_id: rows[0].id,
        program_type: rows[0].type,
        program_name: rows[0].name,
      });

      return NextResponse.json({ program: rows[0], action: "update" });
    }

    // Create new program
    const { rows } = await query(
      `INSERT INTO reinsurance_programs
         (dealer_id, name, type, status, inception_date, cession_rate, admin_fee_rate,
          total_premiums, total_claims, total_admin_costs, retained_reserves)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, 0, 0)
       RETURNING *`,
      [
        dealerId,
        program.name,
        program.type,
        program.status ?? "pending",
        program.inception_date ?? new Date().toISOString().split("T")[0],
        program.cession_rate ?? 0.75,
        program.admin_fee_rate ?? 0.03,
      ],
    );

    trackReinsurance("reinsurance.program_created", dealerId, {
      program_id: rows[0].id,
      program_type: rows[0].type,
      program_name: rows[0].name,
    });

    return NextResponse.json({ program: rows[0], action: "create" }, { status: 201 });
  } catch (err) {
    console.error("[api/reinsurance] POST error:", err);
    return NextResponse.json({ error: "Failed to save reinsurance program" }, { status: 500 });
  }
}
