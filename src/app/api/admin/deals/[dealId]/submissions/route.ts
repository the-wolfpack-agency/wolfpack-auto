import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackDesking } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* GET /api/admin/deals/[dealId]/submissions                                  */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { dealId } = await params;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT ds.*, lp.lender_name, lp.portal AS lender_portal
           FROM deal_submissions ds
           LEFT JOIN lender_profiles lp ON lp.id = ds.lender_id
          WHERE ds.deal_id = $1 AND ds.dealer_id = $2
          ORDER BY ds.created_at DESC`,
        [dealId, authResult.user.dealer_id],
      );
      trackDesking("desking.lender_submitted", authResult.user.dealer_id, { deal_id: dealId, count: (result.rows as unknown[]).length });
      return NextResponse.json({ submissions: result.rows, deal_id: dealId });
    } catch (err) {
      console.error("[api/admin/deals/submissions] DB error:", err);
    }
  }

  // Shadow mock
  const mockSubmissions = [
    {
      id: "sub-mock-001",
      deal_id: dealId,
      dealer_id: authResult.user.dealer_id,
      lender_id: "lndr-001",
      lender_name: "Chase Auto Finance",
      lender_portal: "routeone",
      status: "approved",
      response_data: {
        approved_amount: 32500,
        approved_rate: 4.89,
        approved_term: 72,
        stipulations: [],
        decision_message: "Approved as submitted.",
      },
      submitted_at: "2026-03-25T14:30:00Z",
      responded_at: "2026-03-25T14:31:00Z",
      stipulations: [],
      funded_amount: null,
      funded_rate: null,
    },
    {
      id: "sub-mock-002",
      deal_id: dealId,
      dealer_id: authResult.user.dealer_id,
      lender_id: "lndr-003",
      lender_name: "Ally Financial",
      lender_portal: "routeone",
      status: "conditioned",
      response_data: {
        approved_amount: 31200,
        approved_rate: 5.99,
        approved_term: 66,
        stipulations: ["Proof of income (2 recent pay stubs)", "Proof of residence"],
        decision_message: "Approved with conditions.",
      },
      submitted_at: "2026-03-25T14:30:00Z",
      responded_at: "2026-03-25T14:32:00Z",
      stipulations: ["Proof of income (2 recent pay stubs)", "Proof of residence"],
      funded_amount: null,
      funded_rate: null,
    },
    {
      id: "sub-mock-003",
      deal_id: dealId,
      dealer_id: authResult.user.dealer_id,
      lender_id: "lndr-005",
      lender_name: "Credit Union Direct Lending",
      lender_portal: "cudl",
      status: "declined",
      response_data: {
        decision_message: "Unable to approve. LTV exceeds guidelines.",
        decline_reasons: ["LTV exceeds guidelines"],
      },
      submitted_at: "2026-03-25T14:30:00Z",
      responded_at: "2026-03-25T14:33:00Z",
      stipulations: [],
      funded_amount: null,
      funded_rate: null,
    },
  ];

  trackDesking("desking.lender_submitted", authResult.user.dealer_id, { deal_id: dealId, count: mockSubmissions.length, shadow: true });

  return NextResponse.json({ submissions: mockSubmissions, deal_id: dealId });
}
