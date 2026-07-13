/**
 * LLM Tie-breaker.
 *
 * When the deterministic matcher is UNSURE — the top candidates are within
 * AMBIGUITY_THRESHOLD of each other (>= 2 plausible intents) — the mapper
 * asks this module to settle the tie. It dispatches to the Vercel AI
 * Gateway (via the wrapped `@/lib/ai/gateway` client) and asks the model to
 * CHOOSE one of the supplied candidates by index. The model disambiguates;
 * it never invents an action.
 *
 * Contained + safe by construction:
 *   - Runs ONLY with >= 2 candidates (single/zero candidates short-circuit
 *     to the deterministic result — no call).
 *   - Transparent no-op when `AI_GATEWAY_API_KEY` is unset: returns the
 *     deterministic keyword winner, emits nothing.
 *   - Prompt-injection gate (safety.ts `looksLikePromptInjection`) runs
 *     BEFORE any model call — a flagged prompt skips the LLM entirely.
 *   - Hard 2-second timeout. On timeout / any error / an out-of-range model
 *     choice, falls back to the deterministic keyword winner. NEVER throws;
 *     never blocks the request.
 *   - Analytics: `assistant.intent_llm_tiebreak_called` on dispatch and
 *     `assistant.intent_llm_tiebreak_resolved` once settled (with whether
 *     the LLM's choice or the keyword fallback was used).
 *
 * The deterministic winner is produced by `resolveTiebreakSync`, which is
 * also the pure fallback everywhere. The MapperResult callers see is
 * identical in shape; only `source` differs ("llm_proposed" when the model
 * actually resolved the tie) so the route can set/clear `is_stub`.
 */

import type { IntentMatch } from "./types";
import type { AssistantRole } from "../types";
import { looksLikePromptInjection } from "../safety";
import { runGatewayChat, GATEWAY_TIEBREAKER_MODEL } from "@/lib/ai/gateway";
import { trackAssistant } from "@/lib/analytics-hooks";

/** Hard deadline for the disambiguation call. */
export const TIEBREAK_TIMEOUT_MS = 2000;

/**
 * Agency-shared pseudo dealer id used for analytics when a real dealer id
 * isn't threaded through (mirrors the action-registry convention).
 */
const AGENCY_PSEUDO_DEALER = "wolfpack-assistant";

export interface TiebreakInput {
  prompt: string;
  competing: ReadonlyArray<IntentMatch>;
  /**
   * Optional — threaded through by the mapper so tie-break analytics land
   * on the real tenant. Absent in unit tests / legacy callers, in which
   * case the agency pseudo dealer id is used. Adding these OPTIONAL fields
   * keeps the existing `{ prompt, competing }` call sites valid.
   */
  dealerId?: string;
  role?: AssistantRole;
}

/* ------------------------------------------------------------------ */
/*  Deterministic fallback (pure, no I/O)                               */
/* ------------------------------------------------------------------ */

/**
 * Sync deterministic tie-breaker — highest keyword confidence wins, ties
 * broken alphabetically by slug for stability. This is BOTH the standalone
 * deterministic resolver AND the fallback the async path degrades to on
 * every failure. Given identical inputs, identical output.
 */
export function resolveTiebreakSync(input: TiebreakInput): IntentMatch | null {
  const { competing } = input;
  if (!competing || competing.length === 0) return null;
  if (competing.length === 1) return competing[0];

  const sorted = sortByConfidence(competing);
  const top = sorted[0];
  return {
    ...top,
    reasoning: `${top.reasoning} (tie-break: keyword confidence)`,
  };
}

function sortByConfidence(
  competing: ReadonlyArray<IntentMatch>,
): IntentMatch[] {
  return [...competing].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.action_slug < b.action_slug ? -1 : a.action_slug > b.action_slug ? 1 : 0;
  });
}

/* ------------------------------------------------------------------ */
/*  LLM-backed resolver                                                 */
/* ------------------------------------------------------------------ */

/**
 * Resolve a tie between near-confidence matches.
 *
 *   - 0 matches  → null
 *   - 1 match    → returned unchanged (no call)
 *   - >= 2       → ask the Gateway to pick; fall back to keyword on any
 *                  failure. Transparent no-op when the key is unset.
 */
