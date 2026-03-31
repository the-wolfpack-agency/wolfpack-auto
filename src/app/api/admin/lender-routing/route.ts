/**
 * GET  /api/admin/lender-routing — List credit app submissions (filterable)
 * POST /api/admin/lender-routing — Submit credit application to selected lenders
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackLender, trackCredit, trackSecurity } from "@/lib/analytics-hooks";
import { checkIdempotency, recordIdempotency, idempotencyKey } from "@/lib/idempotency";

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_SUBMISSIONS = [
  {
    id: "lrsub-001",
    dealer_id: "demo-dealer",
    deal_id: "deal-001",
    customer_name: "James Rodriguez",
    ssn_last4: "4829",
    platform: "routeone",
    lender_name: "Toyota Financial Services",
    lender_id: "lndr-tfs",
    status: "approved",
    apr_offered: 5.49,
    term_offered: 72,
    amount_approved: 19200,
    stipulations: ["Proof of income", "Proof of residence"],
    submitted_at: "2026-03-28T12:00:00Z",
    responded_at: "2026-03-28T14:15:00Z",
    expires_at: "2026-04-04T23:59:59Z",
    notes: "Auto-approved — Tier 1 credit.",
  },
  {
    id: "lrsub-002",
    dealer_id: "demo-dealer",
    deal_id: "deal-001",
    customer_name: "James Rodriguez",
    ssn_last4: "4829",
    platform: "dealertrack",
    lender_name: "Capital One Auto",
    lender_id: "lndr-cap1",
    status: "approved",
    apr_offered: 6.29,
    term_offered: 60,
    amount_approved: 19200,
    stipulations: ["Proof of income"],
    submitted_at: "2026-03-28T11:45:00Z",
    responded_at: "2026-03-28T16:30:00Z",
    expires_at: "2026-04-04T23:59:59Z",
    notes: "60-month max term on this tier.",
  },
  {
    id: "lrsub-003",
    dealer_id: "demo-dealer",
    deal_id: "deal-001",
    customer_name: "James Rodriguez",
    ssn_last4: "4829",
    platform: "routeone",
    lender_name: "Chase Auto",
    lender_id: "lndr-chase",
    status: "declined",
    apr_offered: null,
    term_offered: null,
    amount_approved: null,
    stipulations: [],
    submitted_at: "2026-03-28T12:30:00Z",
    responded_at: "2026-03-28T13:00:00Z",
    expires_at: null,
    notes: "Declined — LTV exceeds program limit.",
  },
  {
    id: "lrsub-004",
    dealer_id: "demo-dealer",
    deal_id: "deal-002",
    customer_name: "Sarah Mitchell",
    ssn_last4: "7156",
    platform: "dealertrack",
    lender_name: "Honda Financial Services",
    lender_id: "lndr-hfs",
    status: "pending",
    apr_offered: null,
    term_offered: null,
    amount_approved: null,
    stipulations: [],
    submitted_at: "2026-03-28T13:45:00Z",
    responded_at: null,
    expires_at: null,
    notes: "Under review — first-time buyer program.",
  },
  {
    id: "lrsub-005",
    dealer_id: "demo-dealer",
    deal_id: "deal-002",
    customer_name: "Sarah Mitchell",
    ssn_last4: "7156",
    platform: "routeone",
    lender_name: "Ally Financial",
    lender_id: "lndr-ally",
    status: "counter_offer",
    apr_offered: 5.99,
    term_offered: 60,
    amount_approved: 32000,
    stipulations: ["60-month max term", "Proof of income"],
    submitted_at: "2026-03-28T13:45:00Z",
    responded_at: "2026-03-28T17:20:00Z",
    expires_at: "2026-04-01T23:59:59Z",
    notes: "Counter: 60-month max, reduced amount. Original request was 72mo / $34,845.",
  },
  {
    id: "lrsub-006",
    dealer_id: "demo-dealer",
    deal_id: "deal-003",
    customer_name: "Robert Kim",
    ssn_last4: "3041",
    platform: "direct",
    lender_name: "Ford Motor Credit",
    lender_id: "lndr-fmc",
    status: "funded",
    apr_offered: 6.29,
    term_offered: 72,
    amount_approved: 25200,
    stipulations: [],
    submitted_at: "2026-03-25T09:00:00Z",
    responded_at: "2026-03-25T11:30:00Z",
    expires_at: null,
    notes: "Funded 3/27. Contract purchased.",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/lender-routing                                              */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const url = request.nextUrl;
  const status = url.searchParams.get("status") || "";
  const lender = url.searchParams.get("lender") || "";
  const dealId = url.searchParams.get("deal_id") || "";
  const platform = url.searchParams.get("platform") || "";

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions: string[] = ["ls.dealer_id = $1", "ls.deleted_at IS NULL"];
      const params: unknown[] = [dealerId];
      let idx = 2;

      if (status) {
        conditions.push(`ls.status = $${idx++}`);
        params.push(status);
      }
      if (lender) {
        conditions.push(`ls.lender_name ILIKE $${idx++}`);
        params.push(`%${lender}%`);
      }
      if (dealId) {
        conditions.push(`ls.deal_id = $${idx++}`);
        params.push(dealId);
      }
      if (platform) {
        conditions.push(`ls.platform = $${idx++}`);
        params.push(platform);
      }

      const result = await query(
        `SELECT ls.id, ls.dealer_id, ls.deal_id, ls.customer_name,
                ls.ssn_last4, ls.platform, ls.lender_name, ls.lender_id,
                ls.status, ls.apr_offered, ls.term_offered, ls.amount_approved,
                ls.stipulations, ls.submitted_at, ls.responded_at,
                ls.expires_at, ls.notes
           FROM lender_submissions ls
          WHERE ${conditions.join(" AND ")}
          ORDER BY ls.submitted_at DESC
          LIMIT 200`,
        params,
      );

      return NextResponse.json({ submissions: result.rows, total: (result.rows as unknown[]).length });
    } catch (err) {
      console.error("[api/admin/lender-routing] DB error, falling back to mock:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  let filtered = [...MOCK_SUBMISSIONS];
  if (status) filtered = filtered.filter((s) => s.status === status);
  if (lender)
    filtered = filtered.filter((s) =>
      s.lender_name.toLowerCase().includes(lender.toLowerCase()),
    );
  if (dealId) filtered = filtered.filter((s) => s.deal_id === dealId);
  if (platform) filtered = filtered.filter((s) => s.platform === platform);

  return NextResponse.json({ submissions: filtered, total: filtered.length });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/lender-routing                                             */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  /* Credit pulls are sensitive — 5 per minute */
  const rl = await checkRateLimit(`lender-routing:${dealerId}`, 5, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", dealerId, { route: "lender-routing", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded. Credit applications are limited to 5 per minute." }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  /* Idempotency — prevent duplicate credit pulls */
  const iKey = idempotencyKey("/api/admin/lender-routing", body);
  const cached = checkIdempotency(iKey);
  if (cached) return NextResponse.json(cached, { status: 201 });

  /* Validate required fields */
  const required = ["deal_id", "customer_name", "vehicle_vin", "selling_price", "selected_lenders", "submission_platform"];
  for (const field of required) {
    if (!body[field]) {
      return NextResponse.json(
        { error: `Missing required field: ${field}` },
        { status: 422 },
      );
    }
  }

  const selectedLenders = body.selected_lenders as string[];
  if (!Array.isArray(selectedLenders) || selectedLenders.length === 0) {
    return NextResponse.json(
      { error: "At least one lender must be selected" },
      { status: 422 },
    );
  }

  const validPlatforms = ["routeone", "dealertrack", "direct"];
  if (!validPlatforms.includes(body.submission_platform as string)) {
    return NextResponse.json(
      { error: "Invalid submission_platform. Must be routeone, dealertrack, or direct." },
      { status: 422 },
    );
  }

  /* SSN handling — only last 4, never log full */
  const ssnLast4 = body.ssn_last4 ? String(body.ssn_last4).slice(-4) : null;

  const now = new Date().toISOString();

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const submissions = [];

      for (const lenderId of selectedLenders) {
        const result = await query(
          `INSERT INTO lender_submissions (
             dealer_id, deal_id, customer_name, ssn_last4, platform,
             lender_name, lender_id, status, submitted_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted', NOW())
           RETURNING *`,
          [
            dealerId,
            body.deal_id,
            body.customer_name,
            ssnLast4,
            body.submission_platform,
            lenderId, // lender_name populated by lookup in production
            lenderId,
          ],
        );
        submissions.push(result.rows[0]);
      }

      try {
        trackLender("deal.lender_submitted", dealerId, {
          deal_id: String(body.deal_id),
          platform: String(body.submission_platform),
          lender_count: selectedLenders.length,
        });
        trackCredit("credit.pulled", dealerId, {
          deal_id: String(body.deal_id),
          lender_count: selectedLenders.length,
        });
        trackCredit("credit.consent_recorded", dealerId, {
          deal_id: String(body.deal_id),
          customer_name: String(body.customer_name),
        });
      } catch {}

      const resp = { submissions, total: submissions.length, created: true };
      recordIdempotency(iKey, resp);
      return NextResponse.json(resp, { status: 201 });
    } catch (err) {
      console.error("[api/admin/lender-routing] DB insert error, falling back to mock:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  const submissions = selectedLenders.map((lenderId, i) => ({
    id: `lrsub-${Date.now()}-${i}`,
    dealer_id: dealerId,
    deal_id: body.deal_id,
    customer_name: body.customer_name,
    ssn_last4: ssnLast4,
    platform: body.submission_platform,
    lender_name: lenderId,
    lender_id: lenderId,
    status: "submitted",
    apr_offered: null,
    term_offered: null,
    amount_approved: null,
    stipulations: [],
    submitted_at: now,
    responded_at: null,
    expires_at: null,
    notes: null,
  }));

  try {
    trackLender("deal.lender_submitted", dealerId, {
      deal_id: String(body.deal_id),
      platform: String(body.submission_platform),
      lender_count: selectedLenders.length,
    });
    trackCredit("credit.pulled", dealerId, {
      deal_id: String(body.deal_id),
      lender_count: selectedLenders.length,
    });
    trackCredit("credit.consent_recorded", dealerId, {
      deal_id: String(body.deal_id),
      customer_name: String(body.customer_name),
    });
  } catch {}

  const resp = { submissions, total: submissions.length, created: true };
  recordIdempotency(iKey, resp);
  return NextResponse.json(resp, { status: 201 });
}
