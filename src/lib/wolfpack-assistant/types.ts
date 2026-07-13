/**
 * Wolfpack Assistant — shared types.
 *
 * Foundation for the Wolfpack Assistant integration (see
 * docs/wolfpack-assistant-integration-2026-05-12.md). Four entity types:
 * actions, capabilities, conversations, conversation messages.
 *
 * The conversational layer (LLM-driven prompt → action mapping) is year-one
 * Q3-Q4 work coordinated with the Instinct team. These types describe the
 * scaffolding the future layer will plug into.
 */

/* ------------------------------------------------------------------ */
/*  Enums (mirror Postgres CHECK constraints exactly)                  */
/* ------------------------------------------------------------------ */

/**
 * Side-effect class for an action.
 * - read         : no state changes (reports, audits, drafts)
 * - mutating     : changes state, reversible (e.g. update a routing rule)
 * - irreversible : destructive or hard to undo (requires explicit confirm)
 */
export type AssistantSideEffect = "read" | "mutating" | "irreversible";

/** Module/category buckets, used for grouping in the UI + analytics. */
export type AssistantCategory =
  | "leads"
  | "fi"
  | "service"
  | "marketing"
  | "notifications"
  | "inventory"
  | "analytics"
  | "learning"
  | "audit"
  | "general";

/** Roles that can be referenced in an action's allowed_roles list. */
export type AssistantRole =
  | "salesperson"
  | "fi_manager"
  | "bdc_agent"
  | "service_advisor"
  | "service_manager"
  | "gm"
  | "marketing"
  | "controller"
  | "sales_manager"
  | "owner"
  | "admin"
  | "any";

/** Conversation outcome signal — fed to the learning loop. */
export type AssistantSatisfactionSignal =
  | "positive"
  | "neutral"
  | "negative"
  | "unknown";

/** Direction of a conversation message. */
export type AssistantMessageDirection = "user" | "assistant";

/**
 * Vertical dimension on every assistant_action + tenant_vertical row.
 * Year-1 ships only `auto`; year-2 onwards opens `retail`; `service` +
 * `hospitality` are future verticals. `any` actions apply to every vertical.
 *
 * See docs/wolfpack-platform-multivertical-2026-05-12.md for the strategic
 * frame and migration 080 for the schema.
 */
export type Vertical =
  | "auto"
  | "retail"
  | "service"
  | "hospitality"
  | "any";

/**
 * Subset of Vertical that a tenant can actually be. `any` is only valid on
 * the action side (an action that applies to every vertical). A tenant must
 * be in exactly one concrete vertical.
 */
export type TenantVertical = Exclude<Vertical, "any">;

/* ------------------------------------------------------------------ */
/*  Row shapes                                                          */
/* ------------------------------------------------------------------ */

