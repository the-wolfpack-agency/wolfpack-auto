import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { getDemoErrors } from "@/lib/error-monitor";

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/error-monitor — Error list with trends                      */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    const errors = getDemoErrors();
    return NextResponse.json({
      errors,
      total_errors_24h: 91,
      total_errors_7d: 312,
      resolved_7d: 14,
    });
  }

  // --- Live mode ---
  const dealerId = getDealerId(authResult);
  try {
    const { query } = await import("@/lib/db");

    const rows = await query(
      `SELECT
         fingerprint,
         MIN(message) AS message,
         COUNT(*) AS count,
         ARRAY_AGG(DISTINCT page_url) AS affected_pages,
         COUNT(DISTINCT session_id) AS affected_sessions,
         MIN(captured_at) AS first_seen,
         MAX(captured_at) AS last_seen,
         MIN(stack) AS sample_stack
       FROM client_errors
       WHERE dealer_id = $1
       GROUP BY fingerprint
       ORDER BY COUNT(*) * COUNT(DISTINCT session_id) DESC
       LIMIT 100`,
      [dealerId],
    );

    const errors = rows.rows.map((row: Record<string, unknown>) => ({
      ...row,
      impact_score: Number(row.count ?? 0) * Number(row.affected_sessions ?? 1),
    }));

    const stats = await query(
      `SELECT
         COUNT(*) FILTER (WHERE captured_at > NOW() - INTERVAL '24 hours') AS total_errors_24h,
         COUNT(*) FILTER (WHERE captured_at > NOW() - INTERVAL '7 days') AS total_errors_7d,
         COUNT(DISTINCT fingerprint) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at > NOW() - INTERVAL '7 days') AS resolved_7d
       FROM client_errors WHERE dealer_id = $1`,
      [dealerId],
    );

    return NextResponse.json({
      errors,
      total_errors_24h: Number(stats.rows[0]?.total_errors_24h ?? 0),
      total_errors_7d: Number(stats.rows[0]?.total_errors_7d ?? 0),
      resolved_7d: Number(stats.rows[0]?.resolved_7d ?? 0),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      const errors = getDemoErrors();
      return NextResponse.json({
        errors,
        total_errors_24h: 0,
        total_errors_7d: 0,
        resolved_7d: 0,
      });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*  POST /api/admin/error-monitor — Receive client errors (admin context)      */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const dealerId = getDealerId(authResult);
  const body = await request.json();
  const { fingerprint, action } = body;

  if (!fingerprint || !action) {
    return NextResponse.json({ error: "fingerprint and action required" }, { status: 400 });
  }

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ success: true, action, fingerprint, mode: "shadow" });
  }

  // --- Live mode ---
  try {
    const { query } = await import("@/lib/db");

    if (action === "resolve") {
      await query(
        `UPDATE client_errors SET resolved_at = NOW() WHERE fingerprint = $1 AND dealer_id = $2`,
        [fingerprint, dealerId],
      );
    }

    return NextResponse.json({ success: true, action, fingerprint });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ success: true, action, fingerprint, mode: "shadow" });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
