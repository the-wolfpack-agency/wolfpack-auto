/**
 * Unit tests for src/lib/leads/enrichment.ts
 */

import {
  ClearbitProviderStub,
  FullContactProviderStub,
  MockEnrichmentProvider,
  PropertyRecordsProviderStub,
  enrichLead,
} from "../enrichment";
import type { EnrichmentProvider, NormalizedLead } from "../types";

const lead: NormalizedLead = {
  id: "lead-1",
  dealer_id: "dealer-1",
  first_name: "Alex",
  last_name: "Rivera",
  email: "alex@example.com",
  phone: "+15551234567",
  vehicle_interest: "2024 Toyota Camry",
  source_name: "Website",
  source_type: "webhook",
  created_at: "2026-05-11T00:00:00.000Z",
};

describe("MockEnrichmentProvider", () => {
  it("returns deterministic fields for the same lead", async () => {
    const p = new MockEnrichmentProvider();
    const a = await p.fetch(lead);
    const b = await p.fetch(lead);
    expect(a).toEqual(b);
    expect(a.extras).toMatchObject({ mock: true });
  });

  it("returns different fields for different leads", async () => {
    const p = new MockEnrichmentProvider();
    const a = await p.fetch(lead);
    const b = await p.fetch({ ...lead, email: "totally-different@example.com" });
    // At least one field differs in expectation
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
  });
});

describe("stubbed providers", () => {
  it("clearbit stub returns empty fields", async () => {
    expect(await new ClearbitProviderStub().fetch(lead)).toEqual({});
  });

  it("fullcontact stub returns empty fields", async () => {
    expect(await new FullContactProviderStub().fetch(lead)).toEqual({});
  });

  it("property-records stub returns empty fields", async () => {
    expect(await new PropertyRecordsProviderStub().fetch(lead)).toEqual({});
  });
});

describe("enrichLead", () => {
  it("merges multiple providers and reports sources", async () => {
    const a: EnrichmentProvider = {
      name: "a",
      async fetch() {
        return { household_income_band: "$50-75k", social_profiles: ["linkedin"] };
      },
    };
    const b: EnrichmentProvider = {
      name: "b",
      async fetch() {
        return { property_owner: true, social_profiles: ["facebook"] };
      },
    };
    const result = await enrichLead(lead, [a, b], () => new Date("2026-05-11T00:00:00.000Z"));
    expect(result.sources.sort()).toEqual(["a", "b"]);
    expect(result.enriched.household_income_band).toBe("$50-75k");
    expect(result.enriched.property_owner).toBe(true);
    expect((result.enriched.social_profiles ?? []).sort()).toEqual(["facebook", "linkedin"]);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("never throws when a provider throws", async () => {
    const bad: EnrichmentProvider = {
      name: "bad",
      async fetch() {
        throw new Error("boom");
      },
    };
    const ok: EnrichmentProvider = {
      name: "ok",
      async fetch() {
        return { property_owner: true };
      },
    };
    const result = await enrichLead(lead, [bad, ok]);
    expect(result.sources).toEqual(["ok"]);
    expect(result.enriched.property_owner).toBe(true);
  });

  it("returns zero confidence when every provider returns nothing", async () => {
    const empty: EnrichmentProvider = { name: "empty", async fetch() { return {}; } };
    const result = await enrichLead(lead, [empty]);
    expect(result.confidence).toBe(0);
    expect(result.sources).toEqual([]);
  });

  it("defaults to MockEnrichmentProvider when no providers passed", async () => {
    const result = await enrichLead(lead);
    expect(result.sources).toContain("mock");
    expect(result.confidence).toBeGreaterThan(0);
  });
});
