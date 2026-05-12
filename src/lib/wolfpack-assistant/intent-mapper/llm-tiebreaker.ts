/**
 * LLM Tie-breaker (STUB).
 *
 * When the top two intent matches are within AMBIGUITY_THRESHOLD of each
 * other, the orchestrator calls this module to resolve the tie. The
 * production implementation will dispatch to the agency LLM gateway with
 * the prompt + competing actions + their reasoning, and return the
 * resolved IntentMatch.
 *
 * TODO(llm-tiebreaker): wire to AI Gateway (`@ai-sdk/anthropic` or the
 *   shared `lib/llm.ts` wrapper). Keep the signature stable; only the
 *   body changes. Add prompt caching (CLAUDE.md global rule) and AI
 *   Gateway env (`AI_GATEWAY_API_KEY`) to the request.
 *
 * TODO(llm-tiebreaker): emit a dedicated analytics event
 *   `assistant.intent_llm_tiebreak_called` when a real call is made,
 *   and `assistant.intent_llm_tiebreak_resolved` on success / fallback
 *   on failure.
 *
 * TODO(llm-tiebreaker): set a 2-second timeout; on timeout fall back to
 *   the highest-keyword-confidence match (current stub behavior).
 *
 * This stub returns the higher-keyword-confidence option synchronously
 * and DOES NOT call any external service. The MapperResult that callers
 * see is identical in shape; only the resolution source differs.
 */

import type { IntentMatch } from "./types";

export interface TiebreakInput {
  prompt: string;
  competing: ReadonlyArray<IntentMatch>;
}

/**
 * Resolve a tie between near-confidence matches. The stub policy:
 *   - 0 matches    → null
 *   - 1 match      → return it unchanged
 *   - 2+ matches   → return the one with the HIGHEST confidence, with
 *                    `source = "keyword"` preserved (stub doesn't claim
 *                    LLM provenance)
 *
 * Deterministic — given identical inputs returns identical output.
 */
export async function resolveTiebreak(
  input: TiebreakInput,
): Promise<IntentMatch | null> {
  const { competing } = input;
  if (!competing || competing.length === 0) return null;
  if (competing.length === 1) return competing[0];

  // Sort descending by confidence; tie-break on action_slug for stability.
  const sorted = [...competing].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.action_slug < b.action_slug ? -1 : a.action_slug > b.action_slug ? 1 : 0;
  });

  const top = sorted[0];
  return {
    ...top,
    reasoning: `${top.reasoning} (tie-break: stub picked highest-confidence; TODO(llm-tiebreaker))`,
  };
}

/**
 * Sync version of the tie-breaker — for callers that don't want to
 * await. Returns the same stub result. Useful in unit tests.
 */
export function resolveTiebreakSync(input: TiebreakInput): IntentMatch | null {
  const { competing } = input;
  if (!competing || competing.length === 0) return null;
  if (competing.length === 1) return competing[0];

  const sorted = [...competing].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.action_slug < b.action_slug ? -1 : a.action_slug > b.action_slug ? 1 : 0;
  });

  const top = sorted[0];
  return {
    ...top,
    reasoning: `${top.reasoning} (tie-break: stub picked highest-confidence; TODO(llm-tiebreaker))`,
  };
}
