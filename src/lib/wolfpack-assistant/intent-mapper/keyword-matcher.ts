/**
 * Keyword Matcher — token-overlap scorer between a tokenized prompt
 * and the descriptive corpus of an action (slug + display_name +
 * description).
 *
 * The v0 capability-matcher had this logic inline; we factor it out
 * here so the orchestrator can compose it with pattern matching and
 * role weighting cleanly.
 *
 * Score is in [0, 1]. Higher slug-token overlap gets more weight — the
 * slug is the canonical identifier and a slug-token match is a strong
 * signal of intent.
 */

import type { AssistantAction } from "../types";
import { tokenize } from "./tokenizer";

/**
 * Per-action keyword-overlap score. Returns 0..1.
 *
 * Implementation:
 *   - tokenize prompt + action corpus separately
 *   - score slug tokens 3x, display_name tokens 2x, description tokens 1x
 *   - normalize by min(action_tokens, prompt_tokens) — so a 1-token
 *     prompt matching 1 action token scores 1.0, not 0.05
 *
 * The v0 normalizer divided by total possible weight, which collapsed
 * short prompts. The new normalizer (cap = min(prompt_tokens, action_tokens))
 * recovers them. See keyword-matcher.test.ts for the regression case.
 */
export function scoreKeywords(
  promptTokens: ReadonlyArray<string>,
  action: AssistantAction,
): { score: number; matchedTokens: string[] } {
  const promptSet = new Set(promptTokens);
  if (promptSet.size === 0) return { score: 0, matchedTokens: [] };

  const slugTokens = new Set(tokenize(action.slug.replace(/[._]/g, " ")));
  const nameTokens = new Set(tokenize(action.display_name));
  const descTokens = new Set(tokenize(action.description));

  const matched = new Set<string>();
  let slugHits = 0;
  let nameHits = 0;
  let descHits = 0;
  for (const t of promptSet) {
    if (slugTokens.has(t)) { slugHits++; matched.add(t); }
    if (nameTokens.has(t)) { nameHits++; matched.add(t); }
    if (descTokens.has(t)) { descHits++; matched.add(t); }
  }

  const slugWeight = 3;
  const nameWeight = 2;
  const descWeight = 1;
  const raw = slugWeight * slugHits + nameWeight * nameHits + descWeight * descHits;

  // Normalize: best possible raw given prompt size.
  // Each prompt token can hit slug + name + desc (worst case 6 = 3+2+1).
  const maxRawPerToken = slugWeight + nameWeight + descWeight;
  const denom = Math.max(1, Math.min(promptSet.size, slugTokens.size + nameTokens.size + descTokens.size)) * maxRawPerToken;
  if (denom === 0) return { score: 0, matchedTokens: [] };

  const score = Math.min(1, raw / denom);

  // Floor: if any slug token matched at all, we want at least 0.2 — slug
  // matches are the strongest signal of intent. Otherwise short prompts
  // against short slugs can score below the global minConfidence and
  // unfairly drop out.
  const adjusted = slugHits > 0 ? Math.max(score, 0.25 + 0.15 * Math.min(slugHits - 1, 3)) : score;

  return { score: Math.min(1, adjusted), matchedTokens: Array.from(matched) };
}

/**
 * Convenience: tokenize the prompt + score every action; return a sorted
 * array of {action, score, matchedTokens}.
 */
export function scoreAllActions(
  prompt: string,
  actions: ReadonlyArray<AssistantAction>,
): Array<{ action: AssistantAction; score: number; matchedTokens: string[] }> {
  const promptTokens = tokenize(prompt);
  return actions
    .map((action) => ({
      action,
      ...scoreKeywords(promptTokens, action),
    }))
    .sort((a, b) => b.score - a.score);
}
