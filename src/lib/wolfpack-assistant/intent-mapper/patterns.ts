/**
 * Per-action regex patterns.
 *
 * These are high-precision matchers for the 17 seed actions. When a
 * pattern hits, the action gets a confidence boost (PATTERN_WEIGHT in
 * confidence-scorer.ts) AND extracted named groups feed into the
 * IntentMatch.parameters.
 *
 * Each entry is bound to a single action_slug. Adding a new action?
 * Add a pattern here (optional but boosts recall) AND ensure your
 * test phrasings are added to dealer-phrasings.ts.
 *
 * Patterns are applied AFTER the prompt has been preserved at original
 * case — they capture proper-name extraction.
 */

import type { ActionPattern } from "./types";

export const ACTION_PATTERNS: ReadonlyArray<ActionPattern> = [
  // -------------------- leads --------------------
  {
    action_slug: "leads.update_routing_rule",
    pattern: /\b(?:route|routing|send|distribute|assign)\b.*\b(?:lead|leads|prospect|prospects)\b/i,
    reasoning: "Prompt mentions routing or distributing leads",
  },
  {
    action_slug: "leads.update_routing_rule",
    pattern: /\b(?:round[\s-]?robin|first[\s-]?available|balanced)\b/i,
    reasoning: "Prompt names a routing strategy",
  },
  {
    action_slug: "leads.assign_lead",
    pattern: /\b(?:assign|give|hand[\s-]?off|hand\s+over)\s+(?:this|the|a|that)?\s*(?:lead|prospect|customer|deal)/i,
    reasoning: "Prompt asks to assign a single lead",
  },

  // -------------------- F&I --------------------
  {
    action_slug: "fi.reorder_product_menu",
    pattern: /\b(?:reorder|rearrange|sort|prioritize|promote|demote)\b.*\b(?:product|menu|gap|tire|wheel|warranty|vsc)\b/i,
    reasoning: "Prompt asks to reorder F&I menu",
  },
  {
    action_slug: "fi.set_attach_target",
    pattern: /\b(?:set|update|change|adjust)\b.*\b(?:attach|penetration)\s*(?:rate|target|goal|%|percent)?\b/i,
    reasoning: "Prompt asks to set an attach-rate target",
  },
  {
    action_slug: "audit.run_fi_penetration",
    pattern: /\b(?:audit|run|check|review|how\s+is|how's|what's|whats)\b.*\b(?:f\s*[&i]\s*i|fi)\b.*(?:attach|penetration|gap|product|rate)?/i,
    reasoning: "Prompt asks to audit F&I performance",
  },
  {
    action_slug: "audit.run_fi_penetration",
    pattern: /\bf\s*[&]?\s*i\s+(?:attach|penetration|gap|product|menu)\b/i,
    reasoning: "Prompt references F&I metric directly",
  },

  // -------------------- service --------------------
  {
    action_slug: "service.update_hours",
    pattern: /\b(?:update|change|adjust|set)\b.*\b(?:service)?\s*(?:hours|hour|opening|operating)\b/i,
    reasoning: "Prompt asks to update service hours",
  },
  {
    action_slug: "service.add_special_closure",
    pattern: /\b(?:add|create|schedule|set)\b.*\b(?:closure|closed|holiday|day\s+off|shutdown|special\s+day)\b/i,
    reasoning: "Prompt asks to add a service closure",
  },

  // -------------------- inventory --------------------
  {
    action_slug: "inventory.feature_vehicle",
    pattern: /\b(?:feature|promote|highlight|push|spotlight|showcase)\b.*\b(?:vehicle|car|truck|suv|inventory|unit|stock|vin)\b/i,
    reasoning: "Prompt asks to feature a vehicle",
  },
  {
    action_slug: "inventory.feature_vehicle",
    pattern: /\b(?:put|move|add)\b.*\b(?:on\s+the\s+homepage|to\s+the\s+homepage|home\s+page|hero|featured)\b/i,
    reasoning: "Prompt mentions homepage placement",
  },
  {
    action_slug: "inventory.adjust_price",
    pattern: /\b(?:price|reprice|adjust|lower|raise|drop|cut|increase|decrease|change)\b.*\b(?:vehicle|car|truck|suv|unit|stock|vin|listing)\b/i,
    reasoning: "Prompt asks to reprice a vehicle",
  },
  {
    action_slug: "inventory.adjust_price",
    pattern: /\bnew\s+price\b|\bset\s+(?:the\s+)?price\b/i,
    reasoning: "Prompt names a new price",
  },

  // -------------------- comms / email --------------------
  {
    action_slug: "email.draft_followup",
    pattern: /\b(?:draft|write|compose|send|create)\b.*\b(?:email|message|follow[\s-]?up|note)\b/i,
    reasoning: "Prompt asks to draft a customer email",
  },
  {
    action_slug: "email.draft_followup",
    pattern: /\b(?:follow[\s-]?up|reach\s+out|touch\s+base|circle\s+back)\b.*\b(?:customer|lead|prospect|client)\b/i,
    reasoning: "Prompt mentions follow-up to a customer",
  },

  // -------------------- notifications --------------------
  {
    action_slug: "notifications.mute_after_hours",
    pattern: /\b(?:stop|mute|silence|pause|disable)\b.*\b(?:notification|notifications|ping|pings|alert|alerts|after[\s-]?hours|at\s+night|on\s+weekends?)\b/i,
    reasoning: "Prompt asks to mute after-hours notifications",
  },
  {
    action_slug: "notifications.mute_after_hours",
    pattern: /\b(?:don'?t|do\s+not|no\s+more)\b.*\b(?:ping|notify|alert|message)\b.*\b(?:night|weekend|evening|after)\b/i,
    reasoning: "Prompt asks not to be notified outside work hours",
  },
  {
    action_slug: "notifications.subscribe_alert",
    pattern: /\b(?:subscribe|sign\s+up|notify\s+me|alert\s+me|tell\s+me|let\s+me\s+know)\b.*\b(?:alert|when|if|inventory|lead|attach)\b/i,
    reasoning: "Prompt asks to subscribe to an alert",
  },

  // -------------------- analytics --------------------
  {
    action_slug: "analytics.show_my_funnel",
    pattern: /\b(?:show|see|view|pull|display)\b.*\b(?:funnel|conversion|lead|leads|deal|deals|pipeline|numbers)\b/i,
    reasoning: "Prompt asks to view conversion data",
  },
  {
    action_slug: "analytics.show_my_funnel",
    pattern: /\bhow\s+(?:am\s+i|are\s+my\s+lead)\b/i,
    reasoning: "Prompt asks how the user is performing",
  },
  {
    action_slug: "analytics.compare_to_peer",
    pattern: /\b(?:compare|vs|versus|against|benchmark|peer|top\s+performer|other\s+rep)\b/i,
    reasoning: "Prompt asks for peer comparison",
  },

  // -------------------- learning --------------------
  {
    action_slug: "learning.suggest_training",
    pattern: /\b(?:training|course|coaching|learn|improve|practice|tutorial|module)\b/i,
    reasoning: "Prompt asks about training",
  },
  {
    action_slug: "learning.explain_metric",
    pattern: /\b(?:what\s+is|explain|describe|define|meaning|means|stand\s+for)\b.*\b(?:metric|kpi|number|rate|score|index)\b/i,
    reasoning: "Prompt asks to explain a metric",
  },

  // -------------------- general --------------------
  {
    action_slug: "general.update_my_profile",
    pattern: /\b(?:update|change|edit|fix)\b.*\b(?:my\s+profile|my\s+name|my\s+email|my\s+phone|profile\s+info|account\s+info)\b/i,
    reasoning: "Prompt asks to update user profile",
  },
];

/**
 * Map action_slug → array of patterns. Lazy + cached.
 */
let _byAction: Map<string, ActionPattern[]> | null = null;

export function patternsForAction(slug: string): ActionPattern[] {
  if (!_byAction) {
    _byAction = new Map();
    for (const p of ACTION_PATTERNS) {
      const arr = _byAction.get(p.action_slug) ?? [];
      arr.push(p);
      _byAction.set(p.action_slug, arr);
    }
  }
  return _byAction.get(slug) ?? [];
}

/**
 * True iff ANY pattern bound to this slug hits the prompt. Returns the
 * matching pattern (first hit, in declaration order) for reasoning use.
 */
export function findPatternHit(
  prompt: string,
  slug: string,
): ActionPattern | null {
  const patterns = patternsForAction(slug);
  for (const p of patterns) {
    if (p.pattern.test(prompt)) return p;
  }
  return null;
}
