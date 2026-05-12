/**
 * Wolfpack Assistant — public entry point.
 *
 * Foundation for the Wolfpack Assistant integration. The eventual vision:
 * dealership employees configure the platform by talking to an assistant
 * instead of navigating settings pages. This module ships the action
 * registry, capability framework, conversation logger, and safety
 * guardrails — the four scaffolding pieces. The conversational layer
 * (LLM-driven prompt → action mapping) is year-one Q3-Q4 work and will
 * plug into these.
 *
 * See docs/wolfpack-assistant-integration-2026-05-12.md for the full
 * conceptual frame and migration 077 for the schema.
 */

export * from "./types";
export {
  AssistantValidationError,
  listActions,
  getActionBySlug,
  getActionById,
  createAction,
  upsertActionBySlug,
  patchAction,
  deleteAction,
} from "./action-registry";
export type { ListActionsOptions } from "./action-registry";
export {
  canRoleInvoke,
  isActionInVertical,
  matchActions,
  scoreAction,
  tokenize,
} from "./capability-matcher";
export type { MatchOptions } from "./capability-matcher";
export {
  DEFAULT_TENANT_VERTICAL,
  getTenantVertical,
  setTenantVertical,
} from "./vertical-lookup";
export type { SetTenantVerticalInput } from "./vertical-lookup";
export {
  startConversation,
  appendMessage,
  endConversation,
  listConversationsForDealer,
  getConversation,
  listMessages,
} from "./conversation-logger";
export type { ListConversationsOptions } from "./conversation-logger";
export {
  ASSISTANT_PROMPT_RATE_LIMIT,
  ASSISTANT_PROMPT_RATE_WINDOW_SECONDS,
  ASSISTANT_PROMPT_MAX_LENGTH,
  checkAssistantPromptRate,
  evaluateExecutionGate,
  evaluatePromptGate,
  looksLikePromptInjection,
  escapeCustomerContent,
} from "./safety";
export type {
  ExecutionGateOutcome,
  ExecutionGateDenyReason,
  ExecutionGateRequest,
  PromptGateOutcome,
  PromptGateDenyReason,
} from "./safety";
export {
  SEED_ACTIONS,
  seedAssistantActions,
} from "./seed-actions";
export type { AssistantSeedResult } from "./seed-actions";

/* Intent mapper — deterministic NLP layer over the action registry. */
export {
  mapIntent,
  extractParameters,
  filterParametersForAction,
  scoreKeywords,
  scoreAllActions,
  resolveTiebreak,
  resolveTiebreakSync,
  combineConfidence,
  isAmbiguous,
  ACTION_PATTERNS,
  patternsForAction,
  findPatternHit,
  AMBIGUITY_THRESHOLD,
  MIN_MATCH_CONFIDENCE,
  MAX_MATCHES,
} from "./intent-mapper";
export type {
  IntentMatch,
  IntentMatchSource,
  MapperResult,
  MapperContext,
  ActionPattern,
  ExtractedParameters,
  TiebreakInput,
} from "./intent-mapper";
