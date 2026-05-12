/**
 * Safety Guardrails — runtime checks the conversational layer MUST honor
 * before executing any assistant-proposed action.
 *
 * The conversational layer (year-one Q3-Q4) will plug into these. Today
 * they're consumed by the chat stub route to validate prompts + by the
 * unit tests to lock the contract.
 *
 * Defense in depth:
 *   1. Action allowlist enforced at EXECUTION time (NOT just at proposal).
 *      An action that was proposed for a user but whose role is no longer
 *      allowed (e.g. role change mid-session) MUST be re-checked at exec.
 *   2. Irreversible actions REQUIRE an explicit confirmation parameter.
 *      Without it: deny. The conversational layer must show a "are you
 *      sure?" turn before executing.
 *   3. Dry-run is supported wherever the action declares it. Dry-run
 *      requests bypass the irreversible-confirm requirement (no state
 *      change happens).
 *   4. Per-user prompt rate limit: 60 prompts/hour. Keyed on user_id so
 *      a noisy user doesn't poison their own dealer's quota.
 *   5. Prompt-injection mitigation: customer-supplied lead/customer data
 *      must NEVER be included verbatim in LLM prompt context. This module
 *      ships the helper that escapes/strips such content before it gets
 *      to the conversational layer.
 *   6. Fail-CLOSED on every error: default deny. The user sees "I can't
 *      do that right now"; the conversational layer doesn't silently
 *      execute.
 */

import type {
  AssistantAction,
  AssistantRole,
} from "./types";
import { canRoleInvoke } from "./capability-matcher";

/* ------------------------------------------------------------------ */
/*  Per-user rate limit (60 prompts / hour)                             */
/* ------------------------------------------------------------------ */

export const ASSISTANT_PROMPT_RATE_LIMIT = 60;
export const ASSISTANT_PROMPT_RATE_WINDOW_SECONDS = 60 * 60;

/**
 * Check the per-user prompt rate limit. Returns {allowed, remaining,
 * resetAt}. Delegates to lib/rate-limit which has Redis + in-memory
 * fail-closed fallback.
 */
export async function checkAssistantPromptRate(
  userId: string,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  try {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    return await checkRateLimit(
      `assistant_prompt:${userId}`,
      ASSISTANT_PROMPT_RATE_LIMIT,
      ASSISTANT_PROMPT_RATE_WINDOW_SECONDS,
    );
  } catch {
    // Fail CLOSED — if the rate limiter itself is broken, deny.
    return { allowed: false, remaining: 0, resetAt: Math.floor(Date.now() / 1000) };
  }
}

/* ------------------------------------------------------------------ */
/*  Execution gate                                                      */
/* ------------------------------------------------------------------ */

export type ExecutionGateOutcome =
  | { allowed: true }
  | { allowed: false; reason: ExecutionGateDenyReason };

export type ExecutionGateDenyReason =
  | "action_unknown"
  | "action_inactive"
  | "role_not_allowed"
  | "missing_confirmation_for_irreversible"
  | "dry_run_not_supported";

export interface ExecutionGateRequest {
  action: AssistantAction | null;
  role: AssistantRole;
  /** True when the conversational layer wants to perform a dry-run. */
  dry_run?: boolean;
  /**
   * For irreversible actions, the conversational layer must collect an
   * explicit "yes I confirm" from the user before invoking — this flag
   * carries that confirmation through. Mutating actions don't require it.
   */
  confirmed?: boolean;
}

/**
 * The single gate that every action execution path MUST pass through.
 * Returns either `{allowed: true}` or `{allowed: false, reason: …}`.
 * Default deny on every failure path.
 */
export function evaluateExecutionGate(
  req: ExecutionGateRequest,
): ExecutionGateOutcome {
  const { action, role, dry_run, confirmed } = req;
  if (!action) {
    return { allowed: false, reason: "action_unknown" };
  }
  if (!action.active) {
    return { allowed: false, reason: "action_inactive" };
  }
  if (!canRoleInvoke(action, role)) {
    return { allowed: false, reason: "role_not_allowed" };
  }
  if (dry_run) {
    if (!action.dry_run_supported) {
      return { allowed: false, reason: "dry_run_not_supported" };
    }
    return { allowed: true };
  }
  if (action.side_effect === "irreversible" && !confirmed) {
    return { allowed: false, reason: "missing_confirmation_for_irreversible" };
  }
  return { allowed: true };
}

/* ------------------------------------------------------------------ */
/*  Prompt-injection mitigation                                         */
/* ------------------------------------------------------------------ */

/**
 * Patterns that look like lead/customer-supplied input being injected
 * into an assistant prompt. The conversational layer MUST strip these
 * before forwarding to the LLM.
 *
 * NOTE: this is NOT a complete defense — the conversational layer must
 * additionally use a strict role-separation prompt template (system vs
 * user turn) so the LLM cannot be tricked by clever lead-form text.
 * This helper handles the obvious cases.
 */
const INJECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /ignore (all )?previous instructions/i,
  /disregard (all )?previous instructions/i,
  /you are now/i,
  /\bsystem prompt\b/i,
  /\bjailbreak\b/i,
  /\bDAN mode\b/i,
];

/**
 * True iff the supplied text contains an obvious prompt-injection
 * pattern. Used by the chat stub + (eventually) the conversational layer
 * to refuse-and-log.
 */
export function looksLikePromptInjection(text: string): boolean {
  if (!text) return false;
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

/**
 * Defensive escaping helper for any customer-supplied content the
 * conversational layer wants to surface inside its own prompt. Wraps the
 * content in an unambiguous fence + replaces backticks so the fence
 * can't be torn open. This is NOT a substitute for strict role
 * separation — it's a belt-and-suspenders layer.
 */
export function escapeCustomerContent(text: string): string {
  const stripped = String(text).replace(/```/g, "''' ");
  return "```customer-supplied\n" + stripped + "\n```";
}

/* ------------------------------------------------------------------ */
/*  Public predicate — "is this prompt processable"                     */
/* ------------------------------------------------------------------ */

export type PromptGateOutcome =
  | { ok: true; sanitized: string }
  | { ok: false; reason: PromptGateDenyReason };

export type PromptGateDenyReason =
  | "empty_prompt"
  | "prompt_too_long"
  | "prompt_injection_detected"
  | "rate_limited";

export const ASSISTANT_PROMPT_MAX_LENGTH = 4000;

/**
 * Gate every inbound prompt BEFORE it reaches the conversational layer.
 * Default deny on every failure path.
 */
export async function evaluatePromptGate(
  userId: string,
  prompt: string,
): Promise<PromptGateOutcome> {
  if (!prompt || prompt.trim().length === 0) {
    return { ok: false, reason: "empty_prompt" };
  }
  if (prompt.length > ASSISTANT_PROMPT_MAX_LENGTH) {
    return { ok: false, reason: "prompt_too_long" };
  }
  if (looksLikePromptInjection(prompt)) {
    return { ok: false, reason: "prompt_injection_detected" };
  }
  const rate = await checkAssistantPromptRate(userId);
  if (!rate.allowed) {
    return { ok: false, reason: "rate_limited" };
  }
  return { ok: true, sanitized: prompt.trim() };
}
