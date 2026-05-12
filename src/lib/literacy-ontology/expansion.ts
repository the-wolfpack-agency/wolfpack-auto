/**
 * LLM-assisted expansion — STUB ONLY (v1, year-one Q2).
 *
 * The shape and integration surface for ontology authoring with LLM
 * assistance. The strategy doc (docs/literacy-os-strategy-2026-05-12.md)
 * calls for AI to propose translations + analogs that human reviewers
 * approve, reject, or refine.
 *
 * TODO(llm-provider): wire these to a real LLM provider. Today they return
 * deterministic mock proposals derived from the concept/metric slug so the
 * authoring API + UI plumbing can be built and tested end-to-end without
 * a network dependency. The output shape is the contract; the generation
 * mechanism is swap-in-place.
 *
 * Wolfpack Instinct will run the same engine against an agency-operations
 * ontology — that is the reuse opportunity the strategy doc identifies.
 * Keep the function signatures stable; swap the body when the provider is
 * wired up.
 */

import type {
  LiteracyRole,
  LiteracySource,
  MappingRelation,
} from "./types";
import { getConceptBySlug } from "./concepts";
import { getMetricBySlug } from "./metrics";

/* ------------------------------------------------------------------ */
/*  Public surface                                                      */
/* ------------------------------------------------------------------ */

export interface ProposedMapping {
  source_concept_slug: string;
  target_concept_slug: string;
  relation: MappingRelation;
  confidence: number;
  source: LiteracySource; // always 'ai_proposed' from this module
  rationale: string;
}

export interface ProposedTranslation {
  metric_slug: string;
  role: LiteracyRole;
  context: string | null;
  template: string;
  source: LiteracySource; // always 'ai_proposed' from this module
  rationale: string;
}

/* ------------------------------------------------------------------ */
/*  Stubs                                                               */
/* ------------------------------------------------------------------ */

/**
 * Propose candidate mappings for a concept. Returns up to `limit`
 * deterministic candidates derived from the concept slug for now.
 *
 * TODO(llm-provider): replace with a structured LLM call that takes the
 * concept name + description + the existing ontology slice and returns
 * candidate (target_concept_slug, relation, rationale) triples.
 */
export async function proposeMappings(
  conceptSlug: string,
  opts: { limit?: number } = {},
): Promise<ProposedMapping[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 3, 10));

  if (process.env.DATABASE_URL) {
    const concept = await getConceptBySlug(conceptSlug);
    if (!concept) return [];
  }

  // Deterministic mock candidates by slug pattern. Real implementations
  // will substitute these with structured LLM proposals.
  const candidates: ProposedMapping[] = [
    {
      source_concept_slug: conceptSlug,
      target_concept_slug: `physical_${conceptSlug}_analog`,
      relation: "analog_of",
      confidence: 0.6,
      source: "ai_proposed",
      rationale: "STUB: pattern-derived analog candidate. TODO(llm-provider) replace with real proposal.",
    },
    {
      source_concept_slug: conceptSlug,
      target_concept_slug: `${conceptSlug}_aggregate`,
      relation: "aggregates",
      confidence: 0.55,
      source: "ai_proposed",
      rationale: "STUB: pattern-derived aggregate candidate. TODO(llm-provider) replace with real proposal.",
    },
    {
      source_concept_slug: conceptSlug,
      target_concept_slug: `${conceptSlug}_predecessor`,
      relation: "precedes",
      confidence: 0.5,
      source: "ai_proposed",
      rationale: "STUB: pattern-derived precedes candidate. TODO(llm-provider) replace with real proposal.",
    },
  ];

  return candidates.slice(0, limit);
}

/**
 * Propose candidate role-specific translations for a metric. Returns up to
 * `limit` deterministic candidates.
 *
 * TODO(llm-provider): replace with a structured LLM call that takes the
 * metric name + good_direction + role + a few exemplar translations from
 * the same role and returns candidate templates.
 */
export async function proposeTranslations(
  metricSlug: string,
  role: LiteracyRole,
  opts: { limit?: number; context?: string } = {},
): Promise<ProposedTranslation[]> {
  const limit = Math.max(1, Math.min(opts.limit ?? 3, 10));
  const context = opts.context ?? null;

  let metricName = metricSlug.replace(/_/g, " ");
  if (process.env.DATABASE_URL) {
    const metric = await getMetricBySlug(metricSlug);
    if (!metric) return [];
    metricName = metric.name;
  }

  // Deterministic mock templates seeded off the metric slug + role.
  const candidates: ProposedTranslation[] = [
    {
      metric_slug: metricSlug,
      role,
      context,
      template: `Your ${metricName} is {value}. Think of it like a vehicle that's been sitting on the front row.`,
      source: "ai_proposed",
      rationale: "STUB: lot-language analog. TODO(llm-provider) replace with real proposal.",
    },
    {
      metric_slug: metricSlug,
      role,
      context,
      template: `${metricName}: {value}. When this drops, it's the same as a salesperson walking past a hot lead.`,
      source: "ai_proposed",
      rationale: "STUB: process-analog framing. TODO(llm-provider) replace with real proposal.",
    },
    {
      metric_slug: metricSlug,
      role,
      context,
      template: `{value} on ${metricName} — that's the digital equivalent of a customer leaving the lot without being greeted.`,
      source: "ai_proposed",
      rationale: "STUB: outcome-analog framing. TODO(llm-provider) replace with real proposal.",
    },
  ];

  return candidates.slice(0, limit);
}
