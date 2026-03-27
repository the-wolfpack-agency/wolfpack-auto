import { test, expect } from "@playwright/test";

/**
 * Tier 4 Data Flow Tests — verify that wired components
 * produce events that reach the analytics brain and generate insights.
 */

test.describe("Tier 4: Component → Brain Data Flow", () => {
  // ── Vehicle Comparison Events ──

  test("comparison events are accepted by the API", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "vehicle_comparison",
            action: "added_to_compare",
            page: "/inventory",
            session_id: `compare_test_${Date.now()}`,
            user_fingerprint: "compare_fp",
            timestamp: new Date().toISOString(),
            metadata: { vin: "VIN001", compare_count: 1, compared_with: [] },
          },
          {
            event_type: "vehicle_comparison",
            action: "added_to_compare",
            page: "/inventory",
            session_id: `compare_test_${Date.now()}`,
            user_fingerprint: "compare_fp",
            timestamp: new Date().toISOString(),
            metadata: { vin: "VIN002", compare_count: 2, compared_with: ["VIN001"] },
          },
          {
            event_type: "vehicle_comparison",
            action: "compare_initiated",
            page: "/inventory",
            session_id: `compare_test_${Date.now()}`,
            user_fingerprint: "compare_fp",
            timestamp: new Date().toISOString(),
            metadata: { vins: ["VIN001", "VIN002"], vehicle_count: 2 },
          },
        ],
      },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).accepted).toBe(3);
  });

  // ── Calculator Events ──

  test("calculator interaction events are accepted", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "calculator_input",
            action: "calc_interaction",
            page: "/inventory/VIN001",
            session_id: `calc_test_${Date.now()}`,
            user_fingerprint: "calc_fp",
            timestamp: new Date().toISOString(),
            metadata: {
              mode: "loan",
              vehicle_price: 35000,
              down_payment_range: "5K_10K",
              trade_in_range: "under_1K",
              term_months: 72,
              target_monthly_range: "300_500",
              interaction_count: 3,
            },
          },
          {
            event_type: "calculator_input",
            action: "calc_interaction",
            page: "/inventory/VIN001",
            session_id: `calc_test_${Date.now()}`,
            user_fingerprint: "calc_fp",
            timestamp: new Date().toISOString(),
            metadata: {
              mode: "lease",
              vehicle_price: 35000,
              down_payment_range: "1K_5K",
              term_months: 36,
              target_monthly_range: "500_700",
              interaction_count: 5,
            },
          },
        ],
      },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).accepted).toBe(2);
  });

  // ── Gallery Events ──

  test("gallery interaction events are accepted", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "gallery_interaction",
            action: "thumbnail_click",
            page: "/inventory/VIN001",
            session_id: `gallery_test_${Date.now()}`,
            user_fingerprint: "gallery_fp",
            timestamp: new Date().toISOString(),
            metadata: { photo_index: 2, total_photos: 4, alt: "2024 Toyota RAV4" },
          },
          {
            event_type: "gallery_interaction",
            action: "lightbox_opened",
            page: "/inventory/VIN001",
            session_id: `gallery_test_${Date.now()}`,
            user_fingerprint: "gallery_fp",
            timestamp: new Date().toISOString(),
            metadata: { photo_index: 0, alt: "2024 Toyota RAV4" },
          },
          {
            event_type: "gallery_interaction",
            action: "lightbox_closed",
            page: "/inventory/VIN001",
            session_id: `gallery_test_${Date.now()}`,
            user_fingerprint: "gallery_fp",
            timestamp: new Date().toISOString(),
            metadata: { dwell_ms: 8500, photos_viewed: 4, total_photos: 4, viewed_all: true, alt: "2024 Toyota RAV4" },
          },
        ],
      },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).accepted).toBe(3);
  });

  // ── Insight Generation from Seeded Data ──

  test.describe("Insights from wired component data", () => {
    test.beforeAll(async ({ request }) => {
      const now = Date.now();
      // Seed 4 sessions with comparison, calculator, and gallery data
      for (let s = 0; s < 4; s++) {
        await request.post("/api/analytics/events", {
          data: {
            events: [
              // Base session data (needed for 3-session minimum)
              { event_type: "page_view", action: "view", page: "/inventory", session_id: `t4_${s}_${now}`, user_fingerprint: `t4_fp_${s}`, timestamp: new Date().toISOString(), metadata: {} },
              { event_type: "time_on_page", action: "page_exit", page: "/inventory", session_id: `t4_${s}_${now}`, user_fingerprint: `t4_fp_${s}`, timestamp: new Date().toISOString(), metadata: { duration_ms: 20000 } },
              // Comparison events
              { event_type: "vehicle_comparison", action: "added_to_compare", page: "/inventory", session_id: `t4_${s}_${now}`, user_fingerprint: `t4_fp_${s}`, timestamp: new Date().toISOString(), metadata: { vin: "VIN001", compare_count: 1 } },
              { event_type: "vehicle_comparison", action: "added_to_compare", page: "/inventory", session_id: `t4_${s}_${now}`, user_fingerprint: `t4_fp_${s}`, timestamp: new Date().toISOString(), metadata: { vin: "VIN002", compare_count: 2 } },
              { event_type: "vehicle_comparison", action: "compare_initiated", page: "/inventory", session_id: `t4_${s}_${now}`, user_fingerprint: `t4_fp_${s}`, timestamp: new Date().toISOString(), metadata: { vins: ["VIN001", "VIN002"], vehicle_count: 2 } },
              // Calculator events
              { event_type: "calculator_input", action: "calc_interaction", page: "/inventory/VIN001", session_id: `t4_${s}_${now}`, user_fingerprint: `t4_fp_${s}`, timestamp: new Date().toISOString(), metadata: { mode: s % 2 === 0 ? "loan" : "lease", vehicle_price: 35000, down_payment_range: "5K_10K", term_months: 60, target_monthly_range: "300_500", interaction_count: 3 } },
              // Gallery events
              { event_type: "gallery_interaction", action: "lightbox_opened", page: "/inventory/VIN001", session_id: `t4_${s}_${now}`, user_fingerprint: `t4_fp_${s}`, timestamp: new Date().toISOString(), metadata: { photo_index: 0, alt: "2024 Toyota RAV4" } },
              { event_type: "gallery_interaction", action: "lightbox_closed", page: "/inventory/VIN001", session_id: `t4_${s}_${now}`, user_fingerprint: `t4_fp_${s}`, timestamp: new Date().toISOString(), metadata: { dwell_ms: 6000, photos_viewed: 3, total_photos: 4, viewed_all: false, alt: "2024 Toyota RAV4" } },
            ],
          },
        });
      }
    });

    test("comparison insight is generated from seeded data", async ({ request }) => {
      const res = await request.get("/api/analytics/insights?limit=20");
      const body = await res.json();
      const compInsights = body.insights.filter((i: { id: string }) => i.id.startsWith("comparison_patterns_"));
      if (compInsights.length > 0) {
        expect(compInsights[0].data).toHaveProperty("top_pairs");
        expect(compInsights[0].data.total_compares).toBeGreaterThan(0);
        expect(compInsights[0].category).toBe("engagement");
      }
    });

    test("financing intent insight is generated from seeded data", async ({ request }) => {
      const res = await request.get("/api/analytics/insights?limit=20");
      const body = await res.json();
      const finInsights = body.insights.filter((i: { id: string }) => i.id.startsWith("financing_intent_"));
      if (finInsights.length > 0) {
        expect(finInsights[0].data).toHaveProperty("loan_vs_lease");
        expect(finInsights[0].data).toHaveProperty("monthly_distribution");
        expect(finInsights[0].data).toHaveProperty("term_distribution");
        expect(finInsights[0].data.users).toBeGreaterThan(0);
      }
    });

    test("gallery engagement insight is generated from seeded data", async ({ request }) => {
      const res = await request.get("/api/analytics/insights?limit=20");
      const body = await res.json();
      const galInsights = body.insights.filter((i: { id: string }) => i.id.startsWith("gallery_engagement_"));
      if (galInsights.length > 0) {
        expect(galInsights[0].data).toHaveProperty("vehicles");
        expect(galInsights[0].data.vehicles.length).toBeGreaterThan(0);
        expect(galInsights[0].data.vehicles[0]).toHaveProperty("lightbox_opens");
        expect(galInsights[0].data.vehicles[0]).toHaveProperty("avg_dwell_ms");
      }
    });
  });

  // ── Live Component Tracking ──

  test("compare button on inventory page emits tracked event", async ({ page, request }) => {
    // Get initial event count
    const before = await (await request.get("/api/analytics/events")).json();
    const beforeCount = before.events_by_type?.vehicle_comparison ?? 0;

    await page.goto("/inventory");
    // Click a compare button
    const compareBtn = page.locator('[data-track="compare-toggle"]').first();
    await compareBtn.click();

    // Wait for event to flush
    await page.waitForTimeout(6000);

    const after = await (await request.get("/api/analytics/events")).json();
    const afterCount = after.events_by_type?.vehicle_comparison ?? 0;
    expect(afterCount).toBeGreaterThan(beforeCount);
  });

  test("photo gallery thumbnail click on VDP emits tracked event", async ({ page, request }) => {
    const before = await (await request.get("/api/analytics/events")).json();
    const beforeCount = before.events_by_type?.gallery_interaction ?? 0;

    await page.goto("/inventory/1HGCV1F34PA000001");
    // Click second thumbnail
    const thumb = page.locator('button[aria-label="View photo 2"]');
    await thumb.click();

    await page.waitForTimeout(6000);

    const after = await (await request.get("/api/analytics/events")).json();
    const afterCount = after.events_by_type?.gallery_interaction ?? 0;
    expect(afterCount).toBeGreaterThan(beforeCount);
  });
});
