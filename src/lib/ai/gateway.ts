/**
 * Vercel AI Gateway — the single wrapped entry point for LLM calls.
 *
 * Repo rule (.ai/conventions.md → "External integrations"): every external
 * SDK / service is wrapped in ONE place, call sites never talk to the
 * provider directly, and the wrapper returns a typed Result — it NEVER
 * throws. This module is that wrapper for model routing.
 *
 * Transport: the Gateway exposes an OpenAI-compatible REST surface at
 * `https://ai-gateway.vercel.sh/v1/chat/completions`. We call it with a
 * plain `fetch` rather than pulling in the `ai` / `@ai-sdk/*` packages —
 * this keeps the change dependency-free (CLAUDE.md: "No new runtime
 * dependencies without justification") and the surface we use (one chat
 * completion with a hard timeout) does not warrant an SDK.
 *
 * Auth + routing: `AI_GATEWAY_API_KEY` env + a model STRING (CLAUDE.md
 * "Best practices for developing on Vercel"). If the key is unset every
 * call is a transparent no-op that returns `{ ok: false, kind:
 * "missing_key" }` so callers degrade to their deterministic path.
 *
 * Model id: pulled from the live models endpoint on 2026-07-13
 * (`curl https://ai-gateway.vercel.sh/v1/models`), NOT from memory, per
 * the CLAUDE.md rule. `claude-haiku-4.5` is the cheapest current Anthropic
 * model and the lowest-latency choice for a sub-2s disambiguation call.
 */

/** The one model string for Gateway routing. Verified live 2026-07-13. */
export const GATEWAY_TIEBREAKER_MODEL = "anthropic/claude-haiku-4.5" as const;

const GATEWAY_CHAT_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

/** Discriminated failure kinds so callers can branch without string-matching. */
export type GatewayErrorKind =
  | "missing_key" // AI_GATEWAY_API_KEY unset — feature is a no-op
  | "timeout" // aborted at timeoutMs
  | "http_error" // non-2xx from the Gateway
  | "network" // fetch rejected / connection failure
  | "invalid_response"; // 2xx but body wasn't the expected shape

export interface GatewayError {
  kind: GatewayErrorKind;
  message: string;
  /** HTTP status when kind === "http_error". */
  status?: number;
}

export type GatewayResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: GatewayError };

export interface GatewayChatRequest {
  /** System turn — role/task framing. Kept separate from user content. */
  system: string;
  /** User turn — the (already safety-gated) prompt context. */
  user: string;
  /** Model string; defaults to GATEWAY_TIEBREAKER_MODEL. */
  model?: string;
  /** Hard abort deadline in ms. */
  timeoutMs: number;
  /** Cap output tokens — disambiguation needs very few. */
  maxTokens?: number;
}

interface OpenAIChatCompletion {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Run one chat completion through the Gateway. Returns a typed Result and
 * NEVER throws — every failure path (missing key, timeout, HTTP error,
 * network error, malformed body) maps to `{ ok: false, error }`.
 *
 * Temperature is pinned to 0 so the same inputs give the same choice; this
 * is a deterministic-first system and the tiebreaker should be stable.
 */
export async function runGatewayChat(
  req: GatewayChatRequest,
): Promise<GatewayResult<{ text: string }>> {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: { kind: "missing_key", message: "AI_GATEWAY_API_KEY is not set" },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs);

  try {
    const res = await fetch(GATEWAY_CHAT_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: req.model ?? GATEWAY_TIEBREAKER_MODEL,
        temperature: 0,
        max_tokens: req.maxTokens ?? 64,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        error: {
          kind: "http_error",
          status: res.status,
          message: `Gateway returned HTTP ${res.status}`,
        },
      };
    }

    let body: OpenAIChatCompletion;
    try {
      body = (await res.json()) as OpenAIChatCompletion;
    } catch {
      return {
        ok: false,
        error: { kind: "invalid_response", message: "Gateway body was not JSON" },
      };
    }

    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim().length === 0) {
      return {
        ok: false,
        error: {
          kind: "invalid_response",
          message: "Gateway response had no message content",
        },
      };
    }

    return { ok: true, value: { text: text.trim() } };
  } catch (err) {
    const kind: GatewayErrorKind =
      err instanceof Error && err.name === "AbortError" ? "timeout" : "network";
    return {
      ok: false,
      error: {
        kind,
        message: err instanceof Error ? err.message : "unknown fetch error",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
