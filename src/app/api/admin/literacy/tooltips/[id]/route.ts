/**
 * PATCH  /api/admin/literacy/tooltips/[id] — refine wording (operator+)
 * DELETE /api/admin/literacy/tooltips/[id] — remove a tooltip (admin)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireWolfpackStaff,
  isWolfpackStaff,
  getRequestIp,
} from "@/lib/operator-auth";
import { logStaffAction } from "@/lib/wolfpack-staff-audit";
import { trackLiteracy } from "@/lib/analytics-hooks";
import { LiteracyValidationError } from "@/lib/literacy-ontology";
import {
  deleteTooltip,
  patchTooltip,
} from "@/lib/literacy-walkthroughs";
import type { PatchTooltipInput } from "@/lib/literacy-walkthroughs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONTOLOGY_AUDIT_KEY = "wolfpack-ontology";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;
  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): degrade gracefully instead of crashing.
    return NextResponse.json(
      { error: "service_unavailable", shadow: true },
      { status: 503 },
    );
  }
  const params = await Promise.resolve(context.params);
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  let body: PatchTooltipInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const tooltip = await patchTooltip(params.id, body);
    if (!tooltip) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    trackLiteracy("literacy.tooltip_updated", ONTOLOGY_AUDIT_KEY, {
      tooltip_id: tooltip.id,
      role: tooltip.role,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.tooltip_updated",
      targetType: "literacy_tooltip",
      targetId: tooltip.id,
      metadata: { ...body },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ tooltip });
  } catch (err) {
    if (err instanceof LiteracyValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    console.error("[literacy/tooltips/[id]] PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update tooltip" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireWolfpackStaff(request, "admin");
  if (!isWolfpackStaff(auth)) return auth;
  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): degrade gracefully instead of crashing.
    return NextResponse.json(
      { error: "service_unavailable", shadow: true },
      { status: 503 },
    );
  }
  const params = await Promise.resolve(context.params);
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const ok = await deleteTooltip(params.id);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    trackLiteracy("literacy.tooltip_deleted", ONTOLOGY_AUDIT_KEY, {
      tooltip_id: params.id,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.tooltip_deleted",
      targetType: "literacy_tooltip",
      targetId: params.id,
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[literacy/tooltips/[id]] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete tooltip" },
      { status: 500 },
    );
  }
}
