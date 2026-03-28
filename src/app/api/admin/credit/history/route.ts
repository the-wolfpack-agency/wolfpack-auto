import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/* -------------------------------------------------------------------------- */
/* GET /api/admin/credit/history                                              */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("lead_id");

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      let sql = `SELECT * FROM credit_pulls WHERE dealer_id = $1`;
      const params: unknown[] = [authResult.user.dealer_id];

      if (leadId) {
        sql += ` AND lead_id = $2`;
        params.push(leadId);
      }

      sql += ` ORDER BY pulled_at DESC LIMIT 100`;

      const result = await query(sql, params);
      return NextResponse.json({ pulls: result.rows });
    } catch (err) {
      console.error("[api/admin/credit/history] DB error:", err);
    }
  }

  // Shadow mock with 4 sample pulls
  const mockPulls = [
    {
      id: "cp-mock-001",
      dealer_id: authResult.user.dealer_id,
      lead_id: "lead-101",
      applicant_name: "James Rodriguez",
      bureau: "tri_merge",
      pull_type: "hard",
      score: 742,
      score_factors: ["Length of credit history", "Payment history", "Credit utilization ratio"],
      pulled_at: "2026-03-27T09:15:00Z",
      pulled_by: "Sarah Mitchell",
      consent_obtained: true,
    },
    {
      id: "cp-mock-002",
      dealer_id: authResult.user.dealer_id,
      lead_id: "lead-088",
      applicant_name: "Emily Chen",
      bureau: "equifax",
      pull_type: "soft",
      score: 798,
      score_factors: ["Excellent payment history", "Low utilization", "Long credit history"],
      pulled_at: "2026-03-26T14:20:00Z",
      pulled_by: "Mark Johnson",
      consent_obtained: true,
    },
    {
      id: "cp-mock-003",
      dealer_id: authResult.user.dealer_id,
      lead_id: "lead-095",
      applicant_name: "David Washington",
      bureau: "experian",
      pull_type: "hard",
      score: 668,
      score_factors: ["Recent inquiries", "High utilization", "Short credit history", "Mix of credit types"],
      pulled_at: "2026-03-26T11:05:00Z",
      pulled_by: "Sarah Mitchell",
      consent_obtained: true,
    },
    {
      id: "cp-mock-004",
      dealer_id: authResult.user.dealer_id,
      lead_id: "lead-102",
      applicant_name: "Maria Gonzalez",
      bureau: "transunion",
      pull_type: "soft",
      score: 715,
      score_factors: ["Payment history", "Number of recent inquiries", "Total outstanding debt"],
      pulled_at: "2026-03-25T16:45:00Z",
      pulled_by: "Mark Johnson",
      consent_obtained: true,
    },
  ];

  const filtered = leadId ? mockPulls.filter((p) => p.lead_id === leadId) : mockPulls;

  return NextResponse.json({ pulls: filtered });
}
