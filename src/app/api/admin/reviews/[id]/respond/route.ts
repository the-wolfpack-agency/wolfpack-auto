import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* POST /api/admin/reviews/[id]/respond                                        */
/* -------------------------------------------------------------------------- */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;

  let body: { response_text: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.response_text?.trim()) {
    return NextResponse.json({ error: "response_text is required" }, { status: 400 });
  }

  const now = new Date().toISOString().split("T")[0];

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `UPDATE reviews
         SET responded = true, response_text = $1, response_date = $2
         WHERE id = $3 AND dealer_id = $4
         RETURNING *`,
        [body.response_text.trim(), now, id, DEALER_ID],
      );

      if ((result.rows as unknown[]).length === 0) {
        return NextResponse.json({ error: "Review not found" }, { status: 404 });
      }

      return NextResponse.json({ success: true, review: result.rows[0] });
    } catch (err) {
      console.error("[api/admin/reviews/respond] DB error:", err);
    }
  }

  // Shadow mode
  return NextResponse.json({
    success: true,
    review_id: id,
    response_text: body.response_text.trim(),
    response_date: now,
    mode: "shadow",
  });
}
