/**
 * Unit tests for src/lib/leads/routing.ts
 */

import { routeLead } from "../routing";
import { scoreLead } from "../scoring";
import type { DealerUser, NormalizedLead } from "../types";

const lead: NormalizedLead = {
  id: "lead-1",
  dealer_id: "dealer-1",
  first_name: "Alex",
  last_name: "Rivera",
  email: "alex@example.com",
  phone: null,
  vehicle_interest: "2024 Toyota Camry",
  source_name: "Website",
  source_type: "webhook",
  created_at: "2026-05-11T00:00:00.000Z",
};

const users: DealerUser[] = [
  {
    id: "u-toyota",
    name: "Toyota Specialist",
    active: true,
    specializations: ["Toyota", "Camry"],
    current_load: 2,
    conversion_rate: 0.4,
  },
  {
    id: "u-ev",
    name: "EV Specialist",
    active: true,
    specializations: ["EV", "Tesla"],
    current_load: 0,
    conversion_rate: 0.7,
  },
  {
    id: "u-inactive",
    name: "Inactive Rep",
    active: false,
    specializations: ["Toyota"],
    current_load: 0,
    conversion_rate: 1,
  },
];

describe("routeLead", () => {
  it("picks the specialist whose tags match the vehicle of interest", () => {
    const score = scoreLead(lead, null);
    const decision = routeLead(lead, null, score, users);
    expect(decision.chosen_user_id).toBe("u-toyota");
    expect(decision.candidate_user_ids).toEqual(expect.arrayContaining(["u-toyota", "u-ev"]));
    expect(decision.candidate_user_ids).not.toContain("u-inactive");
  });

  it("falls back to load+performance when no specialization matches", () => {
    const oddLead: NormalizedLead = { ...lead, vehicle_interest: "2025 Subaru Outback" };
    const score = scoreLead(oddLead, null);
    const decision = routeLead(oddLead, null, score, users);
    // No spec match; ev specialist has zero load + best conversion, so wins.
    expect(decision.chosen_user_id).toBe("u-ev");
  });

  it("returns null chosen_user_id when no active users exist", () => {
    const decision = routeLead(lead, null, scoreLead(lead, null), []);
    expect(decision.chosen_user_id).toBeNull();
    expect(decision.factors).toEqual([]);
  });

  it("amplifies performance weight for hot leads", () => {
    const score = { score: 90, factors: [], tier: "hot" as const };
    const decision = routeLead({ ...lead, vehicle_interest: "anything" }, null, score, users);
    // With hot-lead weighting, the high-conversion u-ev should win even
    // without a specialization match.
    expect(decision.chosen_user_id).toBe("u-ev");
  });

  it("emits a non-empty reason string", () => {
    const decision = routeLead(lead, null, scoreLead(lead, null), users);
    expect(typeof decision.reason).toBe("string");
    expect(decision.reason.length).toBeGreaterThan(0);
  });
});
