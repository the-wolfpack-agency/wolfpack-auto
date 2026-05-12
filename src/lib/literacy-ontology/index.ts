/**
 * Dealership Literacy Ontology — public entry point.
 *
 * The curated knowledge graph that maps digital business concepts to
 * physical-dealership concepts and renders role-specific translations and
 * recommended actions. See docs/literacy-os-strategy-2026-05-12.md for the
 * conceptual frame and migration 075 for the schema.
 */

export * from "./types";
export { LiteracyValidationError } from "./concepts";
export {
  listConcepts,
  getConceptBySlug,
  getConceptById,
  createConcept,
  upsertConceptBySlug,
  patchConcept,
  deleteConcept,
} from "./concepts";
export {
  listMappings,
  createMapping,
  upsertMapping,
  deleteMapping,
  relationLabel,
} from "./mappings";
export {
  listMetrics,
  getMetricBySlug,
  getMetricById,
  createMetric,
  upsertMetricBySlug,
  patchMetric,
  deleteMetric,
} from "./metrics";
export {
  listTranslations,
  getTranslation,
  renderTemplate,
  createTranslation,
  upsertTranslation,
  patchTranslation,
  deleteTranslation,
} from "./translations";
export {
  listActions,
  recommendAction,
  createAction,
  upsertAction,
  patchAction,
  deleteAction,
} from "./actions";
export {
  recordOutcome,
  listOutcomes,
  getTranslationQualitySignal,
} from "./outcomes";
export {
  proposeMappings,
  proposeTranslations,
} from "./expansion";
export type { ProposedMapping, ProposedTranslation } from "./expansion";
