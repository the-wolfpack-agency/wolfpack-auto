#!/usr/bin/env npx tsx
/**
 * Seed the Dealership Literacy Ontology with ~50 starter entries.
 *
 * Idempotent: every entry upserts by its natural key (slug for concepts +
 * metrics, (source,target,relation) for mappings, (metric,role,context) for
 * translations, (metric,role,trigger) for actions). Re-running produces the
 * same end state, no duplicates.
 *
 * The seed data is hand-curated from docs/literacy-os-strategy-2026-05-12.md.
 * AI-proposed entries are NOT included in the seed — those go through the
 * authoring API + the LLM expansion stub at src/lib/literacy-ontology/
 * expansion.ts.
 *
 * Usage:
 *   npx tsx scripts/seed-literacy-ontology.ts
 *
 * Reads DATABASE_URL from .env.local if present.
 */

import * as fs from "fs";
import * as path from "path";

import {
  upsertAction,
  upsertConceptBySlug,
  upsertMapping,
  upsertMetricBySlug,
  upsertTranslation,
} from "../src/lib/literacy-ontology";
import type {
  ConceptDomain,
  GoodDirection,
  LiteracyActionRole,
  LiteracyRole,
  MappingRelation,
} from "../src/lib/literacy-ontology";

// ---------------------------------------------------------------------------
// Env bootstrap (.env.local) — match the pattern in seed-demo-dealer.ts
// ---------------------------------------------------------------------------

