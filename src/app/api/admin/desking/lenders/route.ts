/**
 * GET  /api/admin/desking/lenders — List lender programs
 * POST /api/admin/desking/lenders — Match lenders for a deal
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackDesking } from "@/lib/analytics-hooks";
import { matchLenderPrograms, type LenderProgram } from "@/lib/fi-desking";

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let programs: Record<string, unknown>[] = [];
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const { rows } = await query(
        `SELECT * FROM lender_programs WHERE dealer_id = $1 AND is_active = true
         ORDER BY lender_name ASC`,
        [dealerId],
      );
      programs = rows;
    } catch (err) {
      console.error("[api/desking/lenders] GET error:", err);
    }
  }

  return NextResponse.json({ programs, count: programs.length });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let body: { credit_score?: number; amount?: number; term?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { credit_score, amount, term } = body;
  if (!credit_score || !amount || !term) {
    return NextResponse.json(
      { error: "credit_score, amount, and term are required" },
      { status: 400 },
    );
  }

  // Load lender programs from DB
  let programs: LenderProgram[] = [];
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const { rows } = await query(
        `SELECT lender_name, program_name, rate_tiers, max_advance, max_term,
                reserve_markup, COALESCE(flat_fee, 0) as flat_fee
         FROM lender_programs WHERE dealer_id = $1 AND is_active = true`,
        [dealerId],
      );
      programs = rows.map((r: Record<string, unknown>) => ({
        lender_name: r.lender_name as string,
        program_name: r.program_name as string,
        rate_tiers: (r.rate_tiers as LenderProgram["rate_tiers"]) ?? [],
        max_advance: Number(r.max_advance) || 120,
        max_term: Number(r.max_term) || 84,
        reserve_markup: Number(r.reserve_markup) || 0,
        flat_fee: Number(r.flat_fee) || 0,
      }));
    } catch (err) {
      console.error("[api/desking/lenders] DB error:", err);
    }
  }

  const matches = matchLenderPrograms(programs, credit_score, amount, term);

  trackDesking("desking.lender_matched", dealerId, {
    credit_score,
    amount,
    term,
    matches_found: matches.length,
  });

  return NextResponse.json({ matches, count: matches.length });
}
