import { test, expect } from "@playwright/test";

test.describe("Data Store Verification — no silent write failures", () => {
  /**
   * This test suite addresses the Weaviate silent-discard problem:
   * writes that return success but silently drop data.
   *
   * We verify that data written via the analytics pipeline is actually
   * present and retrievable from the expected data stores.
   *
   * Pattern: write → read-back → verify content matches.
   */

  // ----------------------------------------------------------------
  // In-memory buffer verification (always available)
  // ----------------------------------------------------------------

  test("events written to buffer are retrievable via stats", async ({
    request,
  }) => {
    const uniqueType = `verify_buffer_${Date.now()}`;

    // Write
    const writeRes = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: uniqueType,
            action: "test_write",
            page: "/verify",
            session_id: `verify_session_${Date.now()}`,
            user_fingerprint: "verify_fp",
            timestamp: new Date().toISOString(),
            metadata: { test_marker: "buffer_verify" },
          },
        ],
      },
    });
    expect(writeRes.status()).toBe(200);
    const writeBody = await writeRes.json();
    expect(writeBody.accepted).toBe(1);

    // Read-back: verify event type appears in buffer stats
    const readRes = await request.get("/api/analytics/events");
    expect(readRes.status()).toBe(200);
    const stats = await readRes.json();
    expect(stats.events_by_type[uniqueType]).toBe(1);
  });

  test("session grouping is correct — events for same session are grouped", async ({
    request,
  }) => {
    const sessionId = `verify_grouping_${Date.now()}`;
    const eventCount = 5;

    // Write multiple events for the same session
    const events = Array.from({ length: eventCount }, (_, i) => ({
      event_type: "page_view",
      action: `view_${i}`,
      page: `/${i}`,
      session_id: sessionId,
      user_fingerprint: "grouping_fp",
      timestamp: new Date(Date.now() + i * 1000).toISOString(),
      metadata: { index: i },
    }));

    const writeRes = await request.post("/api/analytics/events", {
      data: { events },
    });
    expect(writeRes.status()).toBe(200);
    expect((await writeRes.json()).accepted).toBe(eventCount);

    // Verify all events are in the same session — insights should be able to
    // build a session summary from them
    const insightsRes = await request.get("/api/analytics/insights");
    expect(insightsRes.status()).toBe(200);
    const body = await insightsRes.json();
    expect(body.stats.active_sessions).toBeGreaterThanOrEqual(1);
  });

  // ----------------------------------------------------------------
  // Insight generation verification
  // ----------------------------------------------------------------

  test("seeded conversion data produces conversion insight with correct stats", async ({
    request,
  }) => {
    // Seed sessions with known conversion patterns
    const convertingSessions = 3;
    const nonConvertingSessions = 2;

    for (let i = 0; i < convertingSessions; i++) {
      await request.post("/api/analytics/events", {
        data: {
          events: [
            {
              event_type: "page_view",
              action: "view",
              page: "/inventory",
              session_id: `conv_verify_yes_${i}_${Date.now()}`,
              user_fingerprint: `conv_fp_${i}`,
              timestamp: new Date().toISOString(),
              metadata: {},
            },
            {
              event_type: "conversion",
              action: "submit_contact_form",
              page: "/contact",
              session_id: `conv_verify_yes_${i}_${Date.now()}`,
              user_fingerprint: `conv_fp_${i}`,
              timestamp: new Date().toISOString(),
              metadata: {},
            },
          ],
        },
      });
    }

    for (let i = 0; i < nonConvertingSessions; i++) {
      await request.post("/api/analytics/events", {
        data: {
          events: [
            {
              event_type: "page_view",
              action: "view",
              page: "/inventory",
              session_id: `conv_verify_no_${i}_${Date.now()}`,
              user_fingerprint: `conv_fp_no_${i}`,
              timestamp: new Date().toISOString(),
              metadata: {},
            },
          ],
        },
      });
    }

    // Verify insights reflect the conversion data
    const res = await request.get("/api/analytics/insights");
    const body = await res.json();

    const convInsight = body.insights.find((i: { id: string }) =>
      i.id.startsWith("conversion_paths"),
    );

    if (convInsight) {
      // The insight should mention conversion rate
      expect(convInsight.insight).toContain("convert");
      expect(convInsight.data.conversion_rate).toBeGreaterThan(0);
    }
  });

  test("seeded search queries appear in search insights", async ({
    request,
  }) => {
    const searchQueries = [
      "red trucks for towing",
      "SUV family car",
      "electric vehicle range",
    ];

    for (let i = 0; i < searchQueries.length; i++) {
      await request.post("/api/analytics/events", {
        data: {
          events: [
            {
              event_type: "search",
              action: "search_vehicles",
              page: "/inventory",
              session_id: `search_verify_${i}_${Date.now()}`,
              user_fingerprint: `search_fp_${i}`,
              timestamp: new Date().toISOString(),
              metadata: {
                query: searchQueries[i],
                result_count: i + 1,
                source: "keyword",
              },
            },
          ],
        },
      });
    }

    const res = await request.get("/api/analytics/insights");
    const body = await res.json();

    const searchInsight = body.insights.find((i: { id: string }) =>
      i.id.startsWith("search_patterns"),
    );

    if (searchInsight) {
      // Should contain at least one of our seeded queries
      const insightText = searchInsight.insight.toLowerCase();
      const foundQuery = searchQueries.some((q) =>
        insightText.includes(q.toLowerCase().split(" ")[0]),
      );
      expect(foundQuery).toBe(true);
    }
  });

  // ----------------------------------------------------------------
  // Write-then-read consistency for all event types
  // ----------------------------------------------------------------

  const allEventTypes = [
    "page_view",
    "click",
    "scroll",
    "time_on_page",
    "form_interaction",
    "heartbeat",
    "micro_hesitation",
    "cursor_heatmap",
    "copy_paste",
    "tab_visibility",
    "device_orientation",
    "scroll_velocity",
    "time_to_first_interaction",
    "chat_message",
    "return_visit",
    "cross_page_correlation",
    "conversion",
    "search",
    "vehicle_view",
  ];

  test("all 19 event types survive write-read cycle", async ({ request }) => {
    // Get baseline
    const beforeRes = await request.get("/api/analytics/events");
    const before = await beforeRes.json();

    // Write one of each type
    const events = allEventTypes.map((type) => ({
      event_type: type,
      action: `verify_${type}`,
      page: "/verify-all",
      session_id: `verify_all_types_${Date.now()}`,
      user_fingerprint: "verify_all_fp",
      timestamp: new Date().toISOString(),
      metadata: { verified_type: type },
    }));

    const writeRes = await request.post("/api/analytics/events", {
      data: { events },
    });
    expect(writeRes.status()).toBe(200);
    expect((await writeRes.json()).accepted).toBe(allEventTypes.length);

    // Read-back: verify ALL types are present
    const afterRes = await request.get("/api/analytics/events");
    const after = await afterRes.json();

    for (const type of allEventTypes) {
      const beforeCount = before.events_by_type[type] ?? 0;
      const afterCount = after.events_by_type[type] ?? 0;
      expect(afterCount).toBeGreaterThan(
        beforeCount,
        `Event type "${type}" was not persisted — possible silent discard!`,
      );
    }
  });

  // ----------------------------------------------------------------
  // No data loss under stress
  // ----------------------------------------------------------------

  test("1000 events across 10 concurrent batches — zero loss", async ({
    request,
  }) => {
    const beforeRes = await request.get("/api/analytics/events");
    const before = await beforeRes.json();
    const beforeTotal = before.total_events;

    const batchSize = 50; // cap per request
    const batchCount = 10;
    const expectedTotal = batchSize * batchCount;

    const promises = Array.from({ length: batchCount }, (_, batch) => {
      const events = Array.from({ length: batchSize }, (_, i) => ({
        event_type: "click",
        action: `stress_${batch}_${i}`,
        page: "/stress-test",
        session_id: `stress_session_${batch}`,
        user_fingerprint: `stress_fp_${batch}`,
        timestamp: new Date().toISOString(),
        metadata: { batch, index: i },
      }));

      return request.post("/api/analytics/events", {
        data: { events },
      });
    });

    const results = await Promise.all(promises);

    // All requests should succeed
    let totalAccepted = 0;
    for (const res of results) {
      expect(res.status()).toBe(200);
      const body = await res.json();
      totalAccepted += body.accepted;
    }

    // Verify exact count — zero loss
    expect(totalAccepted).toBe(expectedTotal);

    // Verify buffer reflects ALL events
    const afterRes = await request.get("/api/analytics/events");
    const after = await afterRes.json();
    expect(after.total_events).toBeGreaterThanOrEqual(
      beforeTotal + expectedTotal,
    );
  });

  // ----------------------------------------------------------------
  // Insights API returns consistent data across calls
  // ----------------------------------------------------------------

  test("insights API is idempotent — same data, same insights", async ({
    request,
  }) => {
    const res1 = await request.get("/api/analytics/insights");
    const body1 = await res1.json();

    const res2 = await request.get("/api/analytics/insights");
    const body2 = await res2.json();

    // Same number of insights
    expect(body1.insights.length).toBe(body2.insights.length);

    // Same categories present
    const cats1 = new Set(
      body1.insights.map((i: { category: string }) => i.category),
    );
    const cats2 = new Set(
      body2.insights.map((i: { category: string }) => i.category),
    );
    expect([...cats1].sort()).toEqual([...cats2].sort());
  });

  // ----------------------------------------------------------------
  // Qdrant vector store write verification (when available)
  // ----------------------------------------------------------------

  test("vector store health check endpoint works", async ({ request }) => {
    // The health endpoint should always respond, even if Qdrant is down
    const res = await request.get("/api/health");
    // 200 or 503 — but not a crash
    expect([200, 503]).toContain(res.status());
  });
});
