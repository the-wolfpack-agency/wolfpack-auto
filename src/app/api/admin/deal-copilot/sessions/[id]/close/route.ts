/**
 * POST /api/admin/deal-copilot/sessions/[id]/close
 *
 * Body: { outcome: "won"|"lost", close_reason?: string, gross_profit_cents?: number }
 * Persists outcome row, closes session, and updates per-generator weights.
 *
 * Shadow-mode guard: when DATABASE_URL is unset, recordOutcome() returns
 * { outcome_id: null, weights_updated: 0 } without throwing.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackServerEvent } from "@/lib/analytics";
import { recordOutcome } from "@/lib/deal-copilot";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { id: sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json({ error: "session id required" }, { status: 400 });
  }

  let body: { outcome?: string; close_reason?: string; gross_profit_cents?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.outcome !== "won" && body.outcome !== "lost") {
    return NextResponse.json({ error: "outcome must be 'won' or 'lost'" }, { status: 400 });
  }

  const result = await recordOutcome({
    session_id: sessionId,
    dealer_id: authResult.user.dealer_id,
    outcome: body.outcome,
    close_reason: body.close_reason,
    gross_profit_cents: body.gross_profit_cents,
  });

  const eventName =
    body.outcome === "won" ? "copilot.session_closed_won" : "copilot.session_closed_lost";
  await trackServerEvent(eventName, {
    dealer_id: authResult.user.dealer_id,
    session_id: sessionId,
    weights_updated: result.weights_updated,
    gross_profit_cents: body.gross_profit_cents ?? 0,
  });

  return NextResponse.json({
    outcome_id: result.outcome_id,
    weights_updated: result.weights_updated,
  });
}
