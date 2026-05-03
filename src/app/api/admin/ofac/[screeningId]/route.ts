/**
 * GET   /api/admin/ofac/[screeningId] — Single screening detail
 * PATCH /api/admin/ofac/[screeningId] — Override a potential match (manager+ only)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole, isAuthenticated } from "@/lib/auth-guard";
import { trackCompliance } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Shadow mock — single screening with match detail                           */
/* -------------------------------------------------------------------------- */

const MOCK_SCREENING_DETAIL: Record<string, Record<string, unknown>> = {
  "ofac-006": {
    id: "ofac-006",
    dealer_id: "demo-dealer",
    deal_id: null,
    customer_name: "Ahmed Bilal",
    customer_dob_masked: "03/1985",
    status: "potential_match",
    match_score: 72,
    matches_found: 1,
    matches_detail: [
      {
        name: "AHMED, Bilal",
        type: "individual",
        program: "SDGT",
        remarks: "DOB 1977; POB Pakistan",
        score: 72,
      },
    ],
    reference_id: "OFAC-1711630800-c1d2e3f4",
    reviewed_by: null,
    reviewed_at: null,
    override_reason: null,
    screened_at: "2026-03-28T14:00:00Z",
    created_at: "2026-03-28T14:00:00Z",
    audit_log: [
      {
        action: "screening_initiated",
        user: "Demo Admin",
        timestamp: "2026-03-28T14:00:00Z",
        details: "OFAC screening initiated for Ahmed Bilal",
      },
      {
        action: "potential_match_found",
        user: "System",
        timestamp: "2026-03-28T14:00:01Z",
        details: "1 potential match found — score 72 — AHMED, Bilal (SDGT)",
      },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* GET /api/admin/ofac/[screeningId]                                          */
/* -------------------------------------------------------------------------- */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ screeningId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;
  const { screeningId } = await params;

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT s.*
           FROM ofac_screenings s
          WHERE s.id = $1 AND s.dealer_id = $2`,
        [screeningId, dealerId],
      );

      if ((result.rows as unknown[]).length === 0) {
        return NextResponse.json(
          { error: "Screening not found" },
          { status: 404 },
        );
      }

      // Fetch audit log
      const auditResult = await /* audit-safe: A4 reason="parent ofac_screening already verified to belong to this dealer immediately above" */ query(
        `SELECT *
           FROM ofac_audit_log
          WHERE screening_id = $1
          ORDER BY timestamp ASC`,
        [screeningId],
      );

      return NextResponse.json({
        screening: {
          ...result.rows[0],
          audit_log: auditResult.rows,
        },
      });
    } catch (err) {
      console.error(
        "[api/admin/ofac/[id]] DB error, falling back to mock:",
        err,
      );
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  const screening = MOCK_SCREENING_DETAIL[screeningId];
  if (!screening) {
    // For any screening ID not in our detail mock, return a generic clear entry
    return NextResponse.json({
      screening: {
        id: screeningId,
        dealer_id: dealerId,
        deal_id: null,
        customer_name: "Unknown",
        status: "clear",
        match_score: 0,
        matches_found: 0,
        matches_detail: [],
        reference_id: `OFAC-mock-${screeningId}`,
        reviewed_by: null,
        reviewed_at: null,
        override_reason: null,
        screened_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        audit_log: [],
      },
    });
  }

  return NextResponse.json({ screening });
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/ofac/[screeningId] — Override a potential match            */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ screeningId: string }> },
) {
  // Only owner and manager can override OFAC matches
  const authResult = await requireRole(["owner", "admin", "manager"]);
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;
  const userName = authResult.user.name;
  const { screeningId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const action = body.action;
  if (!action || !["override", "escalate", "block"].includes(String(action))) {
    return NextResponse.json(
      {
        error:
          'Invalid action. Must be one of: "override", "escalate", "block"',
      },
      { status: 422 },
    );
  }

  // Override requires a written justification
  if (action === "override") {
    const reason = body.override_reason;
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return NextResponse.json(
        {
          error:
            "Override requires a written justification (override_reason field)",
        },
        { status: 422 },
      );
    }
  }

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      // Verify screening exists and belongs to dealer
      const existing = await query(
        `SELECT * FROM ofac_screenings WHERE id = $1 AND dealer_id = $2`,
        [screeningId, dealerId],
      );
      if ((existing.rows as unknown[]).length === 0) {
        return NextResponse.json(
          { error: "Screening not found" },
          { status: 404 },
        );
      }

      let newStatus: string;
      if (action === "override") newStatus = "override";
      else if (action === "block") newStatus = "confirmed_match";
      else newStatus = "potential_match"; // escalate keeps status

      const result = await query(
        `UPDATE ofac_screenings
            SET status = $1,
                reviewed_by = $2,
                reviewed_at = NOW(),
                override_reason = $3,
                updated_at = NOW()
          WHERE id = $4 AND dealer_id = $5
          RETURNING *`,
        [
          newStatus,
          userName,
          action === "override" ? String(body.override_reason).trim() : null,
          screeningId,
          dealerId,
        ],
      );

      // Write to audit log
      await /* audit-safe: A4 reason="parent ofac_screening tenant-verified earlier in this handler; child rows scoped via screening_id FK" */ query(
        `INSERT INTO ofac_audit_log (screening_id, action, user_name, details, timestamp)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          screeningId,
          String(action),
          userName,
          action === "override"
            ? `Override by ${userName}: ${String(body.override_reason).trim()}`
            : action === "block"
              ? `Deal blocked by ${userName}`
              : `Escalated by ${userName}`,
        ],
      );

      const eventName =
        action === "override"
          ? "compliance.check_overridden"
          : "compliance.check_reviewed";
      try {
        trackCompliance(
          eventName as "compliance.check_overridden" | "compliance.check_reviewed",
          dealerId,
          {
            screening_id: screeningId,
            action: String(action),
            reviewed_by: userName,
          },
        );
      } catch {}

      return NextResponse.json({ screening: result.rows[0], updated: true });
    } catch (err) {
      console.error(
        "[api/admin/ofac/[id]] DB update error, falling back to mock:",
        err,
      );
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  let newStatus: string;
  if (action === "override") newStatus = "override";
  else if (action === "block") newStatus = "confirmed_match";
  else newStatus = "potential_match";

  const updatedScreening = {
    ...(MOCK_SCREENING_DETAIL[screeningId] || {
      id: screeningId,
      dealer_id: dealerId,
    }),
    status: newStatus,
    reviewed_by: userName,
    reviewed_at: new Date().toISOString(),
    override_reason:
      action === "override" ? String(body.override_reason).trim() : null,
  };

  const eventName =
    action === "override"
      ? "compliance.check_overridden"
      : "compliance.check_reviewed";
  try {
    trackCompliance(
      eventName as "compliance.check_overridden" | "compliance.check_reviewed",
      dealerId,
      {
        screening_id: screeningId,
        action: String(action),
        reviewed_by: userName,
      },
    );
  } catch {}

  return NextResponse.json({ screening: updatedScreening, updated: true });
}
