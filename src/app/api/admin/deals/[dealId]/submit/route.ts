import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackLender } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Shadow mock helpers                                                        */
/* -------------------------------------------------------------------------- */

const MOCK_LENDER_NAMES: Record<string, string> = {
  "lndr-001": "Chase Auto Finance",
  "lndr-002": "Capital One Auto Finance",
  "lndr-003": "Ally Financial",
  "lndr-004": "Wells Fargo Dealer Services",
  "lndr-005": "Credit Union Direct Lending",
  "lndr-006": "Southeast Toyota Finance",
};

function randomStatus(): "approved" | "conditioned" | "declined" | "counter" {
  const statuses: Array<"approved" | "conditioned" | "declined" | "counter"> = [
    "approved", "approved", "conditioned", "conditioned", "declined", "counter",
  ];
  return statuses[Math.floor(Math.random() * statuses.length)];
}

function mockLenderResponse(status: string, dealData: Record<string, unknown>) {
  const amount = (dealData.amount as number) ?? 28500;
  if (status === "approved") {
    return {
      approved_amount: amount,
      approved_rate: 4.49 + Math.random() * 3,
      approved_term: 72,
      stipulations: [],
      decision_message: "Approved as submitted.",
    };
  }
  if (status === "conditioned") {
    return {
      approved_amount: amount * 0.95,
      approved_rate: 5.99 + Math.random() * 2,
      approved_term: 66,
      stipulations: ["Proof of income (2 recent pay stubs)", "Proof of residence"],
      decision_message: "Approved with conditions. See stipulations.",
    };
  }
  if (status === "counter") {
    return {
      counter_amount: amount * 0.9,
      counter_rate: 7.49 + Math.random() * 2,
      counter_term: 60,
      stipulations: ["Increased down payment required ($2,000 minimum)"],
      decision_message: "Counter offer. Reduced amount and adjusted terms.",
    };
  }
  // declined
  return {
    decision_message: "Unable to approve at this time. Recommend alternate lender.",
    decline_reasons: ["LTV exceeds guidelines", "Insufficient credit depth"],
  };
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/deals/[dealId]/submit                                      */
/* -------------------------------------------------------------------------- */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { dealId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { lender_ids, deal_data } = body as {
    lender_ids?: string[];
    deal_data?: Record<string, unknown>;
  };

  if (!lender_ids || !Array.isArray(lender_ids) || lender_ids.length === 0) {
    return NextResponse.json({ error: "lender_ids array is required" }, { status: 422 });
  }

  const dealerId = authResult.user.dealer_id;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const submissions = [];

      for (const lenderId of lender_ids) {
        const subId = `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const result = await query(
          `INSERT INTO deal_submissions (id, dealer_id, deal_id, lender_id, portal, submission_data, status, submitted_at)
           VALUES ($1, $2, $3, $4,
                   (SELECT portal FROM lender_profiles WHERE id = $4),
                   $5, 'submitted', NOW())
           RETURNING *`,
          [subId, dealerId, dealId, lenderId, JSON.stringify(deal_data ?? {})],
        );
        submissions.push(result.rows[0]);
      }

      try {
        trackLender("deal.lender_submitted", dealerId, {
          deal_id: dealId,
          lender_count: lender_ids.length,
        });
      } catch {}

      return NextResponse.json({ submissions, deal_id: dealId }, { status: 201 });
    } catch (err) {
      console.error("[api/admin/deals/submit] DB error:", err);
    }
  }

  // Shadow mode: simulate immediate lender responses
  const submissions = lender_ids.map((lenderId) => {
    const status = randomStatus();
    const subId = `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    return {
      id: subId,
      dealer_id: dealerId,
      deal_id: dealId,
      lender_id: lenderId,
      lender_name: MOCK_LENDER_NAMES[lenderId] ?? `Lender ${lenderId}`,
      portal: "routeone",
      status,
      submission_data: deal_data ?? {},
      response_data: mockLenderResponse(status, deal_data ?? {}),
      submitted_at: new Date().toISOString(),
      responded_at: new Date().toISOString(),
      stipulations: status === "conditioned" ? ["Proof of income", "Proof of residence"] : [],
      funded_amount: null,
      funded_rate: null,
      created_at: new Date().toISOString(),
    };
  });

  try {
    trackLender("deal.lender_submitted", dealerId, {
      deal_id: dealId,
      lender_count: lender_ids.length,
    });
  } catch {}

  return NextResponse.json({ submissions, deal_id: dealId }, { status: 201 });
}
