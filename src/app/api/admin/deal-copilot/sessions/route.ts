/**
 * POST /api/admin/deal-copilot/sessions — open a new copilot session for a deal.
 *
 * Shadow-mode guard: when DATABASE_URL is unset, deal-copilot.openSession()
 * synthesizes a shadow session and returns it without touching Postgres.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackServerEvent } from "@/lib/analytics";
import { openSession } from "@/lib/deal-copilot";

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  let body: { deal_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.deal_id || typeof body.deal_id !== "string") {
    return NextResponse.json({ error: "deal_id is required" }, { status: 400 });
  }

  const session = await openSession({
    dealer_id: authResult.user.dealer_id,
    deal_id: body.deal_id,
    opened_by_user_id: authResult.user.id,
  });

  await trackServerEvent("copilot.session_opened", {
    dealer_id: authResult.user.dealer_id,
    session_id: session.id,
    deal_id: session.deal_id,
  });

  return NextResponse.json({ session }, { status: 201 });
}
