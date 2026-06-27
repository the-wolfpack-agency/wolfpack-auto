/**
 * PATCH  /api/admin/literacy/actions/[id] — refine an action (operator+)
 * DELETE /api/admin/literacy/actions/[id] — delete an action (admin)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireWolfpackStaff,
  isWolfpackStaff,
  getRequestIp,
} from "@/lib/operator-auth";
import { logStaffAction } from "@/lib/wolfpack-staff-audit";
import { trackLiteracy } from "@/lib/analytics-hooks";
import {
  deleteAction,
  patchAction,
  LiteracyValidationError,
} from "@/lib/literacy-ontology";
import type { PatchActionInput } from "@/lib/literacy-ontology";

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
  let body: PatchActionInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const action = await patchAction(params.id, body);
    if (!action) return NextResponse.json({ error: "Not found" }, { status: 404 });
    trackLiteracy("literacy.action_updated", ONTOLOGY_AUDIT_KEY, {
      action_id: action.id,
      role: action.role,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.action_updated",
      targetType: "literacy_action",
      targetId: action.id,
      metadata: { ...body },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ action });
  } catch (err) {
    if (err instanceof LiteracyValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    console.error("[literacy/actions/[id]] PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update action" },
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
    const ok = await deleteAction(params.id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    trackLiteracy("literacy.action_deleted", ONTOLOGY_AUDIT_KEY, {
      action_id: params.id,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.action_deleted",
      targetType: "literacy_action",
      targetId: params.id,
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[literacy/actions/[id]] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete action" },
      { status: 500 },
    );
  }
}
