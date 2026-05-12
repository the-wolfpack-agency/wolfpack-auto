/**
 * Intent Mapper Orchestrator.
 *
 * Composes the layered matchers + the parameter extractor + the
 * confidence scorer + the LLM tie-breaker stub into one deterministic
 * end-to-end function.
 *
 * Algorithm:
 *   1. Tokenize the prompt.
 *   2. For each role-allowed action:
 *      a. Score keyword overlap.
 *      b. Check per-action patterns.
 *      c. Sum parameter-boost contributions for params on this action.
 *      d. Combine into final confidence (confidence-scorer).
 *   3. Drop anything below MIN_MATCH_CONFIDENCE.
 *   4. Sort descending + slice to MAX_MATCHES.
 *   5. If top two are within AMBIGUITY_THRESHOLD: call llm-tiebreaker
 *      stub. Promote its choice to best_match, keep ambiguity flag true
 *      so the caller can still surface the alternatives.
 *   6. Return MapperResult.
 *
 * Determinism: given identical inputs, identical output. No I/O.
 */

import { extractParameters, filterParametersForAction } from "./parameter-extractor";
import { scoreKeywords } from "./keyword-matcher";
import { combineConfidence, isAmbiguous } from "./confidence-scorer";
import { findPatternHit } from "./patterns";
import { tokenize, tokenizeAction } from "./tokenizer";
import { resolveTiebreak } from "./llm-tiebreaker";
import {
  AMBIGUITY_THRESHOLD,
  MAX_MATCHES,
  MIN_MATCH_CONFIDENCE,
  type IntentMatch,
  type MapperContext,
  type MapperResult,
} from "./types";

/**
 * Map a prompt to candidate intent matches.
 *
 * Filters availableActions by role-appropriateness UPSTREAM by the
 * confidence-scorer (canRoleInvoke gate), but callers should pre-filter
 * via `listActions({ role })` to keep the candidate set small.
 */
export async function mapIntent(
  prompt: string,
  context: MapperContext,
): Promise<MapperResult> {
  if (!prompt || prompt.trim().length === 0) {
    return {
      matches: [],
      best_match: null,
      is_ambiguous: false,
      unmatched_tokens: [],
    };
  }

  const promptTokens = tokenize(prompt);
  const extraction = extractParameters(prompt);

  const candidates: IntentMatch[] = [];

  for (const action of context.availableActions) {
    const { score: keyword, matchedTokens } = scoreKeywords(promptTokens, action);

    const patternHit = findPatternHit(prompt, action.slug);
    const hasPattern = patternHit !== null;

    // param boost: sum of boosts on params this action accepts
    const actionParams = filterParametersForAction(
      extraction.parameters,
      action.parameter_schema as { properties?: Record<string, unknown> } | undefined,
    );
    let paramBoost = 0;
    for (const key of Object.keys(actionParams)) {
      paramBoost += extraction.boosts[key] ?? 0;
    }

    const confidence = combineConfidence({
      keyword,
      patternHit: hasPattern,
      paramBoost,
      action,
      role: context.role,
    });
    if (confidence < MIN_MATCH_CONFIDENCE) continue;

    const reasoningParts: string[] = [];
    if (matchedTokens.length > 0) {
      reasoningParts.push(
        `matched tokens: ${matchedTokens.slice(0, 5).join(", ")}`,
      );
    }
    if (patternHit?.reasoning) reasoningParts.push(patternHit.reasoning);
    if (Object.keys(actionParams).length > 0) {
      reasoningParts.push(`extracted: ${Object.keys(actionParams).join(", ")}`);
    }
    if (reasoningParts.length === 0) {
      reasoningParts.push("weak signal — keyword overlap only");
    }

    candidates.push({
      action_slug: action.slug,
      confidence,
      parameters: actionParams,
      reasoning: reasoningParts.join("; "),
      source: hasPattern ? "pattern" : "keyword",
    });
  }

  // Sort desc, stable by slug for ties.
  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.action_slug < b.action_slug ? -1 : a.action_slug > b.action_slug ? 1 : 0;
  });

  const trimmed = candidates.slice(0, MAX_MATCHES);
  let best = trimmed[0] ?? null;
  const ambiguous = isAmbiguous(trimmed, AMBIGUITY_THRESHOLD);

  if (ambiguous && trimmed.length >= 2) {
    // Pull all matches within the ambiguity band for the tie-breaker.
    const band: IntentMatch[] = [];
    const topConf = trimmed[0].confidence;
    for (const m of trimmed) {
      if (Math.abs(topConf - m.confidence) <= AMBIGUITY_THRESHOLD) band.push(m);
      else break;
    }
    const resolved = await resolveTiebreak({ prompt, competing: band });
    if (resolved) best = resolved;
  }

  // Compute unmatched tokens: prompt tokens that didn't hit ANY candidate's
  // corpus and weren't consumed by the parameter extractor.
  const consumedFromExtraction = new Set(
    extraction.consumed
      .map((c) => c.toLowerCase().split(/[^a-z0-9]+/g))
      .flat()
      .filter(Boolean),
  );
  const everyActionCorpus = new Set<string>();
  for (const action of context.availableActions) {
    for (const t of tokenizeAction(action)) everyActionCorpus.add(t);
  }
  const unmatched: string[] = [];
  for (const t of promptTokens) {
    if (everyActionCorpus.has(t)) continue;
    if (consumedFromExtraction.has(t)) continue;
    if (/^[0-9]+$/.test(t) && Object.keys(extraction.parameters).length > 0) continue;
    unmatched.push(t);
  }

  return {
    matches: trimmed,
    best_match: best,
    is_ambiguous: ambiguous,
    unmatched_tokens: unmatched,
  };
}
