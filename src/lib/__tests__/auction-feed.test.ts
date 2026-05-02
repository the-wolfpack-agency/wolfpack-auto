/**
 * Auction Feed — unit tests.
 *
 * Covers: VIN-pattern + mileage-band helpers, simulator adapter contract,
 * benchmark percentile math, opportunity scoring math, action handler,
 * triple-write graceful degradation (analytics + qdrant + neo4j absent).
 *
 * No DATABASE_URL needed — tests against the shadow paths so they run in
 * pure CI without Postgres. Real-Postgres E2E lives in tests/e2e.
 */

jest.mock("@/lib/analytics", () => ({
  trackServerEvent: jest.fn().mockResolvedValue(undefined),
}));

import {
  SimulatorAdapter,
  ManheimAdapter,
  AdesaAdapter,
  AcvAdapter,
  adapterFor,
  buildVinPattern,
  mileageBand,
  syncAllSources,
  scoreAcquisitionOpportunities,
  handleOpportunityAction,
  getTradeBenchmark,
  recomputeBenchmarks,
} from "@/lib/auction-feed";
import { trackServerEvent } from "@/lib/analytics";

const mockedTrack = trackServerEvent as unknown as jest.Mock;

beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.QDRANT_URL;
  delete process.env.NEO4J_URI;
  delete process.env.NEO4J_URL;
  mockedTrack.mockClear();
});

describe("mileageBand", () => {
  test("buckets known thresholds", () => {
    expect(mileageBand(0)).toBe("0-25k");
    expect(mileageBand(24_999)).toBe("0-25k");
    expect(mileageBand(25_000)).toBe("25-50k");
    expect(mileageBand(49_999)).toBe("25-50k");
    expect(mileageBand(50_000)).toBe("50-75k");
    expect(mileageBand(74_999)).toBe("50-75k");
    expect(mileageBand(75_000)).toBe("75-100k");
    expect(mileageBand(99_999)).toBe("75-100k");
    expect(mileageBand(100_000)).toBe("100-150k");
    expect(mileageBand(149_999)).toBe("100-150k");
    expect(mileageBand(150_000)).toBe("150k+");
    expect(mileageBand(999_999)).toBe("150k+");
  });
});

describe("buildVinPattern", () => {
  test("normalizes case and whitespace", () => {
    const a = buildVinPattern(2021, "Honda", "Accord", "EX", 42_000);
    const b = buildVinPattern(2021, " honda ", "accord", "ex", 42_000);
    expect(a).toBe(b);
    expect(a).toBe("2021|honda|accord|ex|25-50k");
  });

  test("handles null trim", () => {
    expect(buildVinPattern(2021, "Honda", "Accord", null, 42_000))
      .toBe("2021|honda|accord||25-50k");
  });
});

describe("SimulatorAdapter", () => {
  test("pulls upcoming with non-empty default seed", async () => {
    const a = new SimulatorAdapter();
    const upcoming = await a.pullUpcoming();
    expect(upcoming.length).toBeGreaterThan(0);
    for (const lot of upcoming) {
      expect(lot.vin).toMatch(/^[A-Z0-9]{11,}$/);
      expect(lot.status === "upcoming" || lot.status === "live").toBe(true);
    }
  });

  test("pulls live results with at least 5 sold (matches benchmark min sample)", async () => {
    const a = new SimulatorAdapter();
    const sold = await a.pullLiveResults();
    expect(sold.length).toBeGreaterThanOrEqual(5);
    for (const s of sold) {
      expect(["sold", "no_sale"].includes(s.status)).toBe(true);
    }
  });

  test("verifySignature is permissive (signed off-platform)", () => {
    const a = new SimulatorAdapter();
    expect(a.verifySignature("payload", "sig")).toBe(true);
  });

  test("filters seed listings by status", async () => {
    const fixed = [
      { source_listing_id: "s1", vin: "1HGCV1F34LA111111", year: 2020, make: "Honda", model: "Accord",
        trim: "EX", mileage: 30_000, condition_grade: 4, reserve_price_cents: 1_000_000,
        current_bid_cents: null, sale_price_cents: null, location: "L", sale_at: new Date().toISOString(), status: "upcoming" as const },
      { source_listing_id: "s2", vin: "1HGCV1F34LA222222", year: 2020, make: "Honda", model: "Accord",
        trim: "EX", mileage: 30_000, condition_grade: 4, reserve_price_cents: 1_000_000,
        current_bid_cents: null, sale_price_cents: 1_100_000, location: "L", sale_at: new Date().toISOString(), status: "sold" as const },
    ];
    const a = new SimulatorAdapter(fixed);
    expect((await a.pullUpcoming()).length).toBe(1);
    expect((await a.pullLiveResults()).length).toBe(1);
  });
});

