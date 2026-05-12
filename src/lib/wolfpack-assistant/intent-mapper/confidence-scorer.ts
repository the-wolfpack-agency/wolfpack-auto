/**
 * Confidence Scorer — combine the layered signals into a single 0..1
 * confidence per candidate match.
 *
 * Inputs:
 *   - keyword score   (0..1, from keyword-matcher)
 *   - pattern hit     (boolean from per-action regex)
 *   - param boosts    (sum of parameter-extractor confidence boosts that
 *                      target a parameter on this action)
 *   - role-appropriate (boolean — already filtered upstream but used as
 *                      a final guard)
 *
 * Output: 0..1, clamped.
 *
 * Tuning: this is a deliberately simple weighted sum. The pattern-hit
 * + param-extraction signals can together drive confidence up to ~0.95
 * even on a weak keyword score, because they're high-precision signals.
 */

import type { AssistantAction, AssistantRole } from "../types";
import { canRoleInvoke } from "../capability-matcher";

export interface ScoreInputs {
  keyword: number;
  patternHit: boolean;
  paramBoost: number;
  action: AssistantAction;
  role: AssistantRole;
}

/**
 * Weights — chosen so a keyword-only hit can clear MIN_MATCH_CONFIDENCE
 * (0.15), a keyword + pattern hit lands at ~0.75, and a full triple-hit
 * (keyword + pattern + params) is ~0.9+.
 *
 * Tuning notes (see __tests__/confidence-scorer.test.ts for numeric
 * regressions):
 *   - PATTERN_WEIGHT 0.35 — high because regex patterns are precision-
 *     curated per action
 *   - PARAM_CAP 0.25     — sum of param boosts capped to avoid runaway
 *   - KEYWORD_BASE 0.55   — keyword score gets the largest share at the
 *     low end so weak matches don't all collapse to ~0
 */
const KEYWORD_BASE = 0.55;
const PATTERN_WEIGHT = 0.35;
const PARAM_CAP = 0.25;

export function combineConfidence(inp: ScoreInputs): number {
  if (!canRoleInvoke(inp.action, inp.role)) return 0;

  let score = KEYWORD_BASE * inp.keyword;
  if (inp.patternHit) score += PATTERN_WEIGHT;
  score += Math.min(PARAM_CAP, inp.paramBoost);

  return Math.max(0, Math.min(1, score));
}

/**
 * Detect ambiguity between top two matches.
 */
export function isAmbiguous(
  matches: ReadonlyArray<{ confidence: number }>,
  threshold: number,
): boolean {
  if (matches.length < 2) return false;
  // Use a small epsilon to keep float-equality at threshold inclusive.
  const EPSILON = 1e-9;
  return Math.abs(matches[0].confidence - matches[1].confidence) <= threshold + EPSILON;
}
