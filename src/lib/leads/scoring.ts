/**
 * Lead scoring — rule-based, pure function.
 *
 * Returns a 0..100 score plus per-factor breakdown. Designed to be
 * predictable and testable; a learned model can plug in later but the
 * rule version is the safety net.
 *
 * Weights are constants below so they're easy to tune from a single place.
 */

import type {
  EnrichmentResult,
  LeadScore,
  NormalizedLead,
  ScoreFactor,
} from "./types";

const WEIGHTS = {
  vehicle_interest_match: 25,
  credit_signal: 20,
  geographic_proximity: 15,
  prior_vehicle_ownership: 15,
  property_owner: 10,
  source_quality: 15,
};

const SOURCE_QUALITY: Record<string, number> = {
  webhook: 0.9,
  api: 0.9,
  email: 0.6,
  manual: 0.8,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function vehicleInterestSpecificity(s: string): number {
  // More tokens / a year prefix = more specific.
  const tokens = s.trim().split(/\s+/).filter(Boolean);
  const hasYear = /^(19|20)\d{2}$/.test(tokens[0] ?? "");
  const base = clamp(tokens.length / 4, 0, 1);
  return hasYear ? Math.min(1, base + 0.25) : base;
}

function creditBandScore(band: string | undefined): number {
  if (!band) return 0.3;
  const map: Record<string, number> = {
    "super prime": 1,
    prime: 0.85,
    "near prime": 0.6,
    subprime: 0.35,
    "thin file": 0.4,
  };
  return map[band.toLowerCase()] ?? 0.4;
}

function distanceScore(miles: number | undefined): number {
  if (typeof miles !== "number") return 0.4;
  if (miles <= 5) return 1;
  if (miles <= 15) return 0.85;
  if (miles <= 30) return 0.6;
  if (miles <= 60) return 0.4;
  return 0.2;
}

/**
 * Compute the rule-based lead score.
 *
 * Pure function — no side effects, no time-of-day dependency.
 */
export function scoreLead(
  lead: NormalizedLead,
  enriched: EnrichmentResult | null,
): LeadScore {
  const factors: ScoreFactor[] = [];

  // Vehicle of interest specificity
  const viSpec = vehicleInterestSpecificity(lead.vehicle_interest);
  factors.push({
    name: "vehicle_interest_match",
    weight: WEIGHTS.vehicle_interest_match,
    score: viSpec,
    notes: viSpec > 0.6 ? "Specific year/model in inquiry" : "Vague vehicle interest",
  });

  // Credit signal (proxy)
  const creditScore = creditBandScore(enriched?.enriched.estimated_credit_band);
  factors.push({
    name: "credit_signal",
    weight: WEIGHTS.credit_signal,
    score: creditScore,
    notes: enriched?.enriched.estimated_credit_band
      ? `Estimated band: ${enriched.enriched.estimated_credit_band}`
      : "No enrichment credit signal available",
  });

  // Geographic proximity
  const distScore = distanceScore(enriched?.enriched.geographic_distance_miles);
  factors.push({
    name: "geographic_proximity",
    weight: WEIGHTS.geographic_proximity,
    score: distScore,
    notes:
      typeof enriched?.enriched.geographic_distance_miles === "number"
        ? `~${enriched.enriched.geographic_distance_miles}mi from rooftop`
        : "Distance unknown",
  });

  // Prior vehicle ownership — having any history = repeat buyer signal
  const priorCount = enriched?.enriched.vehicle_history_owned?.length ?? 0;
  factors.push({
    name: "prior_vehicle_ownership",
    weight: WEIGHTS.prior_vehicle_ownership,
    score: clamp(priorCount / 2, 0, 1),
    notes: priorCount > 0 ? `${priorCount} prior vehicles known` : "No prior ownership data",
  });

  // Property owner — proxy for financial stability
  factors.push({
    name: "property_owner",
    weight: WEIGHTS.property_owner,
    score: enriched?.enriched.property_owner === true ? 1 : 0,
    notes: enriched?.enriched.property_owner ? "Owns property" : "Renter or unknown",
  });

  // Source quality
  const sourceQ = SOURCE_QUALITY[lead.source_type] ?? 0.5;
  factors.push({
    name: "source_quality",
    weight: WEIGHTS.source_quality,
    score: sourceQ,
    notes: `Source: ${lead.source_type}`,
  });

  // Weighted sum scaled to 0..100
  const total = factors.reduce((acc, f) => acc + f.weight * f.score, 0);
  const score = Math.round(clamp(total, 0, 100));

  const tier: LeadScore["tier"] = score >= 75 ? "hot" : score >= 55 ? "warm" : score >= 30 ? "cool" : "cold";

  return { score, factors, tier };
}
