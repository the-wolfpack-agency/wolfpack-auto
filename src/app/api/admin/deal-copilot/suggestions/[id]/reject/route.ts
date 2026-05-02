/**
 * POST /api/admin/deal-copilot/suggestions/[id]/reject
 *
 * Body: { reason?: string }
 *
 * Shadow-mode guard: when DATABASE_URL is unset, rejectSuggestion() returns
 * null and the route still 200s — analytics fires regardless.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackServerEvent } from "@/lib/analytics";
import { rejectSuggestion } from "@/lib/deal-copilot";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "suggestion id required" }, { status: 400 });
  }

  let body: { reason?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is acceptable for a reject
  }

  const suggestion = await rejectSuggestion(id, body.reason ?? "");

  await trackServerEvent("copilot.suggestion_rejected", {
    dealer_id: authResult.user.dealer_id,
    suggestion_id: id,
    persisted: suggestion !== null,
    reason: body.reason ?? "",
  });

  return NextResponse.json({ suggestion });
}
