/**
 * GET    /api/operator/dealers/[id] — dealer detail (operator view)
 * PATCH  /api/operator/dealers/[id] — { is_active } toggle suspend/resume
 * DELETE /api/operator/dealers/[id] — soft delete only (sets is_active=false + deleted_at)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireWolfpackStaff,
  isWolfpackStaff,
  getRequestIp,
} from "@/lib/operator-auth";
import { logStaffAction } from "@/lib/wolfpack-staff-audit";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireWolfpackStaff(request);
  if (!isWolfpackStaff(auth)) return auth;

  const params = await Promise.resolve(context.params);
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid dealer id" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      dealer: {
        id: params.id,
        name: "Demo Dealership",
        slug: "demo-dealership",
        phone: "(555) 555-0100",
        email: "sales@demo-dealer.example.com",
        is_active: true,
        created_at: "2026-03-25T00:00:00Z",
        user_count: 3,
        leads_count: 42,
        inventory_count: 87,
        onboarding_complete: true,
        last_activity_at: "2026-05-10T12:00:00Z",
      },
      recent_audit: [],
    });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `SELECT
         d.id, d.name, d.slug, d.phone, d.email, d.is_active, d.created_at,
         d.address, d.branding,
         COALESCE(u.cnt, 0)::int AS user_count,
         COALESCE(l.cnt, 0)::int AS leads_count,
         COALESCE(v.cnt, 0)::int AS inventory_count,
         u.last_activity_at
       FROM dealers d
       LEFT JOIN (SELECT dealer_id, COUNT(*)::int AS cnt, MAX(last_login) AS last_activity_at FROM dealer_users GROUP BY dealer_id) u ON u.dealer_id = d.id::text
       LEFT JOIN (SELECT dealer_id, COUNT(*)::int AS cnt FROM leads GROUP BY dealer_id) l ON l.dealer_id = d.id::text
       LEFT JOIN (SELECT dealer_id, COUNT(*)::int AS cnt FROM vehicles GROUP BY dealer_id) v ON v.dealer_id = d.id::text
       WHERE d.id = $1
       LIMIT 1`,
      [params.id],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Dealer not found" }, { status: 404 });
    }

    // Recent audit slice scoped to this dealer (best-effort)
    let recentAudit: unknown[] = [];
    try {
      const auditResult = await query(
        `SELECT id, staff_id, action, target_type, target_id, metadata, created_at
           FROM wolfpack_staff_audit_log
          WHERE target_type = 'dealer' AND target_id = $1
          ORDER BY created_at DESC
          LIMIT 20`,
        [params.id],
      );
      recentAudit = auditResult.rows;
    } catch { /* table may not exist yet pre-migration */ }

    return NextResponse.json({
      dealer: result.rows[0],
      recent_audit: recentAudit,
    });
  } catch (err) {
    console.error("[operator/dealers/[id]] GET error:", err);
    return NextResponse.json({ error: "Failed to load dealer" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;

  const params = await Promise.resolve(context.params);
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid dealer id" }, { status: 400 });
  }

  let body: { is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "is_active (boolean) required" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    await logStaffAction({
      staffId: auth.staff.id,
      action: body.is_active ? "operator.dealer_resumed" : "operator.dealer_suspended",
      targetType: "dealer",
      targetId: params.id,
      metadata: { is_active: body.is_active },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true, id: params.id, is_active: body.is_active });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `UPDATE dealers SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, is_active`,
      [body.is_active, params.id],
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Dealer not found" }, { status: 404 });
    }

    await logStaffAction({
      staffId: auth.staff.id,
      action: body.is_active ? "operator.dealer_resumed" : "operator.dealer_suspended",
      targetType: "dealer",
      targetId: params.id,
      metadata: { is_active: body.is_active },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true, dealer: result.rows[0] });
  } catch (err) {
    console.error("[operator/dealers/[id]] PATCH error:", err);
    return NextResponse.json({ error: "Failed to update dealer" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  // Hard delete is admin-only — soft delete is operator+.
  const auth = await requireWolfpackStaff(request, "admin");
  if (!isWolfpackStaff(auth)) return auth;

  const params = await Promise.resolve(context.params);
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Invalid dealer id" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    await logStaffAction({
      staffId: auth.staff.id,
      action: "operator.dealer_soft_deleted",
      targetType: "dealer",
      targetId: params.id,
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true, id: params.id, soft_deleted: true });
  }

  try {
    const { query } = await import("@/lib/db");

    // Try soft-delete first (sets deleted_at if column exists).
    let result;
    try {
      result = await query(
        `UPDATE dealers
            SET is_active = false, deleted_at = NOW(), updated_at = NOW()
          WHERE id = $1
          RETURNING id, name`,
        [params.id],
      );
    } catch (err: unknown) {
      // deleted_at column may not exist on older deployments — fall back.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("deleted_at") || msg.includes("42703")) {
        result = await query(
          `UPDATE dealers
              SET is_active = false, updated_at = NOW()
            WHERE id = $1
            RETURNING id, name`,
          [params.id],
        );
      } else {
        throw err;
      }
    }

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Dealer not found" }, { status: 404 });
    }

    await logStaffAction({
      staffId: auth.staff.id,
      action: "operator.dealer_soft_deleted",
      targetType: "dealer",
      targetId: params.id,
      metadata: { name: (result.rows[0] as { name?: string }).name ?? "" },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ ok: true, soft_deleted: true, dealer: result.rows[0] });
  } catch (err) {
    console.error("[operator/dealers/[id]] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete dealer" }, { status: 500 });
  }
}
