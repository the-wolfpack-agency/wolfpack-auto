/**
 * Unit tests for src/lib/leads/scoring.ts
 */

import { scoreLead } from "../scoring";
import type { EnrichmentResult, NormalizedLead } from "../types";

const baseLead: NormalizedLead = {
  id: "lead-1",
  dealer_id: "dealer-1",
  first_name: "Alex",
  last_name: "Rivera",
  email: "alex@example.com",
  phone: null,
  vehicle_interest: "2024 Toyota Camry XLE",
  source_name: "Website",
  source_type: "webhook",
  created_at: "2026-05-11T00:00:00.000Z",
};

function enrichment(overrides: Partial<EnrichmentResult["enriched"]> = {}): EnrichmentResult {
  return {
    lead_id: baseLead.id,
    dealer_id: baseLead.dealer_id,
    enriched: {
      household_income_band: "$75-100k",
      estimated_credit_band: "prime",
      property_owner: true,
      vehicle_history_owned: ["2018 Camry"],
      geographic_distance_miles: 5,
      social_profiles: ["linkedin"],
      ...overrides,
    },
    confidence: 1,
    sources: ["mock"],
    generated_at: "2026-05-11T00:00:00.000Z",
  };
}

describe("scoreLead", () => {
  it("returns 0..100 with factor breakdown", () => {
    const res = scoreLead(baseLead, enrichment());
    expect(res.score).toBeGreaterThanOrEqual(0);
    expect(res.score).toBeLessThanOrEqual(100);
    expect(res.factors.map((f) => f.name).sort()).toEqual(
      [
        "credit_signal",
        "geographic_proximity",
        "prior_vehicle_ownership",
        "property_owner",
        "source_quality",
        "vehicle_interest_match",
      ].sort(),
    );
  });

  it("scores a prime, local, repeat buyer hot", () => {
    const res = scoreLead(baseLead, enrichment());
    expect(res.tier).toBe("hot");
    expect(res.score).toBeGreaterThanOrEqual(75);
  });

  it("scores a vague, far-away subprime cold-or-cool", () => {
    const lead: NormalizedLead = { ...baseLead, vehicle_interest: "car", source_type: "email" };
    const res = scoreLead(
      lead,
      enrichment({
        estimated_credit_band: "subprime",
        geographic_distance_miles: 120,
        property_owner: false,
        vehicle_history_owned: [],
      }),
    );
    expect(["cold", "cool"]).toContain(res.tier);
  });

  it("survives null enrichment", () => {
    const res = scoreLead(baseLead, null);
    expect(res.factors).toHaveLength(6);
    expect(res.score).toBeGreaterThanOrEqual(0);
  });

  it("rewards specific year-prefixed vehicle interest", () => {
    const a = scoreLead({ ...baseLead, vehicle_interest: "car" }, null);
    const b = scoreLead({ ...baseLead, vehicle_interest: "2025 Honda CR-V Hybrid" }, null);
    const aFactor = a.factors.find((f) => f.name === "vehicle_interest_match")!;
    const bFactor = b.factors.find((f) => f.name === "vehicle_interest_match")!;
    expect(bFactor.score).toBeGreaterThan(aFactor.score);
  });

  it("source quality differs across types", () => {
    const webhook = scoreLead({ ...baseLead, source_type: "webhook" }, null);
    const email = scoreLead({ ...baseLead, source_type: "email" }, null);
    const wq = webhook.factors.find((f) => f.name === "source_quality")!.score;
    const eq = email.factors.find((f) => f.name === "source_quality")!.score;
    expect(wq).toBeGreaterThan(eq);
  });
});
