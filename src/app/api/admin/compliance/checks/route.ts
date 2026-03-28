import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackCompliance } from "@/lib/analytics-hooks";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* Shadow mock data                                                           */
/* -------------------------------------------------------------------------- */

const MOCK_CHECKS = [
  {
    id: "cc-001",
    dealer_id: DEALER_ID,
    lead_id: "lead-042",
    deal_id: null,
    check_type: "red_flags",
    customer_name: "John A. Smith",
    result: "clear",
    flags: [],
    checked_by: "system",
    reviewed_by: null,
    review_notes: null,
    override_approved: false,
    override_by: null,
    override_at: null,
    created_at: "2026-03-27T14:22:00Z",
  },
  {
    id: "cc-002",
    dealer_id: DEALER_ID,
    lead_id: "lead-038",
    deal_id: "deal-019",
    check_type: "ofac",
    customer_name: "Maria Gonzalez",
    result: "clear",
    flags: [],
    checked_by: "system",
    reviewed_by: null,
    review_notes: null,
    override_approved: false,
    override_by: null,
    override_at: null,
    created_at: "2026-03-27T11:05:00Z",
  },
  {
    id: "cc-003",
    dealer_id: DEALER_ID,
    lead_id: "lead-051",
    deal_id: null,
    check_type: "red_flags",
    customer_name: "Robert Chen",
    result: "flagged",
    flags: [
      { rule: "RF-003", description: "Address on ID does not match address on credit application", severity: "medium" },
      { rule: "RF-007", description: "Customer provided two different phone numbers across documents", severity: "low" },
    ],
    checked_by: "system",
    reviewed_by: "jdoe",
    review_notes: "Customer recently moved, verified new address with utility bill.",
    override_approved: true,
    override_by: "jdoe",
    override_at: "2026-03-27T15:30:00Z",
    created_at: "2026-03-27T09:15:00Z",
  },
  {
    id: "cc-004",
    dealer_id: DEALER_ID,
    lead_id: null,
    deal_id: "deal-022",
    check_type: "id_verification",
    customer_name: "David Park",
    result: "review_required",
    flags: [
      { rule: "ID-002", description: "Driver license expired 14 days ago", severity: "medium" },
    ],
    checked_by: "system",
    reviewed_by: null,
    review_notes: null,
    override_approved: false,
    override_by: null,
    override_at: null,
    created_at: "2026-03-26T16:40:00Z",
  },
  {
    id: "cc-005",
    dealer_id: DEALER_ID,
    lead_id: "lead-060",
    deal_id: null,
    check_type: "ofac",
    customer_name: "Ahmed Al-Rashid",
    result: "blocked",
    flags: [
      { rule: "OFAC-001", description: "Partial name match on SDN list entry #12847", severity: "critical" },
      { rule: "OFAC-002", description: "Secondary identifier cross-reference pending manual review", severity: "high" },
    ],
    checked_by: "system",
    reviewed_by: null,
    review_notes: null,
    override_approved: false,
    override_by: null,
    override_at: null,
    created_at: "2026-03-26T10:22:00Z",
  },
];

/* -------------------------------------------------------------------------- */
/* Red Flags simulation rules                                                 */
/* -------------------------------------------------------------------------- */

const RED_FLAG_RULES = [
  { rule: "RF-001", description: "SSN does not match credit bureau records", severity: "high" },
  { rule: "RF-002", description: "Multiple applications with same SSN, different names", severity: "critical" },
  { rule: "RF-003", description: "Address on ID does not match address on credit application", severity: "medium" },
  { rule: "RF-004", description: "Customer unable to provide secondary ID", severity: "medium" },
  { rule: "RF-005", description: "Third party attempting to complete transaction on behalf of buyer", severity: "high" },
  { rule: "RF-006", description: "Cash transaction over $10,000 — CTR required", severity: "high" },
  { rule: "RF-007", description: "Customer provided two different phone numbers across documents", severity: "low" },
];

const OFAC_RULES = [
  { rule: "OFAC-001", description: "Partial name match on SDN list", severity: "critical" },
  { rule: "OFAC-002", description: "Secondary identifier cross-reference pending manual review", severity: "high" },
];