export interface AssistantAction {
  id: string;
  slug: string;
  display_name: string;
  description: string;
  parameter_schema: JSONSchemaLike;
  allowed_roles: AssistantRole[];
  side_effect: AssistantSideEffect;
  dry_run_supported: boolean;
  category: AssistantCategory | null;
  vertical: Vertical;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** Tenant-to-vertical association row (migration 080). */
export interface TenantVerticalRow {
  tenant_id: string;
  vertical: TenantVertical;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssistantCapability {
  id: string;
  action_id: string;
  role: AssistantRole;
  enabled: boolean;
  created_at: string;
}

export interface AssistantConversation {
  id: string;
  dealer_id: string;
  user_id: string;
  user_role: AssistantRole;
  conversation_started_at: string;
  conversation_ended_at: string | null;
  message_count: number;
  actions_proposed: number;
  actions_executed: number;
  actions_rejected: number;
  satisfaction_signal: AssistantSatisfactionSignal | null;
}

export interface AssistantConversationMessage {
  id: string;
  conversation_id: string;
  dealer_id: string;
  message_index: number;
  direction: AssistantMessageDirection;
  content: string;
  proposed_action_slug: string | null;
  proposed_parameters: Record<string, unknown> | null;
  was_executed: boolean | null;
  execution_result: Record<string, unknown> | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Input shapes (for CREATE)                                           */
/* ------------------------------------------------------------------ */

/**
 * Minimal JSON Schema-shaped object — we don't validate the schema body,
 * just its overall shape. The Instinct conversational layer will use this
 * to construct parameter prompts at LLM time.
 */
export interface JSONSchemaLike {
  type?: string;
  properties?: Record<string, JSONSchemaLike | unknown>;
  required?: string[];
  items?: JSONSchemaLike | unknown;
  description?: string;
  // Tolerate arbitrary extensions; we don't enforce JSON Schema validation.
  [k: string]: unknown;
}

export interface CreateActionInput {
  slug: string;
  display_name: string;
  description: string;
  parameter_schema: JSONSchemaLike;
  allowed_roles: AssistantRole[];
  side_effect: AssistantSideEffect;
  dry_run_supported?: boolean;
  category?: AssistantCategory | null;
  /**
   * Vertical the action applies to. Defaults to 'any' (all verticals)
   * when omitted — see migration 080.
   */
  vertical?: Vertical;
  active?: boolean;
}

export interface PatchActionInput {
  display_name?: string;
  description?: string;
  parameter_schema?: JSONSchemaLike;
  allowed_roles?: AssistantRole[];
  side_effect?: AssistantSideEffect;
  dry_run_supported?: boolean;
  category?: AssistantCategory | null;
  vertical?: Vertical;
  active?: boolean;
}

export interface StartConversationInput {
  dealer_id: string;
  user_id: string;
  user_role: AssistantRole;
}

export interface AppendMessageInput {
  conversation_id: string;
  dealer_id: string;
  direction: AssistantMessageDirection;
  content: string;
  proposed_action_slug?: string | null;
  proposed_parameters?: Record<string, unknown> | null;
  was_executed?: boolean | null;
  execution_result?: Record<string, unknown> | null;
}

export interface EndConversationInput {
  conversation_id: string;
  satisfaction_signal?: AssistantSatisfactionSignal;
}

/* ------------------------------------------------------------------ */
/*  Matching output (chat stub)                                         */
/* ------------------------------------------------------------------ */

export interface MatchedAction {
  slug: string;
  display_name: string;
  description: string;
  category: AssistantCategory | null;
  side_effect: AssistantSideEffect;
  dry_run_supported: boolean;
  /** 0..1 — deterministic keyword-match score */
  confidence: number;
  /** Free-form parameter hints extracted from the prompt; empty today. */
  parameter_hints: Record<string, string>;
}

export interface ChatStubResponse {
  matched_actions: MatchedAction[];
  /**
   * True for the deterministic path; false only when the LLM tie-breaker
   * (AI Gateway) actually resolved a near-tie for this prompt. When
   * `AI_GATEWAY_API_KEY` is unset this is always true (transparent no-op).
   */
  is_stub: boolean;
  message: string;
}

/* ------------------------------------------------------------------ */
/*  Allow-lists for runtime validation                                  */
/* ------------------------------------------------------------------ */

export const ASSISTANT_SIDE_EFFECTS: readonly AssistantSideEffect[] = [
  "read",
  "mutating",
  "irreversible",
] as const;

export const ASSISTANT_CATEGORIES: readonly AssistantCategory[] = [
  "leads",
  "fi",
  "service",
  "marketing",
  "notifications",
  "inventory",
  "analytics",
  "learning",
  "audit",
  "general",
] as const;

export const ASSISTANT_ROLES: readonly AssistantRole[] = [
  "salesperson",
  "fi_manager",
  "bdc_agent",
  "service_advisor",
  "service_manager",
  "gm",
  "marketing",
  "controller",
  "sales_manager",
  "owner",
  "admin",
  "any",
] as const;

export const ASSISTANT_SATISFACTION_SIGNALS: readonly AssistantSatisfactionSignal[] = [
  "positive",
  "neutral",
  "negative",
  "unknown",
] as const;

/** Allowed vertical values on an action row. Mirrors migration 080 CHECK. */
export const ASSISTANT_VERTICALS: readonly Vertical[] = [
  "auto",
  "retail",
  "service",
  "hospitality",
  "any",
] as const;

/** Allowed tenant vertical values. Excludes 'any' — a tenant is in one vertical. */
export const TENANT_VERTICALS: readonly TenantVertical[] = [
  "auto",
  "retail",
  "service",
  "hospitality",
] as const;

/** Slug rule: lowercase, alphanumerics + dot + underscore. 1-120 chars. */
export const ASSISTANT_SLUG_PATTERN = /^[a-z0-9][a-z0-9_.]{0,119}$/;
