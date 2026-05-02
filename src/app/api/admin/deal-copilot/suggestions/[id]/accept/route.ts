/**
 * POST /api/admin/deal-copilot/suggestions/[id]/accept
 *
 * Shadow-mode guard: when DATABASE_URL is unset, acceptSuggestion() returns
 * null and the route still 200s — analytics fires regardless.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackServerEvent } from "@/lib/analytics";
import { acceptSuggestion } from "@/lib/deal-copilot";

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

  const suggestion = await acceptSuggestion(id, authResult.user.id);

  await trackServerEvent("copilot.suggestion_accepted", {
    dealer_id: authResult.user.dealer_id,
    suggestion_id: id,
    persisted: suggestion !== null,
    suggestion_type: suggestion?.suggestion_type ?? "unknown",
  });

  return NextResponse.json({ suggestion });
}