function loadEnvLocal(): void {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

// ---------------------------------------------------------------------------
// Concepts (15)
// ---------------------------------------------------------------------------

interface ConceptSeed {
  slug: string;
  name: string;
  domain: ConceptDomain;
  surface?: string;
  description: string;
}

export const CONCEPTS: ConceptSeed[] = [
  {
    slug: "vdp",
    name: "Vehicle Detail Page",
    domain: "digital",
    surface: "website",
    description: "Per-vehicle page on the dealer website. The digital storefront for a single unit.",
  },
  {
    slug: "serp",
    name: "Search Results Page",
    domain: "digital",
    surface: "website",
    description: "Filtered inventory results page. The digital equivalent of walking the lot.",
  },
  {
    slug: "front_row_vehicle",
    name: "Front Row Vehicle",
    domain: "physical",
    surface: "lot",
    description: "Vehicle positioned in the highest-visibility row of the physical lot.",
  },
  {
    slug: "back_lot_vehicle",
    name: "Back Lot Vehicle",
    domain: "physical",
    surface: "lot",
    description: "Vehicle parked in low-visibility back rows; common for aged inventory.",
  },
  {
    slug: "lead_form",
    name: "Lead Form",
    domain: "digital",
    surface: "website",
    description: "Inquiry form on the dealer website. Submission creates a lead in CRM.",
  },
  {
    slug: "walk_in",
    name: "Walk-in Customer",
    domain: "physical",
    surface: "lot",
    description: "Customer who arrives at the dealership without an appointment.",
  },
  {
    slug: "fi_desk",
    name: "F&I Desk",
    domain: "physical",
    surface: "fi_desk",
    description: "Finance & Insurance office where deal paperwork and product menus happen.",
  },
  {
    slug: "abandoned_lead_form",
    name: "Abandoned Lead Form",
    domain: "digital",
    surface: "website",
    description: "Customer started filling out a lead form but did not submit.",
  },
  {
    slug: "service_drive",
    name: "Service Drive",
    domain: "physical",
    surface: "service_drive",
    description: "Service lane where customers check in vehicles for maintenance and repair.",
  },
  {
    slug: "service_bay",
    name: "Service Bay",
    domain: "physical",
    surface: "service_drive",
    description: "Individual lift bay where a technician performs repairs.",
  },
  {
    slug: "billboard",
    name: "Billboard Ad",
    domain: "physical",
    surface: "marketing",
    description: "Outdoor advertising on roadways near the dealership.",
  },
  {
    slug: "homepage_hero",
    name: "Homepage Hero Banner",
    domain: "digital",
    surface: "website",
    description: "Top-of-fold rotating banner on the dealer website homepage.",
  },
  {
    slug: "phone_inquiry",
    name: "Phone Inquiry",
    domain: "hybrid",
    surface: "phone",
    description: "Inbound call from a customer — handled by BDC or salesperson.",
  },
  {
    slug: "customer_walks_out",
    name: "Customer Walks Out of F&I",
    domain: "physical",
    surface: "fi_desk",
    description: "Customer leaves the F&I desk without signing — every dealer's worst moment.",
  },
  {
    slug: "test_drive",
    name: "Test Drive",
    domain: "physical",
    surface: "lot",
    description: "Customer drives a vehicle off the lot with a salesperson.",
  },
];

// ---------------------------------------------------------------------------
// Mappings (12)
// ---------------------------------------------------------------------------

interface MappingSeed {
  source: string;
  target: string;
  relation: MappingRelation;
  confidence?: number;
}

export const MAPPINGS: MappingSeed[] = [
  { source: "vdp", target: "front_row_vehicle", relation: "equivalent_to", confidence: 0.95 },
  { source: "serp", target: "front_row_vehicle", relation: "aggregates", confidence: 0.85 },
  { source: "lead_form", target: "walk_in", relation: "equivalent_to", confidence: 0.9 },
  { source: "abandoned_lead_form", target: "customer_walks_out", relation: "analog_of", confidence: 0.85 },
  { source: "homepage_hero", target: "billboard", relation: "analog_of", confidence: 0.8 },
  { source: "phone_inquiry", target: "walk_in", relation: "precedes", confidence: 0.7 },
  { source: "serp", target: "vdp", relation: "precedes", confidence: 0.95 },
  { source: "vdp", target: "lead_form", relation: "precedes", confidence: 0.85 },
  { source: "lead_form", target: "test_drive", relation: "precedes", confidence: 0.6 },
  { source: "service_drive", target: "service_bay", relation: "precedes", confidence: 0.95 },
  { source: "back_lot_vehicle", target: "vdp", relation: "analog_of", confidence: 0.7 },
  { source: "test_drive", target: "fi_desk", relation: "precedes", confidence: 0.65 },
];

// ---------------------------------------------------------------------------
// Metrics (10)
// ---------------------------------------------------------------------------

interface MetricSeed {
  slug: string;
  name: string;
  concept_slug?: string;
  unit?: string;
  good_direction: GoodDirection;
  description: string;
}

export const METRICS: MetricSeed[] = [
  {
    slug: "vdp_scroll_depth",
    name: "VDP Scroll Depth",
    concept_slug: "vdp",
    unit: "percent",
    good_direction: "higher",
    description: "How far down the VDP a visitor scrolls. Proxy for how thoroughly they evaluated the unit.",
  },
  {
    slug: "vdp_time_on_page",
    name: "VDP Time On Page",
    concept_slug: "vdp",
    unit: "seconds",
    good_direction: "higher",
    description: "How long a visitor spends on the VDP. Bounce-rate inverse.",
  },
  {
    slug: "lead_response_time",
    name: "Lead Response Time",
    concept_slug: "lead_form",
    unit: "minutes",
    good_direction: "lower",
    description: "Minutes between a lead form submit and the first salesperson outreach.",
  },
  {
    slug: "fi_attach_rate_gap",
    name: "F&I Product Attach Rate Gap",
    concept_slug: "fi_desk",
    unit: "percent",
    good_direction: "lower",
    description: "Gap between this dealer's F&I product attach rate and the benchmark.",
  },
  {
    slug: "abandoned_form_rate",
    name: "Abandoned Lead Form Rate",
    concept_slug: "abandoned_lead_form",
    unit: "percent",
    good_direction: "lower",
    description: "Share of lead form starts that do not result in a submit.",
  },
  {
    slug: "service_bay_utilization",
    name: "Service Bay Utilization",
    concept_slug: "service_bay",
    unit: "percent",
    good_direction: "higher",
    description: "Share of available bay hours actually billed against repair orders.",
  },
  {
    slug: "days_on_lot",
    name: "Days On Lot",
    concept_slug: "front_row_vehicle",
    unit: "days",
    good_direction: "lower",
    description: "Days a vehicle has been in inventory since ingest.",
  },
  {
    slug: "homepage_hero_ctr",
    name: "Homepage Hero CTR",
    concept_slug: "homepage_hero",
    unit: "percent",
    good_direction: "higher",
    description: "Click-through rate on the homepage hero banner.",
  },
  {
    slug: "phone_inquiry_pickup_rate",
    name: "Phone Inquiry Pickup Rate",
    concept_slug: "phone_inquiry",
    unit: "percent",
    good_direction: "higher",
    description: "Share of inbound calls answered within 30 seconds.",
  },
  {
    slug: "test_drive_close_rate",
    name: "Test Drive Close Rate",
    concept_slug: "test_drive",
    unit: "percent",
    good_direction: "higher",
    description: "Share of test drives that convert to a signed deal.",
  },
];

// ---------------------------------------------------------------------------
// Translations (18 across 6 roles)
// ---------------------------------------------------------------------------

interface TranslationSeed {
  metric_slug: string;
  role: LiteracyRole;
  context?: string;
  template: string;
  quality_score?: number;
}

export const TRANSLATIONS: TranslationSeed[] = [
  // Salesperson
  {
    metric_slug: "vdp_scroll_depth",
    role: "salesperson",
    template:
      "Visitor scrolled {value}% down the VDP. That's a customer who walked the full length of the vehicle on the lot — they've already evaluated it.",
  },
  {
    metric_slug: "lead_response_time",
    role: "salesperson",
    template:
      "Lead waited {value} minutes for your call. Every minute past 5 is the digital equivalent of a customer standing on the lot without being greeted.",
  },
  {
    metric_slug: "test_drive_close_rate",
    role: "salesperson",
    template:
      "Your test drive close rate is {value}%. Every test drive you don't close is a customer who handed you the keys back and walked off the lot.",
  },

  // F&I manager
  {
    metric_slug: "fi_attach_rate_gap",
    role: "fi_manager",
    template:
      "You're {value}% below benchmark on F&I product attach. That's customers walking out of your F&I desk without coverage that protects them — and revenue you're leaving on the table.",
  },
  {
    metric_slug: "fi_attach_rate_gap",
    role: "fi_manager",
    context: "alert",
    template:
      "F&I attach gap widening: {value}% below benchmark this month. Same as if customers were walking past the F&I desk without sitting down.",
  },

  // BDC agent
  {
    metric_slug: "abandoned_form_rate",
    role: "bdc_agent",
    template:
      "{value}% of leads start filling out the form and bail. That's the same as a walk-in turning around at the door — they were ready to ask a question and something stopped them.",
  },
  {
    metric_slug: "phone_inquiry_pickup_rate",
    role: "bdc_agent",
    template:
      "Phone pickup rate {value}%. A missed call is the digital version of nobody being on the showroom floor when a customer walked in.",
  },
  {
    metric_slug: "lead_response_time",
    role: "bdc_agent",
    template:
      "Lead response time {value} minutes. Imagine a customer waiting at the welcome desk that long — that's the customer experience here.",
  },

  // Service advisor
  {
    metric_slug: "service_bay_utilization",
    role: "service_advisor",
    template:
      "Bay utilization is {value}%. An empty bay is a salesperson standing on the lot with no customers — payroll cost, no revenue.",
  },

  // Service manager
  {
    metric_slug: "service_bay_utilization",
    role: "service_manager",
    template:
      "Bay utilization {value}% this week. Every idle bay-hour is the same as a sales tech standing on the lot with no walk-ins — staff cost without throughput.",
  },

  // GM
  {
    metric_slug: "days_on_lot",
    role: "gm",
    template:
      "Average days on lot: {value}. Each day a unit sits is a day a customer is walking past it on someone else's lot.",
  },
  {
    metric_slug: "vdp_time_on_page",
    role: "gm",
    template:
      "Average VDP time on page is {value} seconds. That's how long the average customer stood next to a vehicle on the lot before deciding.",
  },
  {
    metric_slug: "homepage_hero_ctr",
    role: "gm",
    template:
      "Homepage hero CTR is {value}%. That's your billboard — measuring how often drivers turn into the lot after seeing it.",
  },
  {
    metric_slug: "lead_response_time",
    role: "gm",
    template:
      "Avg lead response time: {value} min. Picture a {value}-minute wait at your welcome desk. That's the experience leads are getting.",
  },

  // Marketing
  {
    metric_slug: "homepage_hero_ctr",
    role: "marketing",
    template:
      "Hero CTR {value}%. Think of the hero as a billboard on a stretch of highway: the CTR is the share of drivers who exit onto your lot.",
  },
  {
    metric_slug: "abandoned_form_rate",
    role: "marketing",
    template:
      "Lead form abandon rate {value}%. Every abandoned form is a walk-in who turned around at the door.",
  },

  // Fallback / 'any' role
  {
    metric_slug: "vdp_scroll_depth",
    role: "any",
    template:
      "VDP scroll depth: {value}%. How much of the vehicle the customer actually 'walked around' digitally.",
  },
  {
    metric_slug: "days_on_lot",
    role: "any",
    template: "Days on lot: {value}. How long this unit has been sitting on the front row.",
  },
];

// ---------------------------------------------------------------------------
// Actions (8)
// ---------------------------------------------------------------------------

interface ActionSeed {
  metric_slug: string;
  role: LiteracyActionRole;
  trigger_condition: string;
  recommendation_template: string;
  expected_outcome: string;
}

export const ACTIONS: ActionSeed[] = [
  {
    metric_slug: "lead_response_time",
    role: "salesperson",
    trigger_condition: "above_benchmark",
    recommendation_template:
      "Call this lead back within 5 minutes. Every additional minute is a customer standing on the lot unattended.",
    expected_outcome: "Lead-to-test-drive rate climbs 15-25%.",
  },
  {
    metric_slug: "lead_response_time",
    role: "bdc_agent",
    trigger_condition: "above_benchmark",
    recommendation_template:
      "Triage the call queue: oldest leads first. Treat each as a walk-in waiting at the welcome desk.",
    expected_outcome: "Avg response time drops below the 5-minute floor.",
  },
  {
    metric_slug: "fi_attach_rate_gap",
    role: "fi_manager",
    trigger_condition: "below_benchmark",
    recommendation_template:
      "Review menu presentations on the last 10 deals. Look for ones where you skipped the protection products — that's the same as not offering an extended warranty at the F&I desk.",
    expected_outcome: "Attach rate gap narrows by 3-5% within 30 days.",
  },
  {
    metric_slug: "service_bay_utilization",
    role: "service_manager",
    trigger_condition: "below_benchmark",
    recommendation_template:
      "Check tech scheduling and parts availability for the bottom-three bays. An idle bay is staff cost without revenue.",
    expected_outcome: "Bay utilization climbs back above the 75% floor.",
  },
  {
    metric_slug: "days_on_lot",
    role: "gm",
    trigger_condition: "top_decile",
    recommendation_template:
      "Units in the top decile for days-on-lot need a re-price, a photo refresh, or a front-row move. Treat them like a vehicle that's been sitting in the back lot too long.",
    expected_outcome: "Aged units start showing renewed VDP engagement within 7 days.",
  },
  {
    metric_slug: "abandoned_form_rate",
    role: "marketing",
    trigger_condition: "above_benchmark",
    recommendation_template:
      "Audit the lead form: which field is the abandonment point? That's the welcome-desk question that's turning walk-ins around.",
    expected_outcome: "Abandon rate drops 5-10%.",
  },
  {
    metric_slug: "homepage_hero_ctr",
    role: "marketing",
    trigger_condition: "declining_trend_3mo",
    recommendation_template:
      "Rotate hero creative — the billboard is going stale. Drivers stop noticing the same ad after 90 days.",
    expected_outcome: "CTR returns to its 90-day rolling baseline.",
  },
  {
    metric_slug: "test_drive_close_rate",
    role: "salesperson",
    trigger_condition: "below_benchmark",
    recommendation_template:
      "Practice the post-test-drive handoff sequence. Most lost deals here are momentum failures — same as letting a customer walk back to their car without bringing them inside.",
    expected_outcome: "Test-drive close rate climbs 5-10%.",
  },
];

// ---------------------------------------------------------------------------
// Seed runner
// ---------------------------------------------------------------------------

export interface SeedResult {
  concepts: number;
  mappings: number;
  metrics: number;
  translations: number;
  actions: number;
}

export async function seedLiteracyOntology(): Promise<SeedResult> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to seed the literacy ontology");
  }

  // ---- Concepts -----------------------------------------------------
  const conceptIdsBySlug = new Map<string, string>();
  for (const seed of CONCEPTS) {
    const concept = await upsertConceptBySlug({
      slug: seed.slug,
      name: seed.name,
      domain: seed.domain,
      surface: seed.surface ?? null,
      description: seed.description,
    });
    conceptIdsBySlug.set(seed.slug, concept.id);
  }

  // ---- Mappings -----------------------------------------------------
  let mappingCount = 0;
  for (const seed of MAPPINGS) {
    const sourceId = conceptIdsBySlug.get(seed.source);
    const targetId = conceptIdsBySlug.get(seed.target);
    if (!sourceId || !targetId) {
      throw new Error(
        `Mapping seed references unknown concept slug: ${seed.source} -> ${seed.target}`,
      );
    }
    await upsertMapping({
      source_concept_id: sourceId,
      target_concept_id: targetId,
      relation: seed.relation,
      confidence: seed.confidence ?? 1.0,
      source: "curated",
    });
    mappingCount++;
  }

  // ---- Metrics ------------------------------------------------------
  const metricIdsBySlug = new Map<string, string>();
  for (const seed of METRICS) {
    const conceptId = seed.concept_slug
      ? conceptIdsBySlug.get(seed.concept_slug) ?? null
      : null;
    const metric = await upsertMetricBySlug({
      slug: seed.slug,
      name: seed.name,
      concept_id: conceptId,
      unit: seed.unit ?? null,
      good_direction: seed.good_direction,
      description: seed.description,
    });
    metricIdsBySlug.set(seed.slug, metric.id);
  }

  // ---- Translations -------------------------------------------------
  let translationCount = 0;
  for (const seed of TRANSLATIONS) {
    const metricId = metricIdsBySlug.get(seed.metric_slug);
    if (!metricId) {
      throw new Error(
        `Translation seed references unknown metric slug: ${seed.metric_slug}`,
      );
    }
    await upsertTranslation({
      metric_id: metricId,
      role: seed.role,
      context: seed.context ?? null,
      template: seed.template,
      source: "curated",
      quality_score: seed.quality_score ?? 0.7,
    });
    translationCount++;
  }

  // ---- Actions ------------------------------------------------------
  let actionCount = 0;
  for (const seed of ACTIONS) {
    const metricId = metricIdsBySlug.get(seed.metric_slug);
    if (!metricId) {
      throw new Error(
        `Action seed references unknown metric slug: ${seed.metric_slug}`,
      );
    }
    await upsertAction({
      metric_id: metricId,
      role: seed.role,
      trigger_condition: seed.trigger_condition,
      recommendation_template: seed.recommendation_template,
      expected_outcome: seed.expected_outcome,
      source: "curated",
    });
    actionCount++;
  }

  return {
    concepts: CONCEPTS.length,
    mappings: mappingCount,
    metrics: METRICS.length,
    translations: translationCount,
    actions: actionCount,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const isMain = require.main === module;
if (isMain) {
  seedLiteracyOntology()
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log("[literacy-seed] complete:", result);
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[literacy-seed] failed:", err);
      process.exit(1);
    });
}
