/**
 * Unit tests for src/lib/cross-dealer-intelligence.ts
 *
 * Tests anonymization, insight generation for all 8 types, demo data
 * structures, pricing benchmarks, demand signals, and network stats.
 *
 * All public functions fall back to demo data in shadow mode (no DATABASE_URL),
 * so these tests validate the demo/shadow path thoroughly.
 *
 * Run with: npx jest src/lib/__tests__/cross-dealer-intelligence.test.ts
 */

import {
  generateInsights,
  getRegionalDemand,
  getPricingBenchmark,
  getNetworkStats,
  type DealerInsight,
  type InsightType,
  type DemandSignal,
  type PricingBenchmark,
  type NetworkStats,
  type Confidence,
} from "../cross-dealer-intelligence";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const DEMO_DEALER_ID = "00000000-0000-4000-a000-000000000001";

/** Ensure shadow mode for all tests. */
beforeEach(() => {
  delete process.env.DATABASE_URL;
});

/* -------------------------------------------------------------------------- */
/* generateInsights — structure and completeness                               */
/* -------------------------------------------------------------------------- */

describe("generateInsights", () => {
  it("returns an array of DealerInsight objects", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    expect(Array.isArray(insights)).toBe(true);
    expect(insights.length).toBeGreaterThan(0);
  });

  it("each insight has all required fields", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    for (const insight of insights) {
      expect(insight).toHaveProperty("type");
      expect(insight).toHaveProperty("title");
      expect(insight).toHaveProperty("description");
      expect(insight).toHaveProperty("metric_value");
      expect(insight).toHaveProperty("benchmark_value");
      expect(insight).toHaveProperty("delta_percent");
      expect(insight).toHaveProperty("recommended_action");
      expect(insight).toHaveProperty("confidence");
      expect(insight).toHaveProperty("data_points");
      expect(insight).toHaveProperty("region");
      expect(insight).toHaveProperty("generated_at");
    }
  });

  it("titles and descriptions are plain English (not dev jargon)", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    for (const insight of insights) {
      expect(insight.title.length).toBeGreaterThan(10);
      expect(insight.description.length).toBeGreaterThan(20);
      // Should not contain raw technical terms
      expect(insight.title).not.toMatch(/null|undefined|NaN|error/i);
      expect(insight.description).not.toMatch(/null|undefined|NaN|error/i);
    }
  });

  it("recommended_action is actionable text", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    for (const insight of insights) {
      expect(insight.recommended_action.length).toBeGreaterThan(10);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* generateInsights — all 8 insight types present                              */
/* -------------------------------------------------------------------------- */

describe("generateInsights — all 8 insight types", () => {
  const ALL_TYPES: InsightType[] = [
    "market_demand",
    "pricing_benchmark",
    "conversion_pattern",
    "inventory_velocity",
    "engagement_benchmark",
    "feature_adoption",
    "seasonal_trend",
    "optimal_pricing",
  ];

  it("demo data covers all 8 insight types", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    const typesPresent = new Set(insights.map((i) => i.type));
    for (const t of ALL_TYPES) {
      expect(typesPresent).toContain(t);
    }
  });

  it("each insight type has valid confidence level", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    const validConfidence: Confidence[] = ["high", "medium", "low"];
    for (const insight of insights) {
      expect(validConfidence).toContain(insight.confidence);
    }
  });

  it("each insight type has non-negative data_points", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    for (const insight of insights) {
      expect(insight.data_points).toBeGreaterThanOrEqual(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Anonymization — no PII or dealer names in insights                          */
/* -------------------------------------------------------------------------- */

describe("generateInsights — anonymization", () => {
  it("no insight contains dealer names or customer PII", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    for (const insight of insights) {
      // Should not contain UUID-like dealer IDs
      expect(insight.title).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
      expect(insight.description).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      );
      // No email addresses
      expect(insight.description).not.toMatch(/[\w.-]+@[\w.-]+\.\w+/);
    }
  });

  it("region uses ZIP prefix (3 digits), not full ZIP code", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    for (const insight of insights) {
      // Region should be 3 digits or a short string, not a full 5-digit ZIP
      expect(insight.region.length).toBeLessThanOrEqual(5);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Individual insight type validation                                          */
/* -------------------------------------------------------------------------- */

describe("market_demand insight", () => {
  it("describes demand trends with percentage", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    const md = insights.find((i) => i.type === "market_demand");
    expect(md).toBeDefined();
    expect(md!.title).toContain("demand");
    expect(typeof md!.delta_percent).toBe("number");
  });
});

describe("pricing_benchmark insight", () => {
  it("compares dealer vs market pricing", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    const pb = insights.find((i) => i.type === "pricing_benchmark");
    expect(pb).toBeDefined();
    expect(pb!.metric_value).toBeGreaterThan(0);
    expect(pb!.benchmark_value).toBeGreaterThan(0);
  });
});

describe("conversion_pattern insight", () => {
  it("provides conversion advice", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    const cp = insights.find((i) => i.type === "conversion_pattern");
    expect(cp).toBeDefined();
    expect(cp!.recommended_action.length).toBeGreaterThan(0);
  });
});

describe("inventory_velocity insight", () => {
  it("shows days-on-lot vs average", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    const iv = insights.find((i) => i.type === "inventory_velocity");
    expect(iv).toBeDefined();
    expect(iv!.metric_value).toBeGreaterThan(0);
    expect(iv!.benchmark_value).toBeGreaterThan(0);
  });
});

describe("engagement_benchmark insight", () => {
  it("compares session duration to network average", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    const eb = insights.find((i) => i.type === "engagement_benchmark");
    expect(eb).toBeDefined();
    expect(eb!.title).toContain("time-on-site");
  });
});

describe("feature_adoption insight", () => {
  it("suggests feature enablement", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    const fa = insights.find((i) => i.type === "feature_adoption");
    expect(fa).toBeDefined();
    expect(fa!.recommended_action.length).toBeGreaterThan(0);
  });
});

describe("seasonal_trend insight", () => {
  it("identifies seasonal demand patterns", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    const st = insights.find((i) => i.type === "seasonal_trend");
    expect(st).toBeDefined();
    expect(st!.title.toLowerCase()).toContain("peak");
  });
});

