/**
 * GET   /api/admin/lender-routing/[submissionId] — Single submission detail
 * PATCH /api/admin/lender-routing/[submissionId] — Update submission (accept, decline, fund)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackLender } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Shadow mock — single submission                                            */
/* -------------------------------------------------------------------------- */

const MOCK_SUBMISSION = {
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
  customer_email: "james.r@email.com",
  customer_phone: "(512) 555-0147",
  customer_address: "4821 E Riverside Dr, Austin, TX 78741",
  customer_dob: "1988-05-14",
  customer_income: 85000,
  customer_employer: "Dell Technologies",
  vehicle_vin: "4T1G11AK5RU123456",
  vehicle_year: 2024,
  vehicle_make: "Toyota",
  vehicle_model: "Camry XSE",
  vehicle_selling_price: 31500,
  events: [
    { action: "submitted", timestamp: "2026-03-28T12:00:00Z", by: "Mike Chen" },
    { action: "lender_received", timestamp: "2026-03-28T12:01:00Z", by: "system" },
    { action: "approved", timestamp: "2026-03-28T14:15:00Z", by: "Toyota Financial Services" },
  ],
};

/* -------------------------------------------------------------------------- */
/* GET /api/admin/lender-routing/[submissionId]                               */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;
  const { submissionId } = await params;

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT ls.*
           FROM lender_submissions ls
          WHERE ls.id = $1 AND ls.dealer_id = $2 AND ls.deleted_at IS NULL`,
        [submissionId, dealerId],
      );

      if ((result.rows as unknown[]).length === 0) {
        return NextResponse.json({ error: "Submission not found" }, { status: 404 });
      }

      return NextResponse.json({ submission: result.rows[0] });
    } catch (err) {
      console.error("[api/admin/lender-routing/[id]] DB error, falling back to mock:", err);
    }
  }

  /* ---- Shadow mode ---- */
  if (submissionId !== MOCK_SUBMISSION.id) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  return NextResponse.json({ submission: MOCK_SUBMISSION });
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/lender-routing/[submissionId]                             */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;
  const { submissionId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const allowedStatuses = ["accepted", "declined", "funded", "expired"];
  if (body.status && !allowedStatuses.includes(body.status as string)) {
    return NextResponse.json(
      { error: `Invalid status. Allowed: ${allowedStatuses.join(", ")}` },
      { status: 422 },
    );
  }

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const setClauses: string[] = ["updated_at = NOW()"];
      const values: unknown[] = [];
      let idx = 1;

      if (body.status) {
        setClauses.push(`status = $${idx++}`);
        values.push(body.status);
      }
      if (body.notes !== undefined) {
        setClauses.push(`notes = $${idx++}`);
        values.push(body.notes);
      }

      values.push(submissionId, dealerId);

      const result = await query(
        `UPDATE lender_submissions
            SET ${setClauses.join(", ")}
          WHERE id = $${idx++} AND dealer_id = $${idx++} AND deleted_at IS NULL
          RETURNING *`,
        values,
      );

      if ((result.rows as unknown[]).length === 0) {
        return NextResponse.json({ error: "Submission not found" }, { status: 404 });
      }

      try {
        trackLender("deal.lender_response", dealerId, {
          submission_id: submissionId,
          status: String(body.status || "updated"),
          lender_name: String((result.rows[0] as Record<string, unknown>).lender_name || ""),
        });
      } catch {}

      return NextResponse.json({ submission: result.rows[0], updated: true });
    } catch (err) {
      console.error("[api/admin/lender-routing/[id]] DB update error, falling back to mock:", err);
    }
  }

  /* ---- Shadow mode ---- */
  const updated = {
    ...MOCK_SUBMISSION,
    id: submissionId,
    status: (body.status as string) || MOCK_SUBMISSION.status,
    notes: body.notes !== undefined ? (body.notes as string) : MOCK_SUBMISSION.notes,
    updated_at: new Date().toISOString(),
    events: [
      ...MOCK_SUBMISSION.events,
      {
        action: (body.status as string) || "updated",
        timestamp: new Date().toISOString(),
        by: authResult.user.name,
      },
    ],
  };

  try {
    trackLender("deal.lender_response", dealerId, {
      submission_id: submissionId,
      status: String(body.status || "updated"),
      lender_name: updated.lender_name,
    });
  } catch {}

  return NextResponse.json({ submission: updated, updated: true });
}
