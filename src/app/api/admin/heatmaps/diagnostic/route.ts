/**
 * GET /api/admin/heatmaps/diagnostic
 *
 * Read-only debug endpoint for diagnosing "why is the heatmap empty"
 * regressions. Returns:
 *   - resolved_dealer_id (what the route filters by)
 *   - dealer_ids_in_db   (what's actually stamped on rows, top 10)
 *   - pages_in_db        (top 10 page values, regardless of dealer)
 *   - row_count_total    (analytics_events row count for the window)
 *   - row_count_for_dealer (rows the route's filter would match)
 *
 * If resolved_dealer_id is missing from dealer_ids_in_db, that's the
 * mismatch — fix it on the ingest side.
 *
 * Auth: same gate as the rest of /api/admin/*. Cheap diagnostic
 * queries (LIMIT 10, indexed columns).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      error: "no_database",
      message: "DATABASE_URL unset; nothing to diagnose",
    });
  }

  const hostname =
    request.headers.get("host") ?? new URL(request.url).hostname;
  let resolvedDealerId: string = getDealerId(auth);
  try {
    const { resolveTenant } = await import("@/lib/tenant-resolver");
    const tenant = await resolveTenant(hostname);
    if (tenant?.dealer?.id) resolvedDealerId = tenant.dealer.id;
  } catch {
    /* keep getDealerId fallback */
  }

  const { query } = await import("@/lib/db");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [dealerIds, pages, totalCount, dealerCount] = await Promise.all([
    query(
      `SELECT metadata->>'dealer_id' AS dealer_id, COUNT(*)::int AS rows
         FROM analytics_events
        WHERE timestamp >= $1
        GROUP BY metadata->>'dealer_id'
        ORDER BY rows DESC
        LIMIT 10`,
      [since],
    ),
    query(
      `SELECT page, COUNT(*)::int AS rows
         FROM analytics_events
        WHERE timestamp >= $1
        GROUP BY page
        ORDER BY rows DESC
        LIMIT 10`,
      [since],
    ),
    query(
      `SELECT COUNT(*)::int AS rows
         FROM analytics_events
        WHERE timestamp >= $1`,
      [since],
    ),
    query(
      `SELECT COUNT(*)::int AS rows
         FROM analytics_events
        WHERE timestamp >= $1
          AND metadata->>'dealer_id' = $2`,
      [since, resolvedDealerId],
    ),
  ]);

  return NextResponse.json({
    hostname,
    resolved_dealer_id: resolvedDealerId,
    env_dealer_id: process.env.DEALER_ID ?? null,
    auth_user_dealer_id:
      "user" in auth ? (auth.user as { dealer_id?: string }).dealer_id ?? null : null,
    window_hours: 24,
    row_count_total: Number(totalCount.rows[0]?.rows ?? 0),
    row_count_for_resolved_dealer: Number(dealerCount.rows[0]?.rows ?? 0),
    dealer_ids_in_db: dealerIds.rows,
    pages_in_db: pages.rows,
  });
}