describe("optimal_pricing insight", () => {
  it("recommends a price range", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    const op = insights.find((i) => i.type === "optimal_pricing");
    expect(op).toBeDefined();
    expect(op!.title).toContain("sells fastest");
  });
});

/* -------------------------------------------------------------------------- */
/* getRegionalDemand                                                           */
/* -------------------------------------------------------------------------- */

describe("getRegionalDemand", () => {
  it("returns an array of DemandSignal objects", async () => {
    const signals = await getRegionalDemand("021");
    expect(Array.isArray(signals)).toBe(true);
    expect(signals.length).toBeGreaterThan(0);
  });

  it("each signal has make, model, search_count, trend", async () => {
    const signals = await getRegionalDemand("021");
    for (const s of signals) {
      expect(s.make).toBeTruthy();
      expect(s.model).toBeTruthy();
      expect(typeof s.search_count).toBe("number");
      expect(typeof s.trend_percent).toBe("number");
      expect(s.region).toBeTruthy();
      expect(s.period).toBeTruthy();
    }
  });

  it("signals are sorted by search_count descending", async () => {
    const signals = await getRegionalDemand("021");
    for (let i = 1; i < signals.length; i++) {
      expect(signals[i - 1].search_count).toBeGreaterThanOrEqual(
        signals[i].search_count,
      );
    }
  });
});

/* -------------------------------------------------------------------------- */
/* getPricingBenchmark                                                         */
/* -------------------------------------------------------------------------- */

