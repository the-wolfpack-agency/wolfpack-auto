/**
 * GET /api/admin/assistant/conversations
 *
 * List conversation history for the current dealer. Optional ?user_id=…
 * filter restricts to a single user (useful for "show me my chats").
 *
 * Dealer-scoped — RLS on assistant_conversations enforces dealer
 * isolation at the database layer; this route adds the application-layer
 * `dealer_id = session.dealer_id` guard as a belt-and-suspenders.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackAssistant } from "@/lib/analytics-hooks";
import {
  listConversationsForDealer,
} from "@/lib/wolfpack-assistant";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  const url = request.nextUrl;
  const userIdFilter = url.searchParams.get("user_id") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(Number(limitParam) || 50, 1), 500) : 50;

  try {
    const conversations = await listConversationsForDealer(auth.user.dealer_id, {
      user_id: userIdFilter,
      limit,
    });

    try {
      trackAssistant("assistant.conversation_ended", auth.user.dealer_id, {
        list_view: true,
        user_filter: userIdFilter ?? "",
        result_count: conversations.length,
      });
    } catch { /* analytics must never block */ }

    return NextResponse.json({
      conversations,
      count: conversations.length,
    });
  } catch (err) {
    console.error("[assistant/conversations] GET error:", err);
    return NextResponse.json({ conversations: [], count: 0 });
  }
}
