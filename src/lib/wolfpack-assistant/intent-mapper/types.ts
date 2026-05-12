/**
 * Intent Mapper — shared types.
 *
 * The intent mapper maps a free-text user prompt to ONE OR MORE typed
 * assistant actions, with extracted parameters. It is the deterministic
 * upgrade over the v0 keyword-only scorer in capability-matcher.ts:
 *
 *   - tokenizer            : lowercase + lemmatize basic verbs + dedupe
 *   - keyword-matcher       : per-action token overlap score
 *   - parameter-extractor   : email / phone / dollar / date / name / count
 *   - confidence-scorer     : weights keyword + pattern + role-appropriateness
 *   - llm-tiebreaker (stub) : resolves top-2 near-tie matches; today returns
 *                             the higher keyword-confidence one.
 *
 * Everything is deterministic. No LLM call. The stub keeps the contract
 * stable so the Q3 work can swap a real model in without changing callers.
 */

import type { AssistantAction, AssistantRole } from "../types";

/* ------------------------------------------------------------------ */
/*  Intent match output                                                 */
/* ------------------------------------------------------------------ */

/**
 * Which layer of the matcher produced a particular IntentMatch. Useful
 * for analytics + debugging. `pattern` means a regex pattern hit;
 * `keyword` means the deterministic token-overlap scorer. `llm_proposed`
 * is reserved for the tie-breaker stub's future LLM output.
 */
export type IntentMatchSource = "keyword" | "pattern" | "llm_proposed";

/**
 * A single candidate intent match.
 *
 * `parameters` are typed at runtime as string | number | boolean. Action
 * handlers that need richer shapes coerce at invocation time using the
 * action's parameter_schema.
 */
export interface IntentMatch {
  /** Matches a registered slug from the action-registry. */
  action_slug: string;
  /** 0..1 confidence — combined score from keyword + pattern + role. */
  confidence: number;
  /** Extracted typed parameters; values are coerced where possible. */
  parameters: Record<string, string | number | boolean>;
  /** Plain-language reasoning surfaced to the dealer + analytics. */
  reasoning: string;
  /** Which layer produced this match. */
  source: IntentMatchSource;
}

/**
 * Final mapper output. `matches` is the top-N descending; `best_match` is
 * matches[0] (or null when nothing scores). `is_ambiguous` flags when the
 * top two candidates are within `AMBIGUITY_THRESHOLD` of each other —
 * callers should confirm with the dealer rather than auto-execute.
 */
export interface MapperResult {
  matches: IntentMatch[];
  best_match: IntentMatch | null;
  is_ambiguous: boolean;
  unmatched_tokens: string[];
}

/* ------------------------------------------------------------------ */
/*  Mapper input + tuning constants                                     */
/* ------------------------------------------------------------------ */

export interface MapperContext {
  role: AssistantRole;
  dealerId: string;
  availableActions: ReadonlyArray<AssistantAction>;
}

/**
 * Two matches within this confidence delta are flagged as ambiguous.
 * Tuned to 0.10 by spec — small enough to avoid false-ambiguity on
 * clear wins, large enough to catch real ties.
 */
export const AMBIGUITY_THRESHOLD = 0.1;

/**
 * Minimum confidence to surface a match at all. Below this we treat the
 * prompt as unmatched and emit `assistant.intent_unmatched`.
 */
export const MIN_MATCH_CONFIDENCE = 0.15;

/**
 * Max candidate matches returned. The chat route trims further; this is
 * just a sanity cap inside the mapper.
 */
export const MAX_MATCHES = 5;

/* ------------------------------------------------------------------ */
/*  Per-action regex patterns                                           */
/* ------------------------------------------------------------------ */

/**
 * A regex pattern bound to a specific action slug. When the pattern
 * matches the prompt, the action gets a confidence boost AND extracted
 * named groups become candidate parameters.
 *
 * Named groups MUST match the action's parameter_schema property names.
 * Mis-named groups are silently dropped at extraction time.
 */
export interface ActionPattern {
  action_slug: string;
  pattern: RegExp;
  /** Optional reasoning string surfaced in IntentMatch.reasoning. */
  reasoning?: string;
  /**
   * Optional coercion hint per named group. Defaults to "string".
   * "number" → parseFloat, "boolean" → /^(true|yes|on)$/i.
   */
  coerce?: Record<string, "string" | "number" | "boolean">;
}
