/**
 * POST /api/admin/assistant/chat
 *
 * STUB: accepts a free-text prompt + (optional) conversation_id, returns
 * a list of matching actions via deterministic keyword scoring. NO LLM
 * call. NO external service.
 *
 * The conversational layer (year-one Q3-Q4) will replace the matcher
 * body with an actual LLM call coordinated with the Instinct team. This
 * stub locks the route contract so callers + tests can be built today.
 *
 * Safety:
 *   - Prompt rate limit: 60/hour per user (evaluatePromptGate).
 *   - Prompt-injection detection: refuse + log.
 *   - Empty / too-long prompts: refuse + log.
 *   - Conversation is logged to assistant_conversations + messages.
 *   - Audit log entry on every prompt that mutates DB state (i.e. always).
 *
 * Response shape (locked contract):
 *   { matched_actions: [{slug, display_name, confidence, ...}],
 *     is_stub: true,
 *     message: "...",
 *     conversation_id }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";
import { trackAssistant } from "@/lib/analytics-hooks";
import {
  appendMessage,
  evaluatePromptGate,
  listActions,
  matchActions,
  startConversation,
  type AssistantRole,
  type ChatStubResponse,
} from "@/lib/wolfpack-assistant";

interface ChatRequestBody {
  prompt?: string;
  conversation_id?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const promptGate = await evaluatePromptGate(auth.user.id, prompt);
  if (!promptGate.ok) {
    const status = promptGate.reason === "rate_limited" ? 429 : 400;
    return NextResponse.json(
      { error: promptGate.reason, is_stub: true, matched_actions: [] },
      { status },
    );
  }

  const sanitized = promptGate.sanitized;
  const role = (auth.user.role ?? "admin") as AssistantRole;
  const dealerId = auth.user.dealer_id;

  try {
    trackAssistant("assistant.chat_prompt_received", dealerId, {
      role,
      prompt_length: sanitized.length,
      conversation_id: body.conversation_id ?? "",
    });
  } catch { /* analytics must never block */ }

  // Start or attach to a conversation. v1: every prompt without an
  // explicit conversation_id starts a fresh conversation. The
  // conversational layer will manage session continuity itself.
  let conversationId = body.conversation_id ?? null;
  if (!conversationId) {
    if (!process.env.DATABASE_URL) {
      conversationId = "no-db";
    } else {
      try {
        const conv = await startConversation({
          dealer_id: dealerId,
          user_id: auth.user.id,
          user_role: role,
        });
        conversationId = conv.id;
        try {
          trackAssistant("assistant.conversation_started", dealerId, {
            conversation_id: conv.id,
            role,
          });
        } catch { /* analytics must never block */ }
      } catch (err) {
        // If we can't log, we still answer (degraded mode).
        console.error("[assistant/chat] startConversation failed:", err);
        conversationId = "degraded";
      }
    }
  }

  // Score the prompt against the action registry filtered to this role.
  const candidates = await listActions({ active_only: true, role, limit: 500 });
  const matched = matchActions(sanitized, role, candidates, { limit: 5 });

  for (const m of matched) {
    try {
      trackAssistant("assistant.action_proposed", dealerId, {
        slug: m.slug,
        confidence: m.confidence,
        is_stub: true,
      });
    } catch { /* analytics must never block */ }
  }

  // Log the user prompt + assistant response into the conversation log.
  // Failures are non-blocking — the user still gets their answer.
  if (process.env.DATABASE_URL && conversationId && conversationId !== "no-db" && conversationId !== "degraded") {
    try {
      await appendMessage({
        conversation_id: conversationId,
        dealer_id: dealerId,
        direction: "user",
        content: sanitized,
      });
      await appendMessage({
        conversation_id: conversationId,
        dealer_id: dealerId,
        direction: "assistant",
        content:
          matched.length === 0
            ? "No matching actions yet. Conversational layer not wired."
            : `Matched ${matched.length} candidate action(s): ${matched.map((m) => m.slug).join(", ")}`,
        proposed_action_slug: matched[0]?.slug ?? null,
        proposed_parameters: null,
      });
    } catch (err) {
      console.error("[assistant/chat] appendMessage failed:", err);
    }
  }

  void auditLog(
    "assistant.chat_prompt_received",
    {
      conversation_id: conversationId,
      role,
      prompt_length: sanitized.length,
      matched_count: matched.length,
      is_stub: true,
    },
    auth.user.id,
    dealerId,
  ).catch(() => {});

  const response: ChatStubResponse & { conversation_id: string } = {
    matched_actions: matched,
    is_stub: true,
    message:
      matched.length === 0
        ? "Conversational layer not yet wired. No matching actions for that prompt."
        : "Conversational layer not yet wired. Showing matched actions only.",
    conversation_id: conversationId ?? "no-db",
  };

  return NextResponse.json(response);
}
