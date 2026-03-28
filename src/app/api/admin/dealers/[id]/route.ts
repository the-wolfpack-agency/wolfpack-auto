import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const { id } = await params;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ deleted: true, id });
  }

  try {
    const { query } = await import("@/lib/db");
    await query(`UPDATE dealers SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
    return NextResponse.json({ deleted: true, id });
  } catch (err) {
    console.error("[dealers] Delete error:", err);
    return NextResponse.json({ error: "Failed to delete dealer" }, { status: 500 });
  }
}
