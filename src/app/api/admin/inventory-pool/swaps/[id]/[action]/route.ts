import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { actOnSwap, type SwapAction } from "@/lib/inventory-pool";

const ALLOWED: SwapAction[] = ["accept", "reject", "complete"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;
  const { id, action } = await params;

  if (!id) return NextResponse.json({ error: "Swap id required" }, { status: 400 });
  if (!ALLOWED.includes(action as SwapAction)) {
    return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
  }
  const result = await actOnSwap(id, auth.user.dealer_id, action as SwapAction);
  if (!result.ok && process.env.DATABASE_URL) {
    return NextResponse.json({ error: "Swap not found or not authorized" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, status: result.status });
}
