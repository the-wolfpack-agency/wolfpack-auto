/**
 * Literacy Walkthroughs + Tooltips — public entry point.
 *
 * In-platform literacy layer (migration 076) built on top of the curated
 * ontology engine in migration 075. See:
 *   - docs/literacy-os-strategy-2026-05-12.md (strategy)
 *   - docs/wolfpack-team-capabilities-2026-05-12.md (capability frame)
 *   - src/lib/literacy-ontology/ (the ontology this layer renders)
 */

export {
  listWalkthroughs,
  getWalkthroughBySlug,
  getWalkthroughById,
  getWalkthroughForRole,
  createWalkthrough,
  patchWalkthrough,
  deleteWalkthrough,
  validateStep,
  WALKTHROUGH_TRIGGERS,
} from "./walkthroughs";

export type {
  LiteracyWalkthrough,
  CreateWalkthroughInput,
  PatchWalkthroughInput,
  WalkthroughStep,
  WalkthroughTrigger,
} from "./walkthroughs";

export {
  listTooltips,
  getTooltipById,
  getTooltipForConcept,
  createTooltip,
  patchTooltip,
  deleteTooltip,
} from "./tooltips";

export type {
  LiteracyTooltip,
  CreateTooltipInput,
  PatchTooltipInput,
} from "./tooltips";

export { proposeWalkthrough, proposeTooltip } from "./expansion";
export type { ProposedWalkthrough, ProposedTooltip } from "./expansion";
