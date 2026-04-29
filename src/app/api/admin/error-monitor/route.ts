import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { getDemoErrors } from "@/lib/error-monitor";
import { trackErrorMonitor, trackSystem } from "@/lib/analytics-hooks";

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

    trackErrorMonitor("error.trend_detected", dealerId, {
      error_count: errors.length,
      total_24h: Number(stats.rows[0]?.total_errors_24h ?? 0),
      total_7d: Number(stats.rows[0]?.total_errors_7d ?? 0),
    });
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
      /* Two writes on a resolve:
         1. Mark any captured client_errors rows resolved (no-op if the
            error never landed in the durable store — common in shadow
            demos where errors are mocked).
         2. Persist the dismissal in error_monitor_resolutions keyed on
            (dealer_id, error_id) so the UI no longer needs the
            localStorage shim — a different browser / cleared cache will
            still see the resolution.
         Both wrapped in try/catch so a missing table on either side
         doesn't drop the other. */
      try {
        await query(
          `UPDATE client_errors SET resolved_at = NOW() WHERE fingerprint = $1 AND dealer_id = $2`,
          [fingerprint, dealerId],
        );
      } catch (err) {
        const innerMsg = err instanceof Error ? err.message : "";
        if (!/does not exist/i.test(innerMsg)) throw err;
      }

      let durable = false;
      try {
        await query(
          `INSERT INTO error_monitor_resolutions (dealer_id, error_id, resolved_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (dealer_id, error_id)
           DO UPDATE SET resolved_at = NOW()`,
          [dealerId, fingerprint],
        );
        durable = true;
      } catch (err) {
        const innerMsg = err instanceof Error ? err.message : "";
        if (!/does not exist/i.test(innerMsg)) throw err;
      }

      trackErrorMonitor("error.resolved", dealerId, { fingerprint });
      if (durable) {
        try { trackErrorMonitor("error.resolved_durable", dealerId, { fingerprint }); } catch {}
        try { trackSystem("system.error_resolution_persisted", dealerId, { fingerprint }); } catch {}
      } else {
        try { trackErrorMonitor("error.resolved_shadow", dealerId, { fingerprint }); } catch {}
        try { trackSystem("system.error_resolution_persisted_shadow", dealerId, { fingerprint }); } catch {}
      }
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