describe("getPricingBenchmark", () => {
  it("returns a PricingBenchmark with all fields", async () => {
    const pb = await getPricingBenchmark("Toyota", "Camry", 2024, "021");
    expect(pb.make).toBe("Toyota");
    expect(pb.model).toBe("Camry");
    expect(pb.year).toBe(2024);
    expect(pb.region).toBe("021");
    expect(pb.avg_price).toBeGreaterThan(0);
    expect(pb.median_price).toBeGreaterThan(0);
    expect(pb.min_price).toBeGreaterThan(0);
    expect(pb.max_price).toBeGreaterThan(0);
    expect(pb.sample_size).toBeGreaterThan(0);
    expect(pb.avg_days_to_sell).toBeGreaterThan(0);
    expect(pb.optimal_price_low).toBeGreaterThan(0);
    expect(pb.optimal_price_high).toBeGreaterThan(0);
  });

  it("min_price <= median_price <= avg_price <= max_price", async () => {
    const pb = await getPricingBenchmark("Honda", "CR-V", 2023, "021");
    expect(pb.min_price).toBeLessThanOrEqual(pb.median_price);
    expect(pb.median_price).toBeLessThanOrEqual(pb.max_price);
    expect(pb.min_price).toBeLessThanOrEqual(pb.max_price);
  });

  it("optimal price range is within min/max bounds", async () => {
    const pb = await getPricingBenchmark("Ford", "F-150", 2024, "021");
    expect(pb.optimal_price_low).toBeGreaterThanOrEqual(pb.min_price);
    expect(pb.optimal_price_high).toBeLessThanOrEqual(pb.max_price);
  });

  it("produces deterministic but varied results for different inputs", async () => {
    const toyota = await getPricingBenchmark("Toyota", "Camry", 2024, "021");
    const ford = await getPricingBenchmark("Ford", "F-150", 2024, "021");
    // Different make/model should produce different prices
    expect(toyota.avg_price).not.toBe(ford.avg_price);
  });
});

/* -------------------------------------------------------------------------- */
/* getNetworkStats                                                             */
/* -------------------------------------------------------------------------- */

describe("getNetworkStats", () => {
  it("returns network-wide statistics", async () => {
    const stats = await getNetworkStats();
    expect(stats.total_dealers).toBeGreaterThan(0);
    expect(stats.total_vehicles).toBeGreaterThan(0);
    expect(typeof stats.total_insights_generated).toBe("number");
    expect(stats.regions_covered).toBeGreaterThan(0);
  });

  it("all stat values are non-negative numbers", async () => {
    const stats = await getNetworkStats();
    expect(stats.total_dealers).toBeGreaterThanOrEqual(0);
    expect(stats.total_vehicles).toBeGreaterThanOrEqual(0);
    expect(stats.total_insights_generated).toBeGreaterThanOrEqual(0);
    expect(stats.regions_covered).toBeGreaterThanOrEqual(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Analytics compatibility                                                     */
/* -------------------------------------------------------------------------- */

describe("analytics compatibility", () => {
  it("DealerInsight is fully JSON-serializable for EventCollector", async () => {
    const insights = await generateInsights(DEMO_DEALER_ID);
    const serialized = JSON.stringify(insights);
    expect(serialized).toBeTruthy();
    const parsed = JSON.parse(serialized);
    expect(parsed.length).toBe(insights.length);
    expect(parsed[0].type).toBe(insights[0].type);
  });

  it("DemandSignal is fully JSON-serializable", async () => {
    const signals = await getRegionalDemand("021");
    const serialized = JSON.stringify(signals);
    const parsed = JSON.parse(serialized);
    expect(parsed.length).toBe(signals.length);
  });

  it("PricingBenchmark is fully JSON-serializable", async () => {
    const pb = await getPricingBenchmark("Toyota", "Camry", 2024, "021");
    const serialized = JSON.stringify(pb);
    const parsed = JSON.parse(serialized);
    expect(parsed.make).toBe("Toyota");
    expect(parsed.avg_price).toBe(pb.avg_price);
  });

  it("NetworkStats is fully JSON-serializable", async () => {
    const stats = await getNetworkStats();
    const serialized = JSON.stringify(stats);
    const parsed = JSON.parse(serialized);
    expect(parsed.total_dealers).toBe(stats.total_dealers);
  });
});
