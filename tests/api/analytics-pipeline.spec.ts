import { test, expect } from "@playwright/test";

// Shadow-mode skip: analytics pipeline (events → buffer → insights → chat)
// requires the persisted insight buffer + vector store to be live. Phase 1
// Tests runs in shadow mode (DATABASE_URL='') so deterministic round-trip
// can't be asserted. Re-run via the real-DB integration phase.
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

test.describe("Analytics Data Pipeline — end-to-end", () => {
  // ----------------------------------------------------------------
  // Full pipeline: events → buffer → insights → chat consumption
  // ----------------------------------------------------------------

  test("events flow from ingestion to buffer stats", async ({ request }) => {
    const sessionId = `pipeline_test_${Date.now()}`;

    // Step 1: Send events
    const postRes = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "page_view",
            action: "view",
            page: "/inventory",
            session_id: sessionId,
            user_fingerprint: "pipeline_fp",
            timestamp: new Date().toISOString(),
            metadata: { referrer: "https://google.com" },
          },
          {
            event_type: "click",
            action: "click_vehicle_card",
            page: "/inventory",
            session_id: sessionId,
            user_fingerprint: "pipeline_fp",
            timestamp: new Date().toISOString(),
            metadata: { tag: "a", text: "2024 Honda CR-V", href: "/inventory/VIN456" },
          },
        ],
      },
    });
    expect(postRes.status()).toBe(200);

    // Step 2: Verify events appear in buffer stats
    const statsRes = await request.get("/api/analytics/events");
    expect(statsRes.status()).toBe(200);
    const stats = await statsRes.json();
    expect(stats.total_events).toBeGreaterThanOrEqual(2);
    expect(stats.active_sessions).toBeGreaterThanOrEqual(1);
    expect(stats.events_by_type).toHaveProperty("page_view");
    expect(stats.events_by_type).toHaveProperty("click");
  });

  test("multi-session data produces cross-session insights", async ({
    request,
  }) => {
    // Send data from multiple distinct sessions
    for (let i = 0; i < 4; i++) {
      await request.post("/api/analytics/events", {
        data: {
          events: [
            {
              event_type: "page_view",
              action: "view",
              page: "/financing",
              session_id: `multi_session_${i}`,
              user_fingerprint: `multi_fp_${i}`,
              timestamp: new Date().toISOString(),
              metadata: {},
            },
            {
              event_type: "time_on_page",
              action: "page_hidden",
              page: "/financing",
              session_id: `multi_session_${i}`,
              user_fingerprint: `multi_fp_${i}`,
              timestamp: new Date().toISOString(),
              metadata: { duration_ms: 30000 + i * 10000 },
            },
          ],
        },
      });
    }

    // Insights should now include data from these sessions
    const res = await request.get("/api/analytics/insights");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.stats.active_sessions).toBeGreaterThanOrEqual(4);
  });

  // ----------------------------------------------------------------
  // Chat ↔ Analytics integration
  // ----------------------------------------------------------------

  test("chat messages are tracked as analytics events", async ({
    request,
  }) => {
    // Send a chat message
    const chatRes = await request.post("/api/chat", {
      data: { message: "do you have any trucks under $30,000?" },
      headers: { "x-session-id": "chat_analytics_test" },
    });
    expect(chatRes.status()).toBe(200);

    // Verify the chat interaction appears in the analytics buffer
    const statsRes = await request.get("/api/analytics/events");
    const stats = await statsRes.json();
    expect(stats.events_by_type.chat_message).toBeGreaterThan(0);
  });

  test("chat produces both user and assistant events", async ({
    request,
  }) => {
    // Get baseline
    const beforeRes = await request.get("/api/analytics/events");
    const before = await beforeRes.json();
    const beforeCount = before.events_by_type.chat_message ?? 0;

    // Send chat message
    await request.post("/api/chat", {
      data: { message: "what are your financing rates?" },
      headers: { "x-session-id": "chat_dual_event_test" },
    });

    // Check — should have at least 2 more chat events (user + assistant)
    const afterRes = await request.get("/api/analytics/events");
    const after = await afterRes.json();
    const afterCount = after.events_by_type.chat_message ?? 0;
    expect(afterCount).toBeGreaterThanOrEqual(beforeCount + 2);
  });

  // ----------------------------------------------------------------
  // Data integrity — no data loss
  // ----------------------------------------------------------------

  test("concurrent event batches are all accepted", async ({ request }) => {
    const batchCount = 5;
    const eventsPerBatch = 10;

    // Send batches concurrently
    const promises = Array.from({ length: batchCount }, (_, batch) =>
      request.post("/api/analytics/events", {
        data: {
          events: Array.from({ length: eventsPerBatch }, (_, i) => ({
            event_type: "click",
            action: `concurrent_click_${batch}_${i}`,
            page: "/",
            session_id: `concurrent_batch_${batch}`,
            user_fingerprint: `concurrent_fp_${batch}`,
            timestamp: new Date().toISOString(),
            metadata: { batch, index: i },
          })),
        },
      }),
    );

    const results = await Promise.all(promises);

    // All batches should succeed
    let totalAccepted = 0;
    for (const res of results) {
      expect(res.status()).toBe(200);
      const body = await res.json();
      totalAccepted += body.accepted;
    }

    expect(totalAccepted).toBe(batchCount * eventsPerBatch);
  });

  test("large metadata payloads are preserved", async ({ request }) => {
    const largeMetadata: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      largeMetadata[`key_${i}`] = `value_${i}_${"x".repeat(50)}`;
    }

    const res = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "click",
            action: "large_metadata_test",
            page: "/",
            session_id: "large_meta_session",
            user_fingerprint: "large_meta_fp",
            timestamp: new Date().toISOString(),
            metadata: largeMetadata,
          },
        ],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(1);
  });

  // ----------------------------------------------------------------
  // Security — injection prevention
  // ----------------------------------------------------------------

  test("SQL injection in event fields is safely stored", async ({
    request,
  }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "click",
            action: "'; DROP TABLE events; --",
            page: "/' OR '1'='1",
            session_id: "sqli_test",
            user_fingerprint: "sqli_fp",
            timestamp: new Date().toISOString(),
            metadata: { text: "Robert'); DROP TABLE Students;--" },
          },
        ],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(1);

    // System should still be functional after
    const statsRes = await request.get("/api/analytics/events");
    expect(statsRes.status()).toBe(200);
  });

  test("XSS payloads in metadata do not execute", async ({ request }) => {
    const xssPayloads = [
      "<script>alert('xss')</script>",
      '<img src=x onerror="alert(1)">',
      "javascript:alert(document.cookie)",
      '"><svg/onload=alert(1)>',
      "{{7*7}}",
    ];

    for (const payload of xssPayloads) {
      const res = await request.post("/api/analytics/events", {
        data: {
          events: [
            {
              event_type: "click",
              action: payload,
              page: "/",
              session_id: "xss_test",
              user_fingerprint: "xss_fp",
              timestamp: new Date().toISOString(),
              metadata: { text: payload, href: payload },
            },
          ],
        },
      });

      expect(res.status()).toBe(200);
    }

    // Verify insights API doesn't reflect raw XSS back
    const insightsRes = await request.get("/api/analytics/insights");
    expect(insightsRes.status()).toBe(200);
    const body = await insightsRes.json();
    const insightsText = JSON.stringify(body);
    expect(insightsText).not.toContain("<script>");
    expect(insightsText).not.toContain("onerror=");
  });

  test("prototype pollution attempt is handled safely", async ({
    request,
  }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "click",
            action: "test",
            page: "/",
            session_id: "proto_test",
            user_fingerprint: "proto_fp",
            timestamp: new Date().toISOString(),
            metadata: {
              __proto__: { admin: true },
              constructor: { prototype: { isAdmin: true } },
            },
          },
        ],
      },
    });

    expect(res.status()).toBe(200);
  });

  // ----------------------------------------------------------------
  // Rate limiting
  // ----------------------------------------------------------------

  test("rate limiting allows burst then throttles", async ({ request }) => {
    // Send many rapid requests — should eventually get 429
    let throttled = false;
    for (let i = 0; i < 250; i++) {
      const res = await request.post("/api/analytics/events", {
        data: {
          events: [
            {
              event_type: "click",
              action: `rate_limit_test_${i}`,
              page: "/",
              session_id: "rate_limit_session",
              user_fingerprint: "rate_limit_fp",
              timestamp: new Date().toISOString(),
              metadata: {},
            },
          ],
        },
      });

      if (res.status() === 429) {
        throttled = true;
        break;
      }
    }

    // Rate limiting should kick in (200 req/min limit)
    expect(throttled).toBe(true);
  });
});
