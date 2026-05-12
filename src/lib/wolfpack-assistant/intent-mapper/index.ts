/**
 * Intent Mapper — public entry point.
 *
 * Provides:
 *   - mapIntent (orchestrator)
 *   - tokenize / extractParameters / scoreKeywords (composable parts)
 *   - resolveTiebreak (stub LLM tie-breaker, future Q3 LLM target)
 *   - typed MapperResult / IntentMatch / MapperContext
 *   - tuning constants AMBIGUITY_THRESHOLD / MIN_MATCH_CONFIDENCE
 *
 * Consumers (the chat route) call `mapIntent(prompt, context)` and treat
 * the result as the source of truth. The deterministic-first invariant
 * means this layer NEVER calls a real LLM — the tiebreaker is a stub.
 */

export { mapIntent } from "./mapper";
export { tokenize, tokenizeAction } from "./tokenizer";
export { scoreKeywords, scoreAllActions } from "./keyword-matcher";
export {
  extractParameters,
  filterParametersForAction,
  type ExtractedParameters,
} from "./parameter-extractor";
export {
  combineConfidence,
  isAmbiguous,
  type ScoreInputs,
} from "./confidence-scorer";
export {
  resolveTiebreak,
  resolveTiebreakSync,
  type TiebreakInput,
} from "./llm-tiebreaker";
export {
  ACTION_PATTERNS,
  patternsForAction,
  findPatternHit,
} from "./patterns";
export type {
  IntentMatch,
  IntentMatchSource,
  MapperResult,
  MapperContext,
  ActionPattern,
} from "./types";
export {
  AMBIGUITY_THRESHOLD,
  MIN_MATCH_CONFIDENCE,
  MAX_MATCHES,
} from "./types";
