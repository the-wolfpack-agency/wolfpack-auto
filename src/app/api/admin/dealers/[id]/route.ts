import { NextRequest, NextResponse } from "next/server";
import { requireRole, isAuthenticated } from "@/lib/auth-guard";
import { AGENCY_DEALER_ROLES } from "@/lib/dealers/agency-roles";
import { trackSystem } from "@/lib/analytics-hooks";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireRole(AGENCY_DEALER_ROLES);
  if (!isAuthenticated(authResult)) return authResult;
  const { id } = await params;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ deleted: true, id });
  }

  try {
    const { query } = await import("@/lib/db");
    await query( /* audit-safe: A4 reason="agency-level dealer deactivation (owner role required above)" */`UPDATE dealers SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
    try { trackSystem("agency.dealer_toggled", authResult?.user?.dealer_id ?? "system", { action: "dealer_deactivated", target_dealer_id: id }); } catch {}
    return NextResponse.json({ deleted: true, id });
  } catch (err) {
    console.error("[dealers] Delete error:", err);
    return NextResponse.json({ error: "Failed to delete dealer" }, { status: 500 });
  }
}
