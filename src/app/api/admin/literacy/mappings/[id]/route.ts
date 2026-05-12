/**
 * DELETE /api/admin/literacy/mappings/[id] — delete a mapping (admin)
 *
 * Mappings are not patchable; refining a relation means delete + re-create.
 * That keeps the ontology audit trail clean and the Neo4j edge label honest.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireWolfpackStaff,
  isWolfpackStaff,
  getRequestIp,
} from "@/lib/operator-auth";
import { logStaffAction } from "@/lib/wolfpack-staff-audit";
import { trackLiteracy } from "@/lib/analytics-hooks";
import { deleteMapping } from "@/lib/literacy-ontology";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ONTOLOGY_AUDIT_KEY = "wolfpack-ontology";

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
    const ok = await deleteMapping(params.id);
    if (!ok) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    trackLiteracy("literacy.mapping_deleted", ONTOLOGY_AUDIT_KEY, {
      mapping_id: params.id,
      staff_id: auth.staff.id,
    });
    await logStaffAction({
      staffId: auth.staff.id,
      action: "literacy.mapping_deleted",
      targetType: "literacy_mapping",
      targetId: params.id,
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[literacy/mappings/[id]] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete mapping" },
      { status: 500 },
    );
  }
}
