/**
 * POST /api/admin/assistant/chat
 *
 * Maps a user's free-text prompt to ONE OR MORE typed assistant actions
 * via the deterministic intent mapper (src/lib/wolfpack-assistant/intent-
 * mapper). Returns MapperResult-shaped data; ALSO surfaces the legacy
 * `matched_actions` array so existing callers + UI keep working until
 * they migrate to the richer shape.
 *
 * The mapper itself is purely deterministic — no LLM call. The Q3
 * conversational layer will replace `llm-tiebreaker.ts`'s stub with a
 * real LLM-backed resolver; the route contract DOES NOT change.
 *
 * Safety:
 *   - Prompt rate limit: 60/hour per user (evaluatePromptGate).
 *   - Prompt-injection detection: refuse + log.
 *   - Empty / too-long prompts: refuse + log.
 *   - Conversation is logged to assistant_conversations + messages.
 *   - Audit log entry on every prompt that mutates DB state (i.e. always).
 *
 * Response shape (additive; legacy fields preserved):
 *   {
 *     matched_actions: [...]      // legacy shape, top N matches as MatchedAction
 *     mapper: {
 *       matches: IntentMatch[],
 *       best_match: IntentMatch | null,
 *       is_ambiguous: boolean,
 *       unmatched_tokens: string[],
 *     },
 *     is_stub: true,              // until Q3 LLM tiebreaker lands
 *     message: string,
 *     conversation_id: string,
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";
import { trackAssistant } from "@/lib/analytics-hooks";
import {
  appendMessage,
  evaluatePromptGate,
  getTenantVertical,
  listActions,
  mapIntent,
  startConversation,
  type AssistantRole,
  type ChatStubResponse,
  type IntentMatch,
  type MapperResult,
} from "@/lib/wolfpack-assistant";

interface ChatRequestBody {
  prompt?: string;
  conversation_id?: string;
}

/**
 * Convert IntentMatch[] into the legacy MatchedAction[] shape so the
 * existing UI surfaces don't break when the new mapper output rolls out.
 * The legacy shape lacks `parameters` + `reasoning`; richer callers should
 * read from `mapper.matches` instead.
 */