export async function resolveTiebreak(
  input: TiebreakInput,
): Promise<IntentMatch | null> {
  const { competing, prompt } = input;
  if (!competing || competing.length === 0) return null;
  if (competing.length === 1) return competing[0];

  const deterministic = resolveTiebreakSync(input);

  // Transparent no-op: no key → deterministic result, emit nothing.
  if (!process.env.AI_GATEWAY_API_KEY) return deterministic;

  // Safety gate: an injection-flagged prompt never reaches the model.
  if (looksLikePromptInjection(prompt)) return deterministic;

  const dealerId = input.dealerId ?? AGENCY_PSEUDO_DEALER;
  const candidateCount = competing.length;

  safeTrack("assistant.intent_llm_tiebreak_called", dealerId, {
    role: input.role ?? "",
    candidate_count: candidateCount,
    model: GATEWAY_TIEBREAKER_MODEL,
  });

  // Belt-and-suspenders: the gateway wrapper is contracted to never throw,
  // but the tie-breaker must fall back rather than propagate under any
  // circumstance (a thrown tie-break would blank the chat).
  try {
    const result = await runGatewayChat({
      system: buildSystemPrompt(),
      user: buildUserPrompt(prompt, competing),
      timeoutMs: TIEBREAK_TIMEOUT_MS,
      maxTokens: 8,
    });

    if (!result.ok) {
      return fallback(dealerId, input.role, result.error.kind, deterministic);
    }

    const idx = parseChoiceIndex(result.value.text, candidateCount);
    if (idx === null) {
      return fallback(dealerId, input.role, "invalid_choice", deterministic);
    }

    const chosen = competing[idx];
    safeTrack("assistant.intent_llm_tiebreak_resolved", dealerId, {
      role: input.role ?? "",
      resolved_by: "llm",
      chosen_slug: chosen.action_slug,
      chosen_index: idx,
    });

    return {
      ...chosen,
      source: "llm_proposed",
      reasoning: `${chosen.reasoning} (tie-break: LLM disambiguated ${candidateCount} candidates)`,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.name : "unexpected_error";
    return fallback(dealerId, input.role, reason, deterministic);
  }
}

/** Emit the fallback-resolved event and return the deterministic winner. */
function fallback(
  dealerId: string,
  role: AssistantRole | undefined,
  reason: string,
  deterministic: IntentMatch | null,
): IntentMatch | null {
  safeTrack("assistant.intent_llm_tiebreak_resolved", dealerId, {
    role: role ?? "",
    resolved_by: "keyword_fallback",
    fallback_reason: reason,
    chosen_slug: deterministic?.action_slug ?? "",
  });
  return deterministic;
}

/* ------------------------------------------------------------------ */
/*  Prompt construction + parsing                                       */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(): string {
  return [
    "You disambiguate a dealership operator's request between a fixed list",
    "of candidate actions. You do NOT invent actions or answer the request.",
    "Choose the single candidate that best matches the user's intent.",
    "Reply with ONLY the candidate's number (its 0-based index). No words,",
    "no punctuation, no explanation — just the number.",
  ].join(" ");
}

function buildUserPrompt(
  prompt: string,
  competing: ReadonlyArray<IntentMatch>,
): string {
  const lines = competing.map(
    (m, i) => `${i}. ${m.action_slug} — ${m.reasoning}`,
  );
  return [
    `User request: ${prompt}`,
    "",
    "Candidate actions:",
    ...lines,
    "",
    `Answer with a single number from 0 to ${competing.length - 1}.`,
  ].join("\n");
}

/**
 * Parse the model's choice: the first integer in the text, validated to be
 * a real candidate index. Returns null when nothing parseable / in range.
 */
function parseChoiceIndex(text: string, count: number): number | null {
  const match = text.match(/-?\d+/);
  if (!match) return null;
  const idx = Number.parseInt(match[0], 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= count) return null;
  return idx;
}

/** trackAssistant, but analytics can NEVER block or throw the tie-break. */
function safeTrack(
  event: Parameters<typeof trackAssistant>[0],
  dealerId: string,
  meta: Record<string, string | number | boolean>,
): void {
  try {
    trackAssistant(event, dealerId, meta);
  } catch {
    /* analytics must never block the request */
  }
}
