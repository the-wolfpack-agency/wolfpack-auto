/**
 * GET  /api/admin/ofac — List OFAC screening history (filterable)
 * POST /api/admin/ofac — Screen a customer against the SDN list
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackCompliance, trackSecurity } from "@/lib/analytics-hooks";
import { checkIdempotency, recordIdempotency, idempotencyKey } from "@/lib/idempotency";
import { screenCustomer, maskDob } from "@/lib/ofac-screening";

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_SCREENINGS = [
  {
    id: "ofac-001",
    dealer_id: "demo-dealer",
    deal_id: "deal-001",
    customer_name: "James Rodriguez",
    status: "clear",
    match_score: 0,
    matches_found: 0,
    reference_id: "OFAC-1711612800-a1b2c3d4",
    reviewed_by: null,
    reviewed_at: null,
    override_reason: null,
    screened_at: "2026-03-28T09:20:00Z",
    created_at: "2026-03-28T09:20:00Z",
  },
  {
    id: "ofac-002",
    dealer_id: "demo-dealer",
    deal_id: "deal-002",
    customer_name: "Sarah Mitchell",
    status: "clear",
    match_score: 0,
    matches_found: 0,
    reference_id: "OFAC-1711616400-e5f6a7b8",
    reviewed_by: null,
    reviewed_at: null,
    override_reason: null,
    screened_at: "2026-03-28T10:35:00Z",
    created_at: "2026-03-28T10:35:00Z",
  },
  {
    id: "ofac-003",
    dealer_id: "demo-dealer",
    deal_id: "deal-003",
    customer_name: "Robert Kim",
    status: "clear",
    match_score: 0,
    matches_found: 0,
    reference_id: "OFAC-1711526400-c9d0e1f2",
    reviewed_by: null,
    reviewed_at: null,
    override_reason: null,
    screened_at: "2026-03-25T08:10:00Z",
    created_at: "2026-03-25T08:10:00Z",
  },
  {
    id: "ofac-004",
    dealer_id: "demo-dealer",
    deal_id: "deal-004",
    customer_name: "Emily Watson",
    status: "clear",
    match_score: 0,
    matches_found: 0,
    reference_id: "OFAC-1711620000-a3b4c5d6",
    reviewed_by: null,
    reviewed_at: null,
    override_reason: null,
    screened_at: "2026-03-28T11:05:00Z",
    created_at: "2026-03-28T11:05:00Z",
  },
  {
    id: "ofac-005",
    dealer_id: "demo-dealer",
    deal_id: "deal-005",
    customer_name: "William Tran",
    status: "clear",
    match_score: 0,
    matches_found: 0,
    reference_id: "OFAC-1711497600-e7f8a9b0",
    reviewed_by: null,
    reviewed_at: null,
    override_reason: null,
    screened_at: "2026-03-24T14:10:00Z",
    created_at: "2026-03-24T14:10:00Z",
  },
  {
    id: "ofac-006",
    dealer_id: "demo-dealer",
    deal_id: null,
    customer_name: "Ahmed Bilal",
    status: "potential_match",
    match_score: 72,
    matches_found: 1,
    reference_id: "OFAC-1711630800-c1d2e3f4",
    reviewed_by: null,
    reviewed_at: null,
    override_reason: null,
    screened_at: "2026-03-28T14:00:00Z",
    created_at: "2026-03-28T14:00:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/ofac                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const url = request.nextUrl;
  const status = url.searchParams.get("status") || "";
  const dealId = url.searchParams.get("deal_id") || "";

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const conditions: string[] = ["s.dealer_id = $1"];
      const params: unknown[] = [dealerId];
      let idx = 2;

      if (status) {
        conditions.push(`s.status = $${idx++}`);
        params.push(status);
      }
      if (dealId) {
        conditions.push(`s.deal_id = $${idx++}`);
        params.push(dealId);
      }

      const result = await /* audit-safe: A4 reason="s.dealer_id is the first condition pushed into conditions array on line above" */ query(
        `SELECT s.*
           FROM ofac_screenings s
          WHERE ${conditions.join(" AND ")}
          ORDER BY s.screened_at DESC
          LIMIT 200`,
        params,
      );

      return NextResponse.json({
        screenings: result.rows,
        total: (result.rows as unknown[]).length,
      });
    } catch (err) {
      console.error("[api/admin/ofac] DB error, falling back to mock:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  let filtered = [...MOCK_SCREENINGS];
  if (status) filtered = filtered.filter((s) => s.status === status);
  if (dealId) filtered = filtered.filter((s) => s.deal_id === dealId);

  return NextResponse.json({
    screenings: filtered,
    total: filtered.length,
  });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/ofac                                                       */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const rl = await checkRateLimit(`ofac:${dealerId}`, 20, 60);
  if (!rl.allowed) {
    try {
      trackSecurity("security.rate_limit_triggered", dealerId, {
        route: "ofac",
        remaining: 0,
      });
    } catch {}
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  // Idempotency — prevent duplicate screenings from double-clicks/retries
  const iKey = idempotencyKey("/api/admin/ofac", body);
  const cached = checkIdempotency(iKey);
  if (cached) return NextResponse.json(cached, { status: 201 });

  // Validate required fields
  const customerName = body.customer_name;
  if (!customerName || typeof customerName !== "string" || !customerName.trim()) {
    return NextResponse.json(
      { error: "Missing required field: customer_name" },
      { status: 422 },
    );
  }

  const dealId = body.deal_id ? String(body.deal_id) : null;
  const customerDob = body.customer_dob ? String(body.customer_dob) : undefined;
  const customerAddress = body.customer_address
    ? String(body.customer_address)
    : undefined;

  // Perform the screening
  const result = await screenCustomer(
    customerName.trim(),
    customerDob,
    customerAddress,
  );

  // Determine status
  let screeningStatus: string;
  if (result.match_score >= 85) {
    screeningStatus = "confirmed_match";
  } else if (result.match_found) {
    screeningStatus = "potential_match";
  } else {
    screeningStatus = "clear";
  }

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const dbResult = await query(
        `INSERT INTO ofac_screenings (
           dealer_id, deal_id, customer_name, customer_dob_masked,
           status, match_score, matches_found, matches_detail,
           reference_id, screened_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          dealerId,
          dealId,
          customerName.trim(),
          customerDob ? maskDob(customerDob) : null,
          screeningStatus,
          result.match_score,
          result.matches.length,
          JSON.stringify(result.matches),
          result.reference_id,
          result.screened_at,
        ],
      );

      try {
        trackCompliance("compliance.check_run", dealerId, {
          screening_id: String(dbResult.rows[0]?.id || result.reference_id),
          status: screeningStatus,
          match_score: result.match_score,
          deal_id: dealId || "",
        });
      } catch {}

      const resp = {
        screening: dbResult.rows[0],
        result: {
          status: screeningStatus,
          match_score: result.match_score,
          matches: result.matches,
          reference_id: result.reference_id,
          screened_at: result.screened_at,
        },
        created: true,
      };
      recordIdempotency(iKey, resp);
      return NextResponse.json(resp, { status: 201 });
    } catch (err) {
      console.error(
        "[api/admin/ofac] DB insert error, falling back to mock:",
        err,
      );
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  const screening = {
    id: `ofac-${Date.now()}`,
    dealer_id: dealerId,
    deal_id: dealId,
    customer_name: customerName.trim(),
    customer_dob_masked: customerDob ? maskDob(customerDob) : null,
    status: screeningStatus,
    match_score: result.match_score,
    matches_found: result.matches.length,
    matches_detail: result.matches,
    reference_id: result.reference_id,
    reviewed_by: null,
    reviewed_at: null,
    override_reason: null,
    screened_at: result.screened_at,
    created_at: new Date().toISOString(),
  };

  try {
    trackCompliance("compliance.check_run", dealerId, {
      screening_id: screening.id,
      status: screeningStatus,
      match_score: result.match_score,
      deal_id: dealId || "",
    });
  } catch {}

  const resp = {
    screening,
    result: {
      status: screeningStatus,
      match_score: result.match_score,
      matches: result.matches,
      reference_id: result.reference_id,
      screened_at: result.screened_at,
    },
    created: true,
  };
  recordIdempotency(iKey, resp);
  return NextResponse.json(resp, { status: 201 });
}
