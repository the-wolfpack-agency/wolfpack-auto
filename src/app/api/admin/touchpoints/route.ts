/**
 * GET /api/admin/touchpoints
 *
 * Returns the most recent touchpoint events for the current tenant.
 * Used by `src/app/admin/touchpoints/page.tsx` to render the recent-
 * scans table.
 *
 * Auth: requireAuth.
 *
 * Query params:
 *   - limit  (default 50, max 200)
 *   - type   (optional -- filter by touchpoint_type)
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import {
  TOUCHPOINT_TYPES,
  type TouchpointEventRow,
  type TouchpointType,
} from "@/lib/touchpoints";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10), 1),
    200,
  );
  const typeParam = url.searchParams.get("type") ?? null;
  const type = (TOUCHPOINT_TYPES as readonly string[]).includes(typeParam ?? "")
    ? (typeParam as TouchpointType)
    : null;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ events: [], count: 0 });
  }

  try {
    const { query } = await import("@/lib/db");
    const params: unknown[] = [auth.user.dealer_id];
    let where = `WHERE tenant_id = $1`;
    if (type) {
      params.push(type);
      where += ` AND touchpoint_type = $${params.length}`;
    }
    params.push(limit);
    const result = await query<TouchpointEventRow>(
      `SELECT id, tenant_id::text, touchpoint_type, touchpoint_id, payload,
              customer_id::text, device_fingerprint, scanned_at,
              action_triggered_slug, outcome, outcome_detail,
              ip_address::text, user_agent
         FROM touchpoint_events
         ${where}
         ORDER BY scanned_at DESC
         LIMIT $${params.length}`,
      params,
    );
    return NextResponse.json({
      events: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    console.error("[admin/touchpoints] GET error:", err);
    return NextResponse.json({ events: [], count: 0 });
  }
}
