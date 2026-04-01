/**
 * Unit tests for src/lib/ab-testing.ts
 *
 * Tests deterministic variant assignment (FNV-1a), conversion tracking,
 * chi-squared statistical significance, multi-variant assignment,
 * and EventCollector payload builders.
 *
 * Run with: npx jest src/lib/__tests__/ab-testing.test.ts
 */

import {
  getVariant,
  trackImpression,
  trackConversion,
  getTestResults,
  assignVariant,
  buildAssignmentPayload,
  buildConversionPayload,
  getABTestResults,
  createABTest,
  type Variant,
  type TestResults,
  type ABTestResult,
} from "../ab-testing";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const DEMO_DEALER_ID = "00000000-0000-4000-a000-000000000001";

beforeEach(() => {
  delete process.env.DATABASE_URL;
});

/* -------------------------------------------------------------------------- */
/* getVariant — deterministic assignment                                       */
/* -------------------------------------------------------------------------- */

describe("getVariant — deterministic assignment", () => {
  it("returns 'a' or 'b'", () => {
    const v = getVariant("test1", "visitor1");
    expect(["a", "b"]).toContain(v);
  });

  it("same test + visitor always gets the same variant", () => {
    const v1 = getVariant("cta_color", "user-abc");
    const v2 = getVariant("cta_color", "user-abc");
    const v3 = getVariant("cta_color", "user-abc");
    expect(v1).toBe(v2);
    expect(v2).toBe(v3);
  });

  it("different visitors can get different variants", () => {
    const results = new Set<Variant>();
    // Use diverse visitor IDs to avoid hash clustering on sequential numbers
    const visitors = [
      "alice@example.com", "bob@test.com", "charlie_xyz",
      "user-abc-123", "fp-deadbeef", "session_99zz",
      "mobile-user-42", "desktop-anon-77", "tablet-usr-3",
      "returning-customer-a", "new-visitor-b", "vip-client-c",
    ];
    for (const v of visitors) {
      results.add(getVariant("test_split", v));
    }
    // With diverse visitors, both variants should be represented
    expect(results.size).toBe(2);
  });

  it("different tests can assign different variants to the same visitor", () => {
    const results = new Set<Variant>();
    for (let i = 0; i < 50; i++) {
      results.add(getVariant(`test-${i}`, "same-visitor"));
    }
    // With 50 different tests, both variants should appear
    expect(results.size).toBe(2);
  });

  it("both variants appear across multiple test names", () => {
    // FNV-1a distribution depends on input diversity — test with varied inputs
    const results = new Set<Variant>();
    const testNames = [
      "cta_color", "hero_layout", "pricing_display", "search_grid",
      "nav_style", "footer_design", "mobile_menu", "chat_position",
      "photo_count", "video_autoplay", "form_length", "badge_style",
    ];
    for (const test of testNames) {
      results.add(getVariant(test, "fixed-visitor-id"));
    }
    // With 12 different test names, both variants should appear
    expect(results.size).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* assignVariant — multi-variant                                               */
/* -------------------------------------------------------------------------- */

describe("assignVariant — multi-variant", () => {
  it("throws when variants array is empty", () => {
    expect(() => assignVariant("test", [], "fp")).toThrow(
      "At least one variant is required",
    );
  });

  it("returns the only variant when array has one element", () => {
    expect(assignVariant("test", ["only"], "fp")).toBe("only");
  });

  it("is deterministic for same test + fingerprint", () => {
    const variants = ["control", "variant_a", "variant_b"];
    const v1 = assignVariant("multi_test", variants, "user-xyz");
    const v2 = assignVariant("multi_test", variants, "user-xyz");
    expect(v1).toBe(v2);
  });

  it("assigns from the provided variants only", () => {
    const variants = ["red", "blue", "green"];
    for (let i = 0; i < 100; i++) {
      const v = assignVariant("color_test", variants, `user-${i}`);
      expect(variants).toContain(v);
    }
  });

  it("distributes across all variants over many users", () => {
    const variants = ["a", "b", "c"];
    const counts = new Map<string, number>();
    for (const v of variants) counts.set(v, 0);

    for (let i = 0; i < 900; i++) {
      const v = assignVariant("3way_test", variants, `visitor-${i}`);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }

    // Each variant should get at least 20% (vs expected 33%)
    for (const [, count] of counts) {
      expect(count).toBeGreaterThan(900 * 0.2);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* trackImpression + trackConversion                                           */
/* -------------------------------------------------------------------------- */

describe("trackImpression", () => {
  it("returns the assigned variant", async () => {
    const v = await trackImpression("imp_test", "visitor-1");
    expect(["a", "b"]).toContain(v);
  });

  it("returns the same variant as getVariant", async () => {
    const expected = getVariant("consistency_test", "visitor-2");
    const actual = await trackImpression("consistency_test", "visitor-2");
    expect(actual).toBe(expected);
  });
});

describe("trackConversion", () => {
  it("does not throw", async () => {
    await expect(
      trackConversion("conv_test", "visitor-1"),
    ).resolves.not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* getTestResults — in-memory store                                            */
/* -------------------------------------------------------------------------- */

describe("getTestResults", () => {
  it("returns a TestResults object with all fields", async () => {
    const result = await getTestResults("results_test");
    expect(result).toHaveProperty("test_name");
    expect(result).toHaveProperty("variant_a_views");
    expect(result).toHaveProperty("variant_a_conversions");
    expect(result).toHaveProperty("variant_b_views");
    expect(result).toHaveProperty("variant_b_conversions");
    expect(result).toHaveProperty("winner");
    expect(result).toHaveProperty("confidence");
  });

  it("starts with zero counts for a fresh test", async () => {
    const result = await getTestResults("brand_new_test_" + Date.now());
    expect(result.variant_a_views).toBe(0);
    expect(result.variant_a_conversions).toBe(0);
    expect(result.variant_b_views).toBe(0);
    expect(result.variant_b_conversions).toBe(0);
  });

  it("counts accumulate after impressions and conversions", async () => {
    const testName = "accumulation_test_" + Date.now();
    await trackImpression(testName, "v1");
    await trackImpression(testName, "v2");
    await trackImpression(testName, "v3");
    await trackConversion(testName, "v1");

    const result = await getTestResults(testName);
    const totalViews = result.variant_a_views + result.variant_b_views;
    const totalConv =
      result.variant_a_conversions + result.variant_b_conversions;
    expect(totalViews).toBe(3);
    expect(totalConv).toBe(1);
  });

  it("winner is null when sample size is too small", async () => {
    const result = await getTestResults("small_sample_" + Date.now());
    expect(result.winner).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Chi-squared significance — edge cases                                       */
/* -------------------------------------------------------------------------- */

describe("getTestResults — statistical significance", () => {
  it("confidence is between 0 and 1", async () => {
    const testName = "conf_test_" + Date.now();
    // Add some impressions
    for (let i = 0; i < 40; i++) {
      await trackImpression(testName, `visitor-${i}`);
    }
    const result = await getTestResults(testName);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("winner is null when confidence < 0.95", async () => {
    const testName = "low_conf_" + Date.now();
    // Few impressions, no strong signal
    for (let i = 0; i < 35; i++) {
      await trackImpression(testName, `v-${i}`);
    }
    const result = await getTestResults(testName);
    if (result.confidence < 0.95) {
      expect(result.winner).toBeNull();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* buildAssignmentPayload                                                      */
/* -------------------------------------------------------------------------- */

describe("buildAssignmentPayload", () => {
  it("returns test_name and variant", () => {
    const payload = buildAssignmentPayload("hero_cta", "blue");
    expect(payload.test_name).toBe("hero_cta");
    expect(payload.variant).toBe("blue");
  });
});

/* -------------------------------------------------------------------------- */
/* buildConversionPayload                                                      */
/* -------------------------------------------------------------------------- */

describe("buildConversionPayload", () => {
  it("returns test_name and variant without value", () => {
    const payload = buildConversionPayload("hero_cta", "blue");
    expect(payload.test_name).toBe("hero_cta");
    expect(payload.variant).toBe("blue");
    expect(payload.conversion_value).toBeUndefined();
  });

  it("includes conversion_value when provided", () => {
    const payload = buildConversionPayload("hero_cta", "blue", 49.99);
    expect(payload.conversion_value).toBe(49.99);
  });

  it("handles zero value correctly", () => {
    const payload = buildConversionPayload("test", "a", 0);
    expect(payload.conversion_value).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* getABTestResults — shadow mode                                              */
/* -------------------------------------------------------------------------- */

describe("getABTestResults — shadow mode", () => {
  it("returns mock AB test results", async () => {
    const results = await getABTestResults(DEMO_DEALER_ID);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("each result has all required fields", async () => {
    const results = await getABTestResults(DEMO_DEALER_ID);
    for (const r of results) {
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("variants");
      expect(r).toHaveProperty("target_metric");
      expect(r).toHaveProperty("status");
      expect(r).toHaveProperty("created_at");
      expect(r).toHaveProperty("winner");
      expect(r).toHaveProperty("confidence");
    }
  });

  it("each variant has assignments, conversions, conversion_rate", async () => {
    const results = await getABTestResults(DEMO_DEALER_ID);
    for (const r of results) {
      expect(r.variants.length).toBeGreaterThan(0);
      for (const v of r.variants) {
        expect(v).toHaveProperty("variant");
        expect(v).toHaveProperty("assignments");
        expect(v).toHaveProperty("conversions");
        expect(v).toHaveProperty("conversion_rate");
        expect(v).toHaveProperty("total_value");
        expect(v.assignments).toBeGreaterThanOrEqual(0);
        expect(v.conversions).toBeGreaterThanOrEqual(0);
        expect(v.conversion_rate).toBeGreaterThanOrEqual(0);
        expect(v.conversion_rate).toBeLessThanOrEqual(1);
      }
    }
  });

  it("confidence is between 0 and 1 for all results", async () => {
    const results = await getABTestResults(DEMO_DEALER_ID);
    for (const r of results) {
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("includes multi-variant tests (3+ variants)", async () => {
    const results = await getABTestResults(DEMO_DEALER_ID);
    const multiVariant = results.find((r) => r.variants.length >= 3);
    expect(multiVariant).toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* createABTest — shadow mode                                                  */
/* -------------------------------------------------------------------------- */

describe("createABTest — shadow mode", () => {
  it("returns success in shadow mode", async () => {
    const result = await createABTest(DEMO_DEALER_ID, {
      name: "test_experiment",
      variants: ["a", "b"],
      target_metric: "click_rate",
      created_at: new Date().toISOString(),
      status: "active",
    });
    expect(result.success).toBe(true);
    expect(result.test.name).toBe("test_experiment");
  });
});

/* -------------------------------------------------------------------------- */
/* Analytics compatibility                                                     */
/* -------------------------------------------------------------------------- */

describe("analytics compatibility", () => {
  it("TestResults is fully JSON-serializable", async () => {
    const result = await getTestResults("json_test");
    const serialized = JSON.stringify(result);
    const parsed = JSON.parse(serialized);
    expect(parsed.test_name).toBe(result.test_name);
    expect(parsed.variant_a_views).toBe(result.variant_a_views);
  });

  it("ABTestResult is fully JSON-serializable", async () => {
    const results = await getABTestResults(DEMO_DEALER_ID);
    const serialized = JSON.stringify(results);
    const parsed = JSON.parse(serialized);
    expect(parsed.length).toBe(results.length);
    expect(parsed[0].name).toBe(results[0].name);
  });

  it("assignment payload is valid EventCollector metadata", () => {
    const payload = buildAssignmentPayload("test", "variant_a");
    const serialized = JSON.stringify(payload);
    const parsed = JSON.parse(serialized);
    expect(parsed.test_name).toBe("test");
    expect(parsed.variant).toBe("variant_a");
  });

  it("conversion payload is valid EventCollector metadata", () => {
    const payload = buildConversionPayload("test", "variant_a", 100);
    const serialized = JSON.stringify(payload);
    const parsed = JSON.parse(serialized);
    expect(parsed.test_name).toBe("test");
    expect(parsed.conversion_value).toBe(100);
  });
});
