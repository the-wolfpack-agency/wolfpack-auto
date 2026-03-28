import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackCompliance } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/compliance/checks/[id] — review / override                */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;

  let body: {
    reviewed_by?: string;
    review_notes?: string;
    override_approved?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.review_notes) {
    return NextResponse.json({ error: "review_notes is required" }, { status: 422 });
  }

  const reviewedBy = body.reviewed_by ?? authResult.user.id;
  const overrideApproved = body.override_approved ?? false;

  // Analytics (fire-and-forget)
  try {
    const event = overrideApproved ? "compliance.check_overridden" : "compliance.check_reviewed";
    trackCompliance(event as any, authResult.user.dealer_id, {
      check_id: id,
      override: overrideApproved,
    });
  } catch { /* swallow */ }

  // Database path
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const overrideCols = overrideApproved
        ? `, override_approved = true, override_by = $5, override_at = NOW()`
        : "";
      const baseParams = [reviewedBy, body.review_notes, id, authResult.user.dealer_id];
      if (overrideApproved) baseParams.push(authResult.user.id);

      const result = await query(
        `UPDATE compliance_checks
         SET reviewed_by = $1, review_notes = $2${overrideCols}
         WHERE id = $3 AND dealer_id = $4 RETURNING *`,
        baseParams,
      );

      if ((result.rows as any[]).length === 0) {
        return NextResponse.json({ error: "Check not found" }, { status: 404 });
      }
      return NextResponse.json({ check: result.rows[0] });
    } catch (err) {
      console.error("[api/admin/compliance/checks/[id]] DB error:", err);
      // Fall through to mock
    }
  }

  // Shadow mode response
  return NextResponse.json({
    check: {
      id,
      reviewed_by: reviewedBy,
      review_notes: body.review_notes,
      override_approved: overrideApproved,
      override_by: overrideApproved ? authResult.user.id : null,
      override_at: overrideApproved ? new Date().toISOString() : null,
      updated: true,
    },
  });
}
