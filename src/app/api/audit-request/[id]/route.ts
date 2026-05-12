/**
 * GET /api/audit-request/:id — public status check for an audit run.
 *
 * The form returns a run id on submission so the landing page can poll.
 * Returns minimal info: status + (when delivered) the headline summary.
 *
 * Does NOT return contact info or the source CSV URL — those are
 * BDC-only and live behind the admin route.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id || typeof id !== "string" || id.length < 4) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  // Shadow mode — return a synthesized "pending" so the demo flow renders.
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        id,
        status: "pending",
        headline: null,
      },
      { status: 200 },
    );
  }

  try {
    const { query } = await import("@/lib/db");
    const r = await query<{
      id: string;
      status: string;
      summary_metrics: Record<string, unknown> | null;
      delivered_at: string | null;
    }>(
      `SELECT id::text, status, summary_metrics, delivered_at
       FROM fi_audit_runs WHERE id = $1::uuid`,
      [id],
    );
    if (!r.rows || r.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const row = r.rows[0];
    const headline =
      row.summary_metrics &&
      typeof row.summary_metrics === "object" &&
      "headline" in row.summary_metrics
        ? (row.summary_metrics as Record<string, unknown>).headline
        : null;
    return NextResponse.json({
      id: row.id,
      status: row.status,
      headline,
      delivered_at: row.delivered_at,
    });
  } catch (err) {
    console.error("[fi-audit] status GET failed:", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
