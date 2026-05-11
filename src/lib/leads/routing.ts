/**
 * Lead routing — chooses the best rep for a freshly-scored lead.
 *
 * Factors (all 0..1, then weighted):
 *   - specialization_match: do the rep's tags match the vehicle of interest?
 *   - load_penalty: penalize busy reps proportional to their queue depth
 *   - performance_bonus: historical conversion rate
 *
 * Pure function. Returns the chosen rep + the full per-rep factor breakdown
 * so the UI can render a "why this rep" panel.
 */

import type {
  DealerUser,
  EnrichmentResult,
  LeadScore,
  NormalizedLead,
  RoutingDecision,
  RoutingFactor,
} from "./types";

const WEIGHTS = {
  specialization_match: 0.5,
  load_penalty: 0.25,
  performance_bonus: 0.25,
};

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function specializationOverlap(vehicleTokens: string[], specializations: string[]): number {
  if (specializations.length === 0) return 0;
  const specTokens = new Set(specializations.flatMap(tokenize));
  let hits = 0;
  for (const t of vehicleTokens) if (specTokens.has(t)) hits++;
  // Diminishing returns: 2 matches near max.
  return Math.min(1, hits / 2);
}

function loadScore(load: number): number {
  // 0 leads → 1.0, 10+ leads → 0.0.
  if (load <= 0) return 1;
  if (load >= 10) return 0;
  return 1 - load / 10;
}

/**
 * Pure routing decision. Returns null chosen_user_id if no users available.
 */
export function routeLead(
  lead: NormalizedLead,
  enriched: EnrichmentResult | null,
  score: LeadScore,
  users: DealerUser[],
): RoutingDecision {
  const active = users.filter((u) => u.active);
  if (active.length === 0) {
    return {
      chosen_user_id: null,
      candidate_user_ids: [],
      factors: [],
      reason: "No active reps available",
    };
  }

  const vehicleTokens = tokenize(lead.vehicle_interest);
  // High-scoring leads also bias toward top performers more heavily.
  const performanceWeight =
    score.score >= 75 ? WEIGHTS.performance_bonus * 1.5 : WEIGHTS.performance_bonus;

  const factors: RoutingFactor[] = active.map((u) => {
    const spec = specializationOverlap(vehicleTokens, u.specializations);
    const load = loadScore(u.current_load);
    const perf = Math.max(0, Math.min(1, u.conversion_rate));
    const total =
      spec * WEIGHTS.specialization_match +
      load * WEIGHTS.load_penalty +
      perf * performanceWeight;
    return {
      user_id: u.id,
      specialization_match: spec,
      load_penalty: load,
      performance_bonus: perf,
      total,
    };
  });

  factors.sort((a, b) => b.total - a.total);
  const best = factors[0];

  void enriched; // reserved for future location-aware routing.

  const reasonParts: string[] = [];
  if (best.specialization_match > 0) {
    reasonParts.push("rep specializes in this vehicle");
  } else {
    reasonParts.push("no specialization match");
  }
  if (best.load_penalty > 0.6) reasonParts.push("rep has light current load");
  if (best.performance_bonus > 0.5) reasonParts.push("rep has strong conversion history");

  return {
    chosen_user_id: best.user_id,
    candidate_user_ids: factors.map((f) => f.user_id),
    factors,
    reason: reasonParts.join("; "),
  };
}
