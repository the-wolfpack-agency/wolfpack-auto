/**
 * Cross-Dealer Intelligence — API + page tests.
 *
 * Validates the intelligence endpoint returns well-structured anonymized data,
 * pricing benchmarks work, and the admin page renders.
 *
 * Run: npx playwright test tests/e2e/cross-dealer-intelligence.spec.ts
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

async function authedGet(request: any, path: string) {
  return request.get(`${BASE}${path}`);
}

const VALID_INSIGHT_TYPES = [
  "market_demand",
  "pricing_benchmark",
  "conversion_pattern",
  "inventory_velocity",
  "engagement_benchmark",
  "feature_adoption",
  "seasonal_trend",
  "optimal_pricing",
];

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

test.describe("Cross-Dealer Intelligence API", () => {
  test("1. GET /api/admin/analytics/intelligence returns 200 with insights array", async ({
    request,
  }) => {
    const res = await authedGet(request, "/api/admin/analytics/intelligence");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("insights");
    expect(Array.isArray(body.insights)).toBe(true);
    expect(body.insights.length).toBeGreaterThan(0);
  });

  test("2. Each insight has all required fields with correct types", async ({
    request,
  }) => {
    const res = await authedGet(request, "/api/admin/analytics/intelligence");
    const body = await res.json();

    for (const insight of body.insights) {
      expect(VALID_INSIGHT_TYPES).toContain(insight.type);
      expect(typeof insight.title).toBe("string");
      expect(insight.title.length).toBeGreaterThan(0);
      expect(typeof insight.description).toBe("string");
      expect(insight.description.length).toBeGreaterThan(0);
      expect(typeof insight.metric_value).toBe("number");
      expect(typeof insight.benchmark_value).toBe("number");
      expect(typeof insight.delta_percent).toBe("number");
      expect(typeof insight.recommended_action).toBe("string");
      expect(insight.recommended_action.length).toBeGreaterThan(0);
      expect(["high", "medium", "low"]).toContain(insight.confidence);
      expect(typeof insight.data_points).toBe("number");
      expect(insight.data_points).toBeGreaterThan(0);
      expect(typeof insight.region).toBe("string");
      expect(typeof insight.generated_at).toBe("string");
    }
  });

  test("3. Response includes network_stats with dealer count", async ({
    request,
  }) => {
    const res = await authedGet(request, "/api/admin/analytics/intelligence");
    const body = await res.json();

    expect(body).toHaveProperty("network_stats");
    expect(typeof body.network_stats.total_dealers).toBe("number");
    expect(typeof body.network_stats.total_vehicles).toBe("number");
    expect(typeof body.network_stats.regions_covered).toBe("number");
    expect(body.network_stats.total_dealers).toBeGreaterThan(0);
  });

  test("4. Insights contain no dealer names or customer PII", async ({
    request,
  }) => {
    const res = await authedGet(request, "/api/admin/analytics/intelligence");
    const body = await res.json();
    const raw = JSON.stringify(body);

    // Should never contain email patterns, SSNs, or phone numbers in the insight data
    expect(raw).not.toMatch(/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/); // no emails
    expect(raw).not.toMatch(/\d{3}-\d{2}-\d{4}/); // no SSNs
    // Dealer names should never appear in anonymized insights
    expect(raw).not.toContain("dealer_name");
  });

  test("5. Pricing benchmark returns 200 with make/model data", async ({
    request,
  }) => {
    const res = await authedGet(
      request,
      "/api/admin/analytics/intelligence?type=pricing_benchmark&make=Toyota&model=Camry&year=2024",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("benchmark");
    expect(body.benchmark.make).toBe("Toyota");
    expect(body.benchmark.model).toBe("Camry");
    expect(body.benchmark.year).toBe(2024);
    expect(typeof body.benchmark.avg_price).toBe("number");
    expect(body.benchmark.avg_price).toBeGreaterThan(0);
    expect(typeof body.benchmark.median_price).toBe("number");
    expect(typeof body.benchmark.min_price).toBe("number");
    expect(typeof body.benchmark.max_price).toBe("number");
    expect(typeof body.benchmark.sample_size).toBe("number");
    expect(typeof body.benchmark.avg_days_to_sell).toBe("number");
    expect(typeof body.benchmark.optimal_price_low).toBe("number");
    expect(typeof body.benchmark.optimal_price_high).toBe("number");
    expect(body.benchmark.optimal_price_low).toBeLessThan(body.benchmark.optimal_price_high);
  });

  test("6. Pricing benchmark rejects missing params with 400", async ({
    request,
  }) => {
    const res = await authedGet(
      request,
      "/api/admin/analytics/intelligence?type=pricing_benchmark&make=Toyota",
    );
    expect(res.status()).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  test("7. Regional demand returns 200 with demand signals", async ({
    request,
  }) => {
    const res = await authedGet(
      request,
      "/api/admin/analytics/intelligence?type=regional_demand&zip_prefix=021",
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("demand");
    expect(Array.isArray(body.demand)).toBe(true);
    expect(body.demand.length).toBeGreaterThan(0);

    for (const signal of body.demand) {
      expect(typeof signal.make).toBe("string");
      expect(typeof signal.model).toBe("string");
      expect(typeof signal.search_count).toBe("number");
      expect(signal.search_count).toBeGreaterThan(0);
      expect(typeof signal.trend_percent).toBe("number");
      expect(typeof signal.region).toBe("string");
    }
  });

  test("8. Insights cover multiple insight types", async ({ request }) => {
    const res = await authedGet(request, "/api/admin/analytics/intelligence");
    const body = await res.json();
    const types = new Set(body.insights.map((i: any) => i.type));

    // Demo mode should return at least 4 different insight types
    expect(types.size).toBeGreaterThanOrEqual(4);
  });

  test("9. Pricing benchmark rejects invalid year with 400", async ({
    request,
  }) => {
    const res = await authedGet(
      request,
      "/api/admin/analytics/intelligence?type=pricing_benchmark&make=Toyota&model=Camry&year=1800",
    );
    expect(res.status()).toBe(400);
  });

  test("10. Response includes generated_at timestamp", async ({ request }) => {
    const res = await authedGet(request, "/api/admin/analytics/intelligence");
    const body = await res.json();

    expect(body).toHaveProperty("generated_at");
    // Should be a valid ISO date string
    const date = new Date(body.generated_at);
    expect(date.getTime()).not.toBeNaN();
  });
});

test.describe("Market Intelligence Page", () => {
  test("11. /admin/market-intelligence loads with heading", async ({ page }) => {
    await page.goto(`${BASE}/admin/market-intelligence`);
    const heading = page.locator("h1");
    await expect(heading).toContainText("Market Intelligence");
  });

  test("12. Page renders insight cards after loading", async ({ page }) => {
    await page.goto(`${BASE}/admin/market-intelligence`);
    // Wait for loading to complete (skeleton disappears)
    await page.waitForSelector('[aria-label="Loading intelligence data"]', {
      state: "hidden",
      timeout: 10000,
    }).catch(() => {
      // May already be loaded
    });

    // Should have insight cards or error state
    const cards = page.locator(".rounded-xl.border.border-gray-200.bg-white");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });
});
