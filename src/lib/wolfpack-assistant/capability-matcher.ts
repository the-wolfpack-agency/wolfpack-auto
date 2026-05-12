/**
 * Capability Matcher — maps (user role, prompt) → matching actions.
 *
 * Two responsibilities:
 *   1. Determine whether a given user role can invoke a given action
 *      (capability check). Default policy: the action's allowed_roles
 *      list governs; the assistant_capabilities table can OPT-OUT an
 *      (action, role) pair by setting enabled=false.
 *   2. Score a free-text prompt against the registry's
 *      (display_name, description, slug) corpus using a deterministic
 *      keyword overlap. NO LLM. NO external call. This is the v1 stub
 *      that will be replaced by the Instinct conversational layer in
 *      year-one Q3-Q4.
 *
 * The matcher operates fail-closed: if no action matches above the
 * confidence floor OR the user's role cannot invoke a candidate, the
 * candidate is dropped.
 */

import type {
  AssistantAction,
  AssistantRole,
  MatchedAction,
  TenantVertical,
  Vertical,
} from "./types";

/* ------------------------------------------------------------------ */
/*  Capability check                                                    */
/* ------------------------------------------------------------------ */

/**
 * True iff a user with `role` is allowed to invoke `action`, taking
 * both the action's allowed_roles and the (optional) per-row
 * capability overrides into account.
 */
export function canRoleInvoke(
  action: Pick<AssistantAction, "allowed_roles" | "active">,
  role: AssistantRole,
  capabilityOverrides: ReadonlyArray<{ role: string; enabled: boolean }> = [],
): boolean {
  if (!action.active) return false;
  if (!action.allowed_roles || action.allowed_roles.length === 0) return false;

  const allowed = action.allowed_roles.includes(role) || action.allowed_roles.includes("any");
  if (!allowed) return false;

  // Explicit override wins.
  const override = capabilityOverrides.find((c) => c.role === role);
  if (override) return override.enabled;
  return true;
}

/**
 * True iff `action` is available in the given tenant `vertical`. An action
 * tagged 'any' is always available. Otherwise the action's vertical must
 * match the tenant's vertical.
 *
 * When `tenantVertical` is undefined, vertical-gating is skipped (Wolfpack
 * staff curation mode or pre-migration callers).
 */
export function isActionInVertical(
  action: Pick<AssistantAction, "vertical">,
  tenantVertical: TenantVertical | undefined,
): boolean {
  if (!tenantVertical) return true;
  const v: Vertical = action.vertical ?? "any";
  return v === "any" || v === tenantVertical;
}

/* ------------------------------------------------------------------ */
/*  Prompt scoring (deterministic keyword overlap)                      */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "a", "an", "the", "of", "to", "in", "on", "for", "and", "or",
  "i", "my", "me", "we", "our", "is", "are", "be", "do", "does",
  "did", "will", "would", "should", "could", "can", "you", "your",
  "this", "that", "these", "those", "with", "by", "as", "at",
  "it", "its", "if", "then", "so", "but", "from", "into", "than",
  "set", "show",
]);

/** Lowercase, split on non-alpha, drop stopwords + tokens shorter than 3. */
export function tokenize(input: string): string[] {
  if (!input) return [];
  const tokens = input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return tokens;
}

/**
 * Score a single action against a prompt. Returns a number in [0, 1].
 *
 * Scoring is intentionally simple — overlap of prompt tokens with the
 * action's slug tokens + display_name + description tokens, weighted so
 * that slug matches count more (they're the canonical identifier).
 */
export function scoreAction(prompt: string, action: AssistantAction): number {
  const promptTokens = new Set(tokenize(prompt));
  if (promptTokens.size === 0) return 0;

  const slugTokens = new Set(tokenize(action.slug.replace(/[._]/g, " ")));
  const nameTokens = new Set(tokenize(action.display_name));
  const descTokens = new Set(tokenize(action.description));

  let slugHits = 0;
  let nameHits = 0;
  let descHits = 0;
  for (const t of promptTokens) {
    if (slugTokens.has(t)) slugHits++;
    if (nameTokens.has(t)) nameHits++;
    if (descTokens.has(t)) descHits++;
  }

  // Weighted hits. Cap each field's contribution so a long description
  // can't out-score a precise slug match.
  const slugWeight = 3;
  const nameWeight = 2;
  const descWeight = 1;
  const slugCap = Math.min(slugTokens.size, promptTokens.size);
  const nameCap = Math.min(nameTokens.size, promptTokens.size);
  const descCap = Math.min(descTokens.size, promptTokens.size);
  const maxScore =
    slugWeight * Math.max(1, slugCap) +
    nameWeight * Math.max(1, nameCap) +
    descWeight * Math.max(1, descCap);

  const raw = slugWeight * slugHits + nameWeight * nameHits + descWeight * descHits;
  if (maxScore === 0) return 0;
  return Math.min(1, raw / maxScore);
}

export interface MatchOptions {
  /** Minimum confidence to surface a candidate. Default 0.15. */
  minConfidence?: number;
  /** Cap on candidate count returned. Default 5. */
  limit?: number;
  /**
   * Tenant vertical. When set, actions whose `vertical` is neither 'any' nor
   * the tenant's vertical are filtered out before scoring. When unset, no
   * vertical filter is applied (matches legacy callers).
   */
  vertical?: TenantVertical;
}

/**
 * Score every action against the prompt + filter by role + return the
 * top-K by descending confidence. Stable order: ties broken by slug.
 */
export function matchActions(
  prompt: string,
  role: AssistantRole,
  actions: ReadonlyArray<AssistantAction>,
  opts: MatchOptions = {},
): MatchedAction[] {
  const minConfidence = opts.minConfidence ?? 0.15;
  const limit = Math.max(1, Math.min(opts.limit ?? 5, 20));
  const tenantVertical = opts.vertical;

  const scored: MatchedAction[] = [];
  for (const action of actions) {
    if (!canRoleInvoke(action, role)) continue;
    if (!isActionInVertical(action, tenantVertical)) continue;
    const confidence = scoreAction(prompt, action);
    if (confidence < minConfidence) continue;
    scored.push({
      slug: action.slug,
      display_name: action.display_name,
      description: action.description,
      category: action.category,
      side_effect: action.side_effect,
      dry_run_supported: action.dry_run_supported,
      confidence,
      parameter_hints: {},
    });
  }

  scored.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });

  return scored.slice(0, limit);
}
