import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { handleOpportunityAction, type OpportunityAction } from "@/lib/auction-feed";

const ALLOWED: OpportunityAction[] = ["bid", "won", "lost", "dismiss"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;
  const dealerId = auth.user.dealer_id;
  const { id, action } = await params;

  if (!id) return NextResponse.json({ error: "Opportunity id required" }, { status: 400 });
  if (!ALLOWED.includes(action as OpportunityAction)) {
    return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
  }

  try {
    const result = await handleOpportunityAction(dealerId, id, action as OpportunityAction);
    if (!result.ok && process.env.DATABASE_URL) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    console.error("[auction/opportunity-action] error:", err);
    return NextResponse.json({ error: "Failed to update opportunity" }, { status: 500 });
  }
}
