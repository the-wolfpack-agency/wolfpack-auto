/**
 * Dealership Literacy Ontology — shared types.
 *
 * The curated knowledge graph that maps digital business concepts to
 * physical-dealership concepts. Six entity types: concepts, mappings,
 * metrics, translations, actions, outcomes. See
 * docs/literacy-os-strategy-2026-05-12.md for the full conceptual frame.
 */

/* ------------------------------------------------------------------ */
/*  Enums (mirror Postgres CHECK constraints exactly)                  */
/* ------------------------------------------------------------------ */

export type ConceptDomain = "digital" | "physical" | "hybrid";

export type MappingRelation =
  | "equivalent_to"
  | "analog_of"
  | "precedes"
  | "measures"
  | "aggregates";

export type GoodDirection = "higher" | "lower" | "depends";

/** Roles that can receive a translation. `any` is the catch-all default. */
export type LiteracyRole =
  | "salesperson"
  | "fi_manager"
  | "bdc_agent"
  | "service_advisor"
  | "service_manager"
  | "gm"
  | "marketing"
  | "controller"
  | "any";

/** Roles that can receive an action recommendation (no `any`). */
export type LiteracyActionRole = Exclude<LiteracyRole, "any">;

/**
 * Provenance of a curated entry. `curated` is hand-authored; `ai_proposed`
 * is the raw LLM output (see expansion.ts); `ai_approved` is an LLM proposal
 * that a human reviewer has signed off on.
 */
export type LiteracySource = "curated" | "ai_proposed" | "ai_approved";

/* ------------------------------------------------------------------ */
/*  Row shapes                                                          */
/* ------------------------------------------------------------------ */

export interface LiteracyConcept {
  id: string;
  slug: string;
  name: string;
  domain: ConceptDomain;
  surface: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiteracyMapping {
  id: string;
  source_concept_id: string;
  target_concept_id: string;
  relation: MappingRelation;
  confidence: number;
  source: LiteracySource;
  created_at: string;
}

export interface LiteracyMetric {
  id: string;
  slug: string;
  name: string;
  concept_id: string | null;
  unit: string | null;
  good_direction: GoodDirection | null;
  description: string | null;
  created_at: string;
}

export interface LiteracyTranslation {
  id: string;
  metric_id: string;
  role: LiteracyRole;
  context: string | null;
  template: string;
  source: LiteracySource;
  quality_score: number;
  created_at: string;
}

export interface LiteracyAction {
  id: string;
  metric_id: string;
  trigger_condition: string;
  role: LiteracyActionRole;
  recommendation_template: string;
  expected_outcome: string | null;
  source: LiteracySource;
  created_at: string;
}

export interface LiteracyOutcome {
  id: string;
  dealer_id: string;
  translation_id: string | null;
  action_id: string | null;
  rendered_at: string;
  was_clicked: boolean | null;
  was_acted_on: boolean | null;
  metric_delta: number | null;
  recorded_at: string;
}

/* ------------------------------------------------------------------ */
/*  Input shapes (for CREATE)                                           */
/* ------------------------------------------------------------------ */

export interface CreateConceptInput {
  slug: string;
  name: string;
  domain: ConceptDomain;
  surface?: string | null;
  description?: string | null;
}

export interface CreateMappingInput {
  source_concept_id: string;
  target_concept_id: string;
  relation: MappingRelation;
  confidence?: number;
  source?: LiteracySource;
}

export interface CreateMetricInput {
  slug: string;
  name: string;
  concept_id?: string | null;
  unit?: string | null;
  good_direction?: GoodDirection | null;
  description?: string | null;
}

export interface CreateTranslationInput {
  metric_id: string;
  role: LiteracyRole;
  context?: string | null;
  template: string;
  source?: LiteracySource;
  quality_score?: number;
}

export interface CreateActionInput {
  metric_id: string;
  trigger_condition: string;
  role: LiteracyActionRole;
  recommendation_template: string;
  expected_outcome?: string | null;
  source?: LiteracySource;
}

export interface RecordOutcomeInput {
  dealer_id: string;
  translation_id?: string | null;
  action_id?: string | null;
  rendered_at?: string;
  was_clicked?: boolean | null;
  was_acted_on?: boolean | null;
  metric_delta?: number | null;
}

/* ------------------------------------------------------------------ */
/*  Patch shapes (for PATCH / UPDATE)                                   */
/* ------------------------------------------------------------------ */

export interface PatchConceptInput {
  name?: string;
  domain?: ConceptDomain;
  surface?: string | null;
  description?: string | null;
}

export interface PatchMetricInput {
  name?: string;
  concept_id?: string | null;
  unit?: string | null;
  good_direction?: GoodDirection | null;
  description?: string | null;
}

export interface PatchTranslationInput {
  template?: string;
  context?: string | null;
  source?: LiteracySource;
  quality_score?: number;
}

export interface PatchActionInput {
  trigger_condition?: string;
  recommendation_template?: string;
  expected_outcome?: string | null;
  source?: LiteracySource;
}

/* ------------------------------------------------------------------ */
/*  Allow-lists for runtime validation                                  */
/* ------------------------------------------------------------------ */

export const CONCEPT_DOMAINS: readonly ConceptDomain[] = [
  "digital",
  "physical",
  "hybrid",
] as const;

export const MAPPING_RELATIONS: readonly MappingRelation[] = [
  "equivalent_to",
  "analog_of",
  "precedes",
  "measures",
  "aggregates",
] as const;

export const GOOD_DIRECTIONS: readonly GoodDirection[] = [
  "higher",
  "lower",
  "depends",
] as const;

export const LITERACY_ROLES: readonly LiteracyRole[] = [
  "salesperson",
  "fi_manager",
  "bdc_agent",
  "service_advisor",
  "service_manager",
  "gm",
  "marketing",
  "controller",
  "any",
] as const;

export const LITERACY_ACTION_ROLES: readonly LiteracyActionRole[] = [
  "salesperson",
  "fi_manager",
  "bdc_agent",
  "service_advisor",
  "service_manager",
  "gm",
  "marketing",
  "controller",
] as const;

export const LITERACY_SOURCES: readonly LiteracySource[] = [
  "curated",
  "ai_proposed",
  "ai_approved",
] as const;

/** Slug rule: lowercase, alphanumerics + underscore. 1-80 chars. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9_]{0,79}$/;
