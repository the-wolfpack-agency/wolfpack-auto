/**
 * GET /api/admin/touchpoints/:id
 *
 * Auth-gated read of a single touchpoint event for the current tenant.
 * Used by the admin recent-scans page to render the per-event drill-in.
 *
 * Auth: requireAuth (tenant-admin). The query also filters on
 * `tenant_id = session.user.dealer_id` as defense-in-depth above the
 * RLS policy.
 *
 * Responses:
 *   200 -- the touchpoint_events row (JSON)
 *   400 -- malformed UUID id
 *   401 -- unauthenticated (returned by requireAuth)
 *   403 -- belongs to a different tenant
 *   404 -- not found
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import type { TouchpointEventRow } from "@/lib/touchpoints";

const UUID_PATTERN = /^[0-9a-fA-F-]{36}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    // Shadow mode -- return a deterministic stub so the admin page is
    // still navigable during local development without Postgres.
    return NextResponse.json(
      {
        event: {
          id,
          tenant_id: auth.user.dealer_id,
          touchpoint_type: "qr",
          touchpoint_id: "demo-walkaround",
          payload: { format: "wolfpack_uri" },
          customer_id: null,
          device_fingerprint: null,
          scanned_at: new Date().toISOString(),
          action_triggered_slug: "inventory.feature_vehicle",
          outcome: "action_triggered",
          outcome_detail: null,
          ip_address: null,
          user_agent: null,
        } satisfies TouchpointEventRow,
      },
      { status: 200 },
    );
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query<TouchpointEventRow>(
      `SELECT id, tenant_id::text, touchpoint_type, touchpoint_id, payload,
              customer_id::text, device_fingerprint, scanned_at,
              action_triggered_slug, outcome, outcome_detail,
              ip_address::text, user_agent
         FROM touchpoint_events
        WHERE id = $1
        LIMIT 1`,
      [id],
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const event = result.rows[0];
    if (event.tenant_id !== auth.user.dealer_id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ event }, { status: 200 });
  } catch (err) {
    console.error("[admin/touchpoints/:id] GET error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