const ID_RULES = [
  { rule: "ID-001", description: "ID appears altered or tampered", severity: "critical" },
  { rule: "ID-002", description: "Driver license expired", severity: "medium" },
  { rule: "ID-003", description: "Photo on ID does not clearly match customer", severity: "high" },
];

function simulateCheck(customerName: string, checkType: string) {
  // Deterministic simulation based on customer name length for demo consistency
  const seed = customerName.length % 10;

  let flags: { rule: string; description: string; severity: string }[] = [];
  let result: string;

  if (checkType === "red_flags") {
    if (seed < 6) {
      result = "clear";
    } else if (seed < 8) {
      flags = [RED_FLAG_RULES[seed % RED_FLAG_RULES.length]];
      result = "flagged";
    } else {
      flags = [RED_FLAG_RULES[0], RED_FLAG_RULES[2]];
      result = "review_required";
    }
  } else if (checkType === "ofac") {
    if (seed < 8) {
      result = "clear";
    } else {
      flags = [OFAC_RULES[0]];
      result = "blocked";
    }
  } else {
    // id_verification
    if (seed < 7) {
      result = "clear";
    } else {
      flags = [ID_RULES[seed % ID_RULES.length]];
      result = "review_required";
    }
  }

  return { result, flags };
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/compliance/checks                                           */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { searchParams } = request.nextUrl;
  const checkType = searchParams.get("check_type");
  const result = searchParams.get("result");

  // Database path
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      let sql = `SELECT * FROM compliance_checks WHERE dealer_id = $1`;
      const params: unknown[] = [authResult.user.dealer_id];
      let idx = 2;

      if (checkType) {
        sql += ` AND check_type = $${idx++}`;
        params.push(checkType);
      }
      if (result) {
        sql += ` AND result = $${idx++}`;
        params.push(result);
      }
      sql += ` ORDER BY created_at DESC LIMIT 100`;

      const dbResult = await query(sql, params);
      return NextResponse.json({ checks: dbResult.rows });
    } catch (err) {
      console.error("[api/admin/compliance/checks] DB error:", err);
      // Fall through to mock
    }
  }

  // Shadow mode
  let filtered = [...MOCK_CHECKS];
  if (checkType) filtered = filtered.filter((c) => c.check_type === checkType);
  if (result) filtered = filtered.filter((c) => c.result === result);

  return NextResponse.json({ checks: filtered });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/compliance/checks — run a new check                        */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: { customer_name?: string; check_type?: string; lead_id?: string; deal_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const customerName = body.customer_name?.trim();
  const checkType = body.check_type;
  if (!customerName || !checkType) {
    return NextResponse.json({ error: "customer_name and check_type are required" }, { status: 422 });
  }
  if (!["red_flags", "ofac", "id_verification"].includes(checkType)) {
    return NextResponse.json({ error: "check_type must be red_flags, ofac, or id_verification" }, { status: 422 });
  }

  const { result: checkResult, flags } = simulateCheck(customerName, checkType);
  const id = `cc-${Date.now().toString(36)}`;

  // Analytics (fire-and-forget)
  try {
    trackCompliance("compliance.check_run", authResult.user.dealer_id, {
      check_type: checkType,
      result: checkResult,
      flags_count: flags.length,
    });
  } catch { /* swallow */ }

  // Database path
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const dbResult = await query(
        `INSERT INTO compliance_checks (id, dealer_id, lead_id, deal_id, check_type, customer_name, result, flags, checked_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [id, authResult.user.dealer_id, body.lead_id ?? null, body.deal_id ?? null, checkType, customerName, checkResult, JSON.stringify(flags), authResult.user.id],
      );
      return NextResponse.json({ check: dbResult.rows[0] }, { status: 201 });
    } catch (err) {
      console.error("[api/admin/compliance/checks] DB insert error:", err);
      // Fall through to mock response
    }
  }

  // Shadow mode response
  const check = {
    id,
    dealer_id: authResult.user.dealer_id,
    lead_id: body.lead_id ?? null,
    deal_id: body.deal_id ?? null,
    check_type: checkType,
    customer_name: customerName,
    result: checkResult,
    flags,
    checked_by: authResult.user.id,
    reviewed_by: null,
    review_notes: null,
    override_approved: false,
    override_by: null,
    override_at: null,
    created_at: new Date().toISOString(),
  };

  return NextResponse.json({ check }, { status: 201 });
}
