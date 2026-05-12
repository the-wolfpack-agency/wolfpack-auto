/**
 * AI expansion — STUB ONLY (extends the migration 075 ontology pattern).
 *
 * Mirror of src/lib/literacy-ontology/expansion.ts (proposeMappings,
 * proposeTranslations) but targets the in-platform literacy surfaces:
 * walkthroughs (multi-step tours) + tooltips (single-concept disclosure).
 *
 * Today the functions return deterministic mock proposals derived from
 * the input slug + role + surface so the authoring API + UI plumbing
 * can be built and tested end-to-end without a network dependency. The
 * output shape is the contract.
 *
 * TODO(llm-provider): wire each function to a real LLM call. The
 * structure to populate already lives in the ontology (concepts +
 * translations per role); the model should compose those into a
 * walkthrough or tooltip rather than invent the underlying concepts.
 */

import type { LiteracyRole, LiteracySource } from "@/lib/literacy-ontology";
import { LITERACY_ROLES } from "@/lib/literacy-ontology";

import type {
  WalkthroughStep,
  WalkthroughTrigger,
} from "./walkthroughs";

/* ------------------------------------------------------------------ */
/*  Public surface                                                      */
/* ------------------------------------------------------------------ */

export interface ProposedWalkthrough {
  slug: string;
  name: string;
  role: LiteracyRole;
  surface: string | null;
  trigger_condition: WalkthroughTrigger | null;
  steps: WalkthroughStep[];
  source: LiteracySource; // always 'ai_proposed' from this module
  rationale: string;
}

export interface ProposedTooltip {
  concept_slug: string;
  role: LiteracyRole;
  short_text: string;
  expanded_text: string;
  source: LiteracySource; // always 'ai_proposed' from this module
  rationale: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function titleCase(slug: string): string {
  return slug
    .split(/[_-]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function roleLanguage(role: LiteracyRole): string {
  switch (role) {
    case "salesperson":
      return "an up at the door";
    case "fi_manager":
      return "a customer walking into the F&I office";
    case "bdc_agent":
      return "a fresh inbound call";
    case "service_advisor":
      return "a repair order ready to write";
    case "service_manager":
      return "the shop schedule for the day";
    case "gm":
      return "the month-end dashboard";
    case "marketing":
      return "a fresh-eyes shopper on the lot";
    case "controller":
      return "an end-of-month accounting close";
    case "any":
    default:
      return "a customer pulling onto the lot";
  }
}

/* ------------------------------------------------------------------ */
/*  Walkthrough proposal                                                */
/* ------------------------------------------------------------------ */

/**
 * Generate a deterministic walkthrough proposal for a role + surface.
 *
 * TODO(llm-provider): replace the stub body with a structured LLM call
 * that takes the existing ontology slice (concepts + role-scoped
 * translations + actions) and returns a coherent multi-step walk.
 */
export async function proposeWalkthrough(
  role: LiteracyRole,
  surface: string,
): Promise<ProposedWalkthrough> {
  if (!LITERACY_ROLES.includes(role)) {
    // Defensive: never produce a proposal with an invalid role.
    throw new Error(`proposeWalkthrough: invalid role ${role}`);
  }
  const safeSurface = surface && surface.trim().length > 0 ? surface : "dashboard";
  const slug = `ai_${role}_${safeSurface}_intro`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const name = `${titleCase(role)} • ${titleCase(safeSurface)} intro`;

  // Deterministic three-step skeleton. The shape is what the renderer
  // expects; the body is intentionally generic so it does not embed
  // dealer-identifying examples.
  const steps: WalkthroughStep[] = [
    {
      selector: `[data-walkthrough="${safeSurface}.start"]`,
      template: `Welcome. This is where you'll start every day. Treat it like ${roleLanguage(role)}.`,
      position: "bottom",
    },
    {
      selector: `[data-walkthrough="${safeSurface}.primary"]`,
      template: `Here's the number that matters most for your role today. We translate it into lot-language so it's obvious what to do next.`,
      position: "right",
    },
    {
      selector: `[data-walkthrough="${safeSurface}.action"]`,
      template: `When you're ready, the recommended next action lives here. Acting on it sends a signal back so the system gets better at helping you.`,
      position: "top",
    },
  ];

  return {
    slug,
    name,
    role,
    surface: safeSurface,
    trigger_condition: "first_visit",
    steps,
    source: "ai_proposed",
    rationale:
      "STUB: deterministic three-step intro derived from role+surface. " +
      "TODO(llm-provider) replace with structured LLM proposal that " +
      "selects real concept/translation IDs from the curated ontology.",
  };
}

/* ------------------------------------------------------------------ */
/*  Tooltip proposal                                                    */
/* ------------------------------------------------------------------ */

/**
 * Generate a 1-sentence + 2-3-sentence tooltip proposal for a (concept, role).
 *
 * TODO(llm-provider): replace with a structured LLM call that consumes
 * the concept name + role-specific translations from migration 075 and
 * returns a tight, dealer-friendly disclosure pair.
 */
export async function proposeTooltip(
  conceptSlug: string,
  role: LiteracyRole,
): Promise<ProposedTooltip> {
  if (!LITERACY_ROLES.includes(role)) {
    throw new Error(`proposeTooltip: invalid role ${role}`);
  }
  const conceptName = titleCase(conceptSlug);
  const analog = roleLanguage(role);

  const short = `${conceptName}: how this digital signal maps to ${analog}.`;
  const expanded =
    `${conceptName} is the digital equivalent of ${analog}. ` +
    `When the number moves, treat it like that lot moment — same urgency, same playbook. ` +
    `The recommended action sits one click away.`;

  return {
    concept_slug: conceptSlug,
    role,
    short_text: short,
    expanded_text: expanded,
    source: "ai_proposed",
    rationale:
      "STUB: deterministic role-keyed analogy. " +
      "TODO(llm-provider) replace with LLM call that pulls translations " +
      "from literacy_translations and composes a tight disclosure pair.",
  };
}