function intentMatchesToLegacy(
  matches: ReadonlyArray<IntentMatch>,
  catalog: Map<string, { display_name: string; description: string; category: string | null; side_effect: "read" | "mutating" | "irreversible"; dry_run_supported: boolean }>,
) {
  return matches.map((m) => {
    const meta = catalog.get(m.action_slug);
    return {
      slug: m.action_slug,
      display_name: meta?.display_name ?? m.action_slug,
      description: meta?.description ?? m.reasoning,
      category: (meta?.category ?? null) as ChatStubResponse["matched_actions"][number]["category"],
      side_effect: (meta?.side_effect ?? "read") as ChatStubResponse["matched_actions"][number]["side_effect"],
      dry_run_supported: meta?.dry_run_supported ?? false,
      confidence: m.confidence,
      parameter_hints: Object.fromEntries(
        Object.entries(m.parameters).map(([k, v]) => [k, String(v)]),
      ),
    };
  });
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
  // explicit conversation_id starts a fresh conversation.
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
        console.error("[assistant/chat] startConversation failed:", err);
        conversationId = "degraded";
      }
    }
  }

  // Resolve the tenant's vertical so the candidate set respects the
  // vertical filter (action.vertical = tenant_vertical OR 'any').
  const tenantVertical = await getTenantVertical(dealerId);

  // Load role-appropriate, vertical-appropriate active actions.
  const candidates = await listActions({
    active_only: true,
    role,
    vertical: tenantVertical,
    limit: 500,
  });

  // Run the deterministic intent mapper.
  let mapperResult: MapperResult;
  try {
    mapperResult = await mapIntent(sanitized, {
      role,
      dealerId,
      availableActions: candidates,
    });
  } catch (err) {
    console.error("[assistant/chat] mapIntent failed:", err);
    mapperResult = {
      matches: [],
      best_match: null,
      is_ambiguous: false,
      unmatched_tokens: [],
    };
  }

  // Emit per-outcome analytics.
  try {
    if (mapperResult.matches.length === 0) {
      trackAssistant("assistant.intent_unmatched", dealerId, {
        role,
        unmatched_tokens: mapperResult.unmatched_tokens.join(","),
      });
    } else if (mapperResult.is_ambiguous) {
      trackAssistant("assistant.intent_ambiguous", dealerId, {
        role,
        top_slug: mapperResult.best_match?.action_slug ?? "",
        top_confidence: mapperResult.best_match?.confidence ?? 0,
        candidate_count: mapperResult.matches.length,
      });
    } else if (mapperResult.best_match) {
      trackAssistant("assistant.intent_matched", dealerId, {
        role,
        slug: mapperResult.best_match.action_slug,
        confidence: mapperResult.best_match.confidence,
        source: mapperResult.best_match.source,
      });
      const paramKeys = Object.keys(mapperResult.best_match.parameters);
      if (paramKeys.length > 0) {
        trackAssistant("assistant.parameter_extracted", dealerId, {
          slug: mapperResult.best_match.action_slug,
          param_keys: paramKeys.join(","),
          param_count: paramKeys.length,
        });
      }
    }
    // Also emit the legacy action_proposed events so existing dashboards
    // that watch them keep updating.
    for (const m of mapperResult.matches) {
      trackAssistant("assistant.action_proposed", dealerId, {
        slug: m.action_slug,
        confidence: m.confidence,
        is_stub: true,
      });
    }
  } catch { /* analytics must never block */ }

  // Build catalog map for legacy shape conversion.
  const catalog = new Map(
    candidates.map((a) => [
      a.slug,
      {
        display_name: a.display_name,
        description: a.description,
        category: a.category,
        side_effect: a.side_effect,
        dry_run_supported: a.dry_run_supported,
      },
    ]),
  );
  const legacyMatched = intentMatchesToLegacy(mapperResult.matches, catalog);

  // Log the user prompt + assistant response into the conversation log.
  if (
    process.env.DATABASE_URL &&
    conversationId &&
    conversationId !== "no-db" &&
    conversationId !== "degraded"
  ) {
    try {
      await appendMessage({
        conversation_id: conversationId,
        dealer_id: dealerId,
        direction: "user",
        content: sanitized,
      });
      const best = mapperResult.best_match;
      await appendMessage({
        conversation_id: conversationId,
        dealer_id: dealerId,
        direction: "assistant",
        content:
          mapperResult.matches.length === 0
            ? "No matching actions yet — the prompt didn't map to a registered capability."
            : mapperResult.is_ambiguous
              ? `Ambiguous — top candidates: ${mapperResult.matches.map((m) => m.action_slug).join(", ")}`
              : `Matched ${mapperResult.matches.length} candidate action(s): ${mapperResult.matches.map((m) => m.action_slug).join(", ")}`,
        proposed_action_slug: best?.action_slug ?? null,
        proposed_parameters: best?.parameters ?? null,
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
      matched_count: mapperResult.matches.length,
      is_ambiguous: mapperResult.is_ambiguous,
      best_slug: mapperResult.best_match?.action_slug ?? null,
      is_stub: true,
    },
    auth.user.id,
    dealerId,
  ).catch(() => {});

  const responseMessage =
    mapperResult.matches.length === 0
      ? "No matching actions for that prompt. Try rephrasing with the action you want — e.g. 'route leads to maria' or 'show my funnel'."
      : mapperResult.is_ambiguous
        ? "Multiple actions match — please pick one of the candidates below."
        : "Matched. Action execution is not yet wired (Q3 roadmap); review the proposed action + parameters below.";

  const response = {
    matched_actions: legacyMatched,
    mapper: mapperResult,
    is_stub: true as const,
    message: responseMessage,
    conversation_id: conversationId ?? "no-db",
    vertical: tenantVertical,
  };

  return NextResponse.json(response);
}
