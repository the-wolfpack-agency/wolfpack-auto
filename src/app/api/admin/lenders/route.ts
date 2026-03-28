import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackLender, trackSecurity } from "@/lib/analytics-hooks";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_LENDERS = [
  {
    id: "lndr-001",
    dealer_id: DEALER_ID,
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
        { min_score: 620, max_score: 659, rate: 9.99, max_term: 66 },
      ],
    },
    buy_rates: { spread: 2.0, max_markup: 2.5 },
    active: true,
    created_at: "2025-08-15T10:00:00Z",
  },
  {
    id: "lndr-002",
    dealer_id: DEALER_ID,
    lender_name: "Capital One Auto Finance",
    lender_code: "CAPONE-9912",
    portal: "dealertrack",
    contact_email: "dealer.relations@capitalone.com",
    contact_phone: "(800) 946-0332",
    rate_sheet: {
      tiers: [
        { min_score: 750, max_score: 850, rate: 4.29, max_term: 84 },
        { min_score: 700, max_score: 749, rate: 5.79, max_term: 75 },
        { min_score: 640, max_score: 699, rate: 7.99, max_term: 72 },
        { min_score: 580, max_score: 639, rate: 11.49, max_term: 60 },
      ],
    },
    buy_rates: { spread: 1.75, max_markup: 2.0 },
    active: true,
    created_at: "2025-09-02T14:30:00Z",
  },
  {
    id: "lndr-003",
    dealer_id: DEALER_ID,
    lender_name: "Ally Financial",
    lender_code: "ALLY-3301",
    portal: "routeone",
    contact_email: "dealer.services@ally.com",
    contact_phone: "(888) 925-2559",
    rate_sheet: {
      tiers: [
        { min_score: 720, max_score: 850, rate: 4.99, max_term: 84 },
        { min_score: 680, max_score: 719, rate: 6.49, max_term: 72 },
        { min_score: 620, max_score: 679, rate: 8.99, max_term: 66 },
      ],
    },
    buy_rates: { spread: 2.25, max_markup: 2.5 },
    active: true,
    created_at: "2025-07-20T09:15:00Z",
  },
  {
    id: "lndr-004",
    dealer_id: DEALER_ID,
    lender_name: "Wells Fargo Dealer Services",
    lender_code: "WF-7744",
    portal: "dealertrack",
    contact_email: "dealer.services@wellsfargo.com",
    contact_phone: "(800) 289-8004",
    rate_sheet: {
      tiers: [
        { min_score: 760, max_score: 850, rate: 4.19, max_term: 84 },
        { min_score: 720, max_score: 759, rate: 5.49, max_term: 75 },
        { min_score: 680, max_score: 719, rate: 7.29, max_term: 72 },
        { min_score: 640, max_score: 679, rate: 9.49, max_term: 66 },
      ],
    },
    buy_rates: { spread: 1.5, max_markup: 2.0 },
    active: true,
    created_at: "2025-06-10T11:00:00Z",
  },
  {
    id: "lndr-005",
    dealer_id: DEALER_ID,
    lender_name: "Credit Union Direct Lending",
    lender_code: "CUDL-2200",
    portal: "cudl",
    contact_email: "support@cudl.com",
    contact_phone: "(877) 282-8356",
    rate_sheet: {
      tiers: [
        { min_score: 700, max_score: 850, rate: 3.99, max_term: 84 },
        { min_score: 650, max_score: 699, rate: 5.49, max_term: 72 },
        { min_score: 600, max_score: 649, rate: 7.99, max_term: 60 },
      ],
    },
    buy_rates: { spread: 1.0, max_markup: 1.5 },
    active: true,
    created_at: "2025-10-01T08:45:00Z",
  },
  {
    id: "lndr-006",
    dealer_id: DEALER_ID,
    lender_name: "Southeast Toyota Finance",
    lender_code: "SETF-5500",
    portal: "direct",
    contact_email: "dealer.portal@setf.com",
    contact_phone: "(800) 737-0138",
    rate_sheet: {
      tiers: [
        { min_score: 720, max_score: 850, rate: 3.49, max_term: 72 },
        { min_score: 680, max_score: 719, rate: 4.99, max_term: 72 },
        { min_score: 640, max_score: 679, rate: 6.49, max_term: 66 },
      ],
    },
    buy_rates: { spread: 0.75, max_markup: 1.25 },
    active: false,
    created_at: "2025-11-15T13:20:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/lenders                                                     */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT * FROM lender_profiles WHERE dealer_id = $1 ORDER BY lender_name`,
        [authResult.user.dealer_id],
      );
      return NextResponse.json({ lenders: result.rows });
    } catch (err) {
      console.error("[api/admin/lenders] DB error:", err);
    }
  }

  return NextResponse.json({ lenders: MOCK_LENDERS });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/lenders                                                    */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const rl = await checkRateLimit(`lenders:${authResult.user.dealer_id}`, 10, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", authResult.user.dealer_id, { route: "lenders", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { lender_name, lender_code, portal, contact_email, contact_phone, rate_sheet, buy_rates } = body as {
    lender_name?: string;
    lender_code?: string;
    portal?: string;
    contact_email?: string;
    contact_phone?: string;
    rate_sheet?: Record<string, unknown>;
    buy_rates?: Record<string, unknown>;
  };

  if (!lender_name || typeof lender_name !== "string" || lender_name.trim().length === 0) {
    return NextResponse.json({ error: "lender_name is required" }, { status: 422 });
  }

  const validPortals = ["routeone", "dealertrack", "cudl", "direct"];
  if (portal && !validPortals.includes(portal)) {
    return NextResponse.json({ error: `portal must be one of: ${validPortals.join(", ")}` }, { status: 422 });
  }

  const id = `lndr-${Date.now().toString(36)}`;
  const dealerId = authResult.user.dealer_id;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `INSERT INTO lender_profiles (id, dealer_id, lender_name, lender_code, portal, contact_email, contact_phone, rate_sheet, buy_rates)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [id, dealerId, lender_name.trim(), lender_code ?? null, portal ?? null, contact_email ?? null, contact_phone ?? null, JSON.stringify(rate_sheet ?? {}), JSON.stringify(buy_rates ?? {})],
      );

      try { trackLender("lender.created", dealerId, { lender_id: id, portal: portal ?? "direct" }); } catch {}

      return NextResponse.json({ lender: result.rows[0] }, { status: 201 });
    } catch (err) {
      console.error("[api/admin/lenders] DB insert error:", err);
    }
  }

  // Shadow mode: return realistic created object
  const created = {
    id,
    dealer_id: dealerId,
    lender_name: lender_name.trim(),
    lender_code: lender_code ?? null,
    portal: portal ?? "direct",
    contact_email: contact_email ?? null,
    contact_phone: contact_phone ?? null,
    rate_sheet: rate_sheet ?? {},
    buy_rates: buy_rates ?? {},
    active: true,
    created_at: new Date().toISOString(),
  };

  try { trackLender("lender.created", dealerId, { lender_id: id, portal: portal ?? "direct" }); } catch {}

  return NextResponse.json({ lender: created }, { status: 201 });
}