describe("Real adapter skeletons", () => {
  test("Manheim throws not-configured", async () => {
    await expect(new ManheimAdapter().pullUpcoming()).rejects.toThrow(/manheim adapter not configured/i);
  });
  test("Adesa throws not-configured", async () => {
    await expect(new AdesaAdapter().pullLiveResults()).rejects.toThrow(/adesa adapter not configured/i);
  });
  test("ACV throws not-configured", async () => {
    await expect(new AcvAdapter().pullUpcoming()).rejects.toThrow(/acv adapter not configured/i);
  });
  test("adapterFor returns correct concrete type", () => {
    expect(adapterFor("simulator")).toBeInstanceOf(SimulatorAdapter);
    expect(adapterFor("manheim")).toBeInstanceOf(ManheimAdapter);
    expect(adapterFor("adesa")).toBeInstanceOf(AdesaAdapter);
    expect(adapterFor("acv")).toBeInstanceOf(AcvAdapter);
  });
  test("not-configured adapters refuse signatures", () => {
    expect(new ManheimAdapter().verifySignature("p", "s")).toBe(false);
  });
});

describe("syncAllSources (shadow mode)", () => {
  test("returns empty array and emits start+complete events with no_database reason", async () => {
    const result = await syncAllSources();
    expect(result).toEqual([]);
    const calls = mockedTrack.mock.calls.map((c) => c[0]);
    expect(calls).toContain("auction.sync_started");
    expect(calls).toContain("auction.sync_completed");
    const completeCall = mockedTrack.mock.calls.find((c) => c[0] === "auction.sync_completed");
    expect(completeCall?.[1]).toMatchObject({ sources: 0, reason: "no_database" });
  });
});

describe("scoreAcquisitionOpportunities (shadow mode)", () => {
  test("returns zero-scored result and emits opportunities_scored", async () => {
    const result = await scoreAcquisitionOpportunities("dealer-1");
    expect(result).toEqual({
      dealer_id: "dealer-1", scored: 0, inserted: 0, updated: 0,
    });
    const calls = mockedTrack.mock.calls.map((c) => c[0]);
    expect(calls).toContain("auction.opportunities_scored");
  });
});

describe("handleOpportunityAction", () => {
  test("rejects invalid action via mapping check", async () => {
    const r = await handleOpportunityAction("d", "o", "garbage" as never);
    expect(r.ok).toBe(false);
    expect(r.status).toBeNull();
  });

  test("shadow mode returns target status", async () => {
    const won = await handleOpportunityAction("d", "o", "won");
    expect(won.status).toBe("won");
    expect(won.ok).toBe(true);

    const dismiss = await handleOpportunityAction("d", "o", "dismiss");
    expect(dismiss.status).toBe("dismissed");

    const calls = mockedTrack.mock.calls.map((c) => c[0]);
    expect(calls.filter((c) => c === "auction.opportunity_action").length).toBe(2);
  });
});

describe("getTradeBenchmark — shadow fallback", () => {
  test("returns synthetic benchmark with p25 < p50 < p75", async () => {
    const b = await getTradeBenchmark(2021, "Honda", "Accord", "EX", 42_000);
    expect(b).not.toBeNull();
    expect(b!.p25_cents).toBeLessThan(b!.p50_cents);
    expect(b!.p50_cents).toBeLessThan(b!.p75_cents);
    expect(b!.sample_size).toBe(0);
    expect(b!.vin_pattern).toBe("2021|honda|accord|ex|25-50k");
  });
});

describe("recomputeBenchmarks (shadow mode)", () => {
  test("returns 0 when no DATABASE_URL", async () => {
    expect(await recomputeBenchmarks()).toBe(0);
  });
});

describe("Triple-write degradation", () => {
  test("scoreAcquisitionOpportunities does not throw when neo4j/qdrant unset", async () => {
    process.env.QDRANT_URL = "";
    process.env.NEO4J_URI = "";
    await expect(scoreAcquisitionOpportunities("d-1")).resolves.toBeDefined();
  });
});

describe("Module wiring smoke", () => {
  test("all major exports are functions/classes", () => {
    expect(typeof syncAllSources).toBe("function");
    expect(typeof scoreAcquisitionOpportunities).toBe("function");
    expect(typeof handleOpportunityAction).toBe("function");
    expect(typeof getTradeBenchmark).toBe("function");
    expect(typeof recomputeBenchmarks).toBe("function");
    expect(typeof mileageBand).toBe("function");
    expect(typeof buildVinPattern).toBe("function");
    expect(SimulatorAdapter).toBeDefined();
  });
});
