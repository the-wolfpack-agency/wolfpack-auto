/**
 * POST /api/admin/deal-copilot/sessions/[id]/suggest
 *
 * Body: { snapshot: DealSnapshot, lender_programs?: LenderProgram[], market_median_price?: number }
 * Generates and persists 0..N suggestions across all six generators.
 *
 * Shadow-mode guard: when DATABASE_URL is unset, deal-copilot.generateSuggestions()
 * still runs every generator and returns synthesized in-memory rows.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackServerEvent } from "@/lib/analytics";
import {
  generateSuggestions,
  type DealSnapshot,
  type GenerateOptions,
} from "@/lib/deal-copilot";

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

  let body: { snapshot?: DealSnapshot } & GenerateOptions;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const snap = body.snapshot;
  if (!snap || typeof snap !== "object") {
    return NextResponse.json({ error: "snapshot is required" }, { status: 400 });
  }
  if (typeof snap.selling_price !== "number" || snap.selling_price <= 0) {
    return NextResponse.json({ error: "snapshot.selling_price must be > 0" }, { status: 400 });
  }
  if (typeof snap.term_months !== "number" || snap.term_months <= 0) {
    return NextResponse.json({ error: "snapshot.term_months must be > 0" }, { status: 400 });
  }
  if (typeof snap.apr !== "number" || snap.apr < 0) {
    return NextResponse.json({ error: "snapshot.apr must be >= 0" }, { status: 400 });
  }
  if (![1, 2, 3, 4, 5].includes(snap.credit_tier)) {
    return NextResponse.json({ error: "snapshot.credit_tier must be 1..5" }, { status: 400 });
  }

  const suggestions = await generateSuggestions(
    sessionId,
    authResult.user.dealer_id,
    snap,
    {
      lender_programs: body.lender_programs,
      market_median_price: body.market_median_price,
    },
  );

  await trackServerEvent("copilot.suggestions_generated", {
    dealer_id: authResult.user.dealer_id,
    session_id: sessionId,
    suggestion_count: suggestions.length,
  });

  return NextResponse.json({ suggestions, count: suggestions.length });
}
