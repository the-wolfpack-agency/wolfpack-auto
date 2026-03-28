import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackCredit, trackSecurity } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Shadow mock: simulated credit report                                       */
/* -------------------------------------------------------------------------- */

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateMockReport(applicantName: string, bureau: string) {
  const score = randomInt(650, 820);

  const allFactors = [
    "Length of credit history",
    "Payment history",
    "Credit utilization ratio",
    "Number of recent inquiries",
    "Mix of credit types",
    "Total outstanding debt",
    "Derogatory marks",
    "Average age of accounts",
  ];
  // Pick 3-5 factors
  const shuffled = allFactors.sort(() => Math.random() - 0.5);
  const factors = shuffled.slice(0, randomInt(3, 5));

  const tradeLines = [
    {
      creditor: "Chase Bank",
      type: "credit_card",
      balance: randomInt(200, 8500),
      limit: randomInt(10000, 25000),
      opened: "2019-06-15",
      status: "current",
      payment_history: "No late payments",
    },
    {
      creditor: "Capital One",
      type: "auto_loan",
      balance: randomInt(5000, 22000),
      limit: randomInt(25000, 40000),
      opened: "2022-03-10",
      status: "current",
      payment_history: "No late payments",
    },
    {
      creditor: "Discover",
      type: "credit_card",
      balance: randomInt(0, 3000),
      limit: randomInt(5000, 15000),
      opened: "2020-11-22",
      status: "current",
      payment_history: "1 late payment (30 days)",
    },
    {
      creditor: "US Bank",
      type: "mortgage",
      balance: randomInt(150000, 350000),
      limit: randomInt(200000, 400000),
      opened: "2018-01-08",
      status: "current",
      payment_history: "No late payments",
    },
    {
      creditor: "Sallie Mae",
      type: "student_loan",
      balance: randomInt(8000, 45000),
      limit: randomInt(30000, 60000),
      opened: "2016-09-01",
      status: "current",
      payment_history: "No late payments",
    },
  ];

  // Pick 3-5 trade lines
  const selectedTrades = tradeLines
    .sort(() => Math.random() - 0.5)
    .slice(0, randomInt(3, 5));

  return {
    applicant_name: applicantName,
    bureau,
    score,
    factors,
    trade_lines: selectedTrades,
    inquiries: {
      last_6_months: randomInt(0, 3),
      last_12_months: randomInt(1, 6),
      details: [
        { creditor: "Ford Motor Credit", date: "2026-02-15", type: "auto" },
        { creditor: "Chase Bank", date: "2026-01-20", type: "credit_card" },
      ].slice(0, randomInt(1, 2)),
    },
    collections: randomInt(0, 1) === 1
      ? [{ creditor: "Medical Associates", amount: randomInt(200, 1500), date: "2024-06-10", status: "paid" }]
      : [],
    public_records: [],
    total_debt: selectedTrades.reduce((sum, t) => sum + t.balance, 0),
    total_available_credit: selectedTrades
      .filter((t) => t.type === "credit_card")
      .reduce((sum, t) => sum + (t.limit - t.balance), 0),
  };
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/credit/pull                                                */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const rl = await checkRateLimit(`credit-pull:${authResult.user.dealer_id}`, 5, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", authResult.user.dealer_id, { route: "credit-pull", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { lead_id, applicant_name, bureau, pull_type, consent_obtained } = body as {
    lead_id?: string;
    applicant_name?: string;
    bureau?: string;
    pull_type?: string;
    consent_obtained?: boolean;
  };

  if (!applicant_name || typeof applicant_name !== "string" || applicant_name.trim().length === 0) {
    return NextResponse.json({ error: "applicant_name is required" }, { status: 422 });
  }

  const validBureaus = ["equifax", "experian", "transunion", "tri_merge"];
  if (!bureau || !validBureaus.includes(bureau)) {
    return NextResponse.json({ error: `bureau must be one of: ${validBureaus.join(", ")}` }, { status: 422 });
  }

  const validPullTypes = ["soft", "hard"];
  if (!pull_type || !validPullTypes.includes(pull_type)) {
    return NextResponse.json({ error: `pull_type must be one of: ${validPullTypes.join(", ")}` }, { status: 422 });
  }

  if (!consent_obtained) {
    return NextResponse.json(
      { error: "Applicant consent is required before pulling credit. Set consent_obtained: true." },
      { status: 422 },
    );
  }

  const dealerId = authResult.user.dealer_id;
  const id = `cp-${Date.now().toString(36)}`;
  const report = generateMockReport(applicant_name.trim(), bureau);

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      // In production with CREDIT_BUREAU_API_KEY, call real bureau here
      // For now, use mock report
      const result = await query(
        `INSERT INTO credit_pulls (id, dealer_id, lead_id, applicant_name, bureau, pull_type, score, score_factors, report_data, pulled_by, consent_obtained, consent_timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW())
         RETURNING *`,
        [
          id, dealerId, lead_id ?? null, applicant_name.trim(), bureau, pull_type,
          report.score, report.factors, JSON.stringify(report),
          authResult.user.name,
        ],
      );

      try { trackCredit("credit.pulled", dealerId, { bureau, pull_type, score: report.score }); } catch {}

      return NextResponse.json({ credit_pull: result.rows[0], report }, { status: 201 });
    } catch (err) {
      console.error("[api/admin/credit/pull] DB error:", err);
    }
  }

  // Shadow mode
  const pullRecord = {
    id,
    dealer_id: dealerId,
    lead_id: lead_id ?? null,
    applicant_name: applicant_name.trim(),
    bureau,
    pull_type,
    score: report.score,
    score_factors: report.factors,
    pulled_at: new Date().toISOString(),
    pulled_by: authResult.user.name,
    consent_obtained: true,
    consent_timestamp: new Date().toISOString(),
  };

  try { trackCredit("credit.pulled", dealerId, { bureau, pull_type, score: report.score }); } catch {}

  return NextResponse.json({ credit_pull: pullRecord, report }, { status: 201 });
}
