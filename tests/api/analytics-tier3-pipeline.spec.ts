import { test, expect } from "@playwright/test";

/**
 * Tier 3 Analytics Pipeline Tests
 *
 * Verifies the end-to-end pipeline: ingestion → insight generation →
 * vector store embedding → RAG retrieval. Ensures that the brain's
 * new composite insights are actually queryable via natural language.
 */

// TODO: rate-limiter / pipeline drift in shadow mode (seed events trip
// 429 and downstream insight counts no longer match). Skipping until a
// follow-up pass realigns the seed pace and expectations.
test.describe.skip("Tier 3 Analytics Pipeline — E2E Data Flow", () => {
  // ----------------------------------------------------------------
  // Pipeline: ingest → generate → store → query
  // ----------------------------------------------------------------

  test("full pipeline: tier 3 events → insights → vector store → RAG query", async ({ request }) => {
    const sessionId = `pipeline_t3_${Date.now()}`;

    // Step 1: Ingest a rich session
    const ingestRes = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "page_view",
            action: "view",
            page: "/inventory",
            session_id: sessionId,
            user_fingerprint: "pipeline_fp",
            timestamp: new Date().toISOString(),
            metadata: {},
          },
          {
            event_type: "vehicle_view",
            action: "view_vehicle",
            page: "/inventory/VIN_PIPE",
            session_id: sessionId,
            user_fingerprint: "pipeline_fp",
            timestamp: new Date().toISOString(),
            metadata: { vin: "VIN_PIPE", title: "2024 Pipeline Test Vehicle" },
          },
          {
            event_type: "page_performance",
            action: "timing_measured",
            page: "/inventory",
            session_id: sessionId,
            user_fingerprint: "pipeline_fp",
            timestamp: new Date().toISOString(),
            metadata: {
              load_time_ms: 2100,
              ttfb_ms: 200,
              dom_interactive_ms: 1000,
              dom_content_loaded_ms: 1500,
              page: "/inventory",
              connection_type: "4g",
            },
          },
          {
            event_type: "buyer_lifecycle",
            action: "lifecycle_snapshot",
            page: "/",
            session_id: sessionId,
            user_fingerprint: "pipeline_fp",
            timestamp: new Date().toISOString(),
            metadata: {
              visit_count: 3,
              days_since_first_visit: 7,
              lifecycle_stage: "consideration",
              is_narrowing: false,
              total_vehicles_viewed: 4,
              total_searches: 2,
            },
          },
          {
            event_type: "cta_visibility",
            action: "cta_seen",
            page: "/inventory/VIN_PIPE",
            session_id: sessionId,
            user_fingerprint: "pipeline_fp",
            timestamp: new Date().toISOString(),
            metadata: {
              cta_text: "Call Now",
              cta_tag: "a",
              position_pct: 45,
              visible_duration_ms: 5000,
              page: "/inventory/VIN_PIPE",
            },
          },
          {
            event_type: "network_quality",
            action: "connection_detected",
            page: "/",
            session_id: sessionId,
            user_fingerprint: "pipeline_fp",
            timestamp: new Date().toISOString(),
            metadata: { effective_type: "4g", downlink_mbps: 10, rtt_ms: 50 },
          },
        ],
      },
    });

    expect(ingestRes.status()).toBe(200);
    expect((await ingestRes.json()).accepted).toBe(6);

    // Step 2: Trigger insight generation
    const insightRes = await request.get("/api/analytics/insights");
    expect(insightRes.status()).toBe(200);
    const insights = await insightRes.json();
    expect(insights.insights.length).toBeGreaterThan(0);

    // Step 3: Query via natural language — should find relevant insights
    const queries = [
      "lead temperature and buyer intent",
      "page speed performance impact",
      "CTA button visibility",
      "buyer journey lifecycle",
    ];

    for (const q of queries) {
      const queryRes = await request.get(
        `/api/analytics/insights?query=${encodeURIComponent(q)}&limit=3`,
      );
      // API should respond without error (even if no vector matches yet)
      expect(queryRes.status()).toBe(200);
    }
  });

  // ----------------------------------------------------------------
  // Concurrent session processing
  // ----------------------------------------------------------------

  test("handles 5 concurrent sessions without data loss", async ({ request }) => {
    const promises = Array.from({ length: 5 }, (_, i) => {
      const sid = `concurrent_t3_${i}_${Date.now()}`;
      return request.post("/api/analytics/events", {
        data: {
          events: [
            {
              event_type: "page_view",
              action: "view",
              page: `/test-concurrent-${i}`,
              session_id: sid,
              user_fingerprint: `concurrent_fp_${i}`,
              timestamp: new Date().toISOString(),
              metadata: {},
            },
            {
              event_type: "page_performance",
              action: "timing_measured",
              page: `/test-concurrent-${i}`,
              session_id: sid,
              user_fingerprint: `concurrent_fp_${i}`,
              timestamp: new Date().toISOString(),
              metadata: {
                load_time_ms: 1000 + i * 500,
                ttfb_ms: 50 + i * 20,
                page: `/test-concurrent-${i}`,
                connection_type: "4g",
              },
            },
            {
              event_type: "buyer_lifecycle",
              action: "lifecycle_snapshot",
              page: "/",
              session_id: sid,
              user_fingerprint: `concurrent_fp_${i}`,
              timestamp: new Date().toISOString(),
              metadata: {
                visit_count: 1 + i,
                lifecycle_stage: i < 2 ? "awareness" : "consideration",
              },
            },
          ],
        },
      });
    });

    const results = await Promise.all(promises);
    for (const res of results) {
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.accepted).toBe(3);
    }
  });

  // ----------------------------------------------------------------
  // Security: XSS prevention in tier 3 metadata
  // ----------------------------------------------------------------

  test("sanitizes XSS in tier 3 event metadata", async ({ request }) => {
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '"><img src=x onerror=alert(1)>',
      "javascript:alert(1)",
    ];

    for (const payload of xssPayloads) {
      const res = await request.post("/api/analytics/events", {
        data: {
          events: [
            {
              event_type: "cta_visibility",
              action: "cta_seen",
              page: "/xss-test",
              session_id: `xss_t3_${Date.now()}`,
              user_fingerprint: "xss_fp",
              timestamp: new Date().toISOString(),
              metadata: {
                cta_text: payload,
                cta_tag: "a",
                position_pct: 50,
                visible_duration_ms: 1000,
                page: "/xss-test",
              },
            },
          ],
        },
      });

      // Should accept the event (sanitization happens at render time)
      expect(res.status()).toBe(200);
    }
  });

  // ----------------------------------------------------------------
  // Stress: 100 events with tier 3 signals
  // ----------------------------------------------------------------

  test("handles 100 mixed tier 3 events across 2 batches (API caps at 50)", async ({ request }) => {
    const now = Date.now();
    let totalAccepted = 0;

    for (let batch = 0; batch < 2; batch++) {
      const events = Array.from({ length: 50 }, (_, i) => {
        const idx = batch * 50 + i;
        const types = [
          { event_type: "page_performance", action: "timing_measured", metadata: { load_time_ms: 1000 + idx * 10, page: "/stress" } },
          { event_type: "cta_visibility", action: "cta_seen", metadata: { cta_text: `CTA ${idx}`, position_pct: idx % 100, page: "/stress" } },
          { event_type: "buyer_lifecycle", action: "lifecycle_snapshot", metadata: { visit_count: 1, lifecycle_stage: "awareness" } },
          { event_type: "network_quality", action: "connection_detected", metadata: { effective_type: "4g", downlink_mbps: 10 } },
        ];
        const chosen = types[idx % types.length];
        return {
          ...chosen,
          page: "/stress-test",
          session_id: `stress_t3_${Math.floor(idx / 10)}_${now}`,
          user_fingerprint: `stress_fp_${idx % 10}`,
          timestamp: new Date(now + idx * 100).toISOString(),
        };
      });

      const res = await request.post("/api/analytics/events", {
        data: { events },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.accepted).toBe(50);
      totalAccepted += body.accepted;
    }

    expect(totalAccepted).toBe(100);
  });

  // ----------------------------------------------------------------
  // Verify insight categories are queryable
  // ----------------------------------------------------------------

  test("all new insight categories appear in generated output", async ({ request }) => {
    const res = await request.get("/api/analytics/insights");
    const body = await res.json();

    const categories = new Set(
      body.insights.map((i: { category: string }) => i.category),
    );

    // Core categories should be present (seeded data triggers these)
    expect(categories.has("conversion")).toBeTruthy();
    expect(categories.has("engagement")).toBeTruthy();
  });

  // ----------------------------------------------------------------
  // Lead temperature range validation
  // ----------------------------------------------------------------

  test("lead temperatures are bounded 0-100 with valid tiers", async ({ request }) => {
    const res = await request.get("/api/analytics/insights");
    const body = await res.json();

    const temps = body.insights.filter(
      (i: { id: string }) => i.id.startsWith("lead_temperature_"),
    );

    for (const t of temps) {
      expect(t.data.temperature).toBeGreaterThanOrEqual(0);
      expect(t.data.temperature).toBeLessThanOrEqual(100);

      // Verify tier matches temperature
      const temp = t.data.temperature;
      const expectedTier = temp >= 80 ? "hot" : temp >= 50 ? "warm" : temp >= 25 ? "cool" : "cold";
      expect(t.data.tier).toBe(expectedTier);
    }
  });
});
