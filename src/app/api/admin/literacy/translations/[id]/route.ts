/**
 * PATCH  /api/admin/literacy/translations/[id] — refine wording (operator+)
 * DELETE /api/admin/literacy/translations/[id] — remove a translation (admin)
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
  deleteTranslation,
  patchTranslation,
  LiteracyValidationError,
} from "@/lib/literacy-ontology";
import type { PatchTranslationInput } from "@/lib/literacy-ontology";

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
  let body: PatchTranslationInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const translation = await patchTranslation(params.id, body);
    if (!translation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    trackLiteracy("literacy.translation_updated", ONTOLOGY_AUDIT_KEY, {
      translation_id: translation.id,
      role: translation.role,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.translation_updated",
      targetType: "literacy_translation",
      targetId: translation.id,
      metadata: { ...body },
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ translation });
  } catch (err) {
    if (err instanceof LiteracyValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    console.error("[literacy/translations/[id]] PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update translation" },
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
    const ok = await deleteTranslation(params.id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    trackLiteracy("literacy.translation_deleted", ONTOLOGY_AUDIT_KEY, {
      translation_id: params.id,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.translation_deleted",
      targetType: "literacy_translation",
      targetId: params.id,
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[literacy/translations/[id]] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete translation" },
      { status: 500 },
    );
  }
}
