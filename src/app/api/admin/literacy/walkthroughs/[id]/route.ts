/**
 * GET    /api/admin/literacy/walkthroughs/[id] — load a walkthrough (any staff)
 * PATCH  /api/admin/literacy/walkthroughs/[id] — refine in place (operator+)
 * DELETE /api/admin/literacy/walkthroughs/[id] — remove (admin)
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
  deleteWalkthrough,
  getWalkthroughById,
  patchWalkthrough,
} from "@/lib/literacy-walkthroughs";
import type { PatchWalkthroughInput } from "@/lib/literacy-walkthroughs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONTOLOGY_AUDIT_KEY = "wolfpack-ontology";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireWolfpackStaff(request);
  if (!isWolfpackStaff(auth)) return auth;
  const params = await Promise.resolve(context.params);
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const walkthrough = await getWalkthroughById(params.id);
    if (!walkthrough) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ walkthrough });
  } catch (err) {
    console.error("[literacy/walkthroughs/[id]] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load walkthrough" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireWolfpackStaff(request, "operator");
  if (!isWolfpackStaff(auth)) return auth;
  const params = await Promise.resolve(context.params);
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  let body: PatchWalkthroughInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const walkthrough = await patchWalkthrough(params.id, body);
    if (!walkthrough) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    trackLiteracy("literacy.walkthrough_updated", ONTOLOGY_AUDIT_KEY, {
      walkthrough_id: walkthrough.id,
      slug: walkthrough.slug,
      role: walkthrough.role,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.walkthrough_updated",
      targetType: "literacy_walkthrough",
      targetId: walkthrough.id,
      metadata: { ...body },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ walkthrough });
  } catch (err) {
    if (err instanceof LiteracyValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    console.error("[literacy/walkthroughs/[id]] PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update walkthrough" },
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
  const params = await Promise.resolve(context.params);
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    const ok = await deleteWalkthrough(params.id);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    trackLiteracy("literacy.walkthrough_deleted", ONTOLOGY_AUDIT_KEY, {
      walkthrough_id: params.id,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.walkthrough_deleted",
      targetType: "literacy_walkthrough",
      targetId: params.id,
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[literacy/walkthroughs/[id]] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete walkthrough" },
      { status: 500 },
    );
  }
}
