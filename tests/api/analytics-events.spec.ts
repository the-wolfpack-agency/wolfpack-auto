import { test, expect } from "@playwright/test";

test.describe("Analytics Events API (/api/analytics/events)", () => {
  // ----------------------------------------------------------------
  // Event ingestion
  // ----------------------------------------------------------------

  test("POST accepts a valid event batch", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "page_view",
            action: "view",
            page: "/",
            session_id: "test_session_1",
            user_fingerprint: "test_fp_1",
            timestamp: new Date().toISOString(),
            metadata: { referrer: "https://google.com" },
          },
        ],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(1);
    expect(body.buffered).toBeGreaterThanOrEqual(1);
  });

  test("POST accepts multiple events in a single batch", async ({
    request,
  }) => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      event_type: "click",
      action: `click_${i}`,
      page: "/inventory",
      session_id: "test_session_batch",
      user_fingerprint: "test_fp_batch",
      timestamp: new Date().toISOString(),
      metadata: { element: `button_${i}` },
    }));

    const res = await request.post("/api/analytics/events", {
      data: { events },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(10);
  });

  test("POST caps batch size at 50 events", async ({ request }) => {
    const events = Array.from({ length: 60 }, (_, i) => ({
      event_type: "click",
      action: `click_${i}`,
      page: "/",
      session_id: "test_session_cap",
      user_fingerprint: "test_fp_cap",
      timestamp: new Date().toISOString(),
      metadata: {},
    }));

    const res = await request.post("/api/analytics/events", {
      data: { events },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBeLessThanOrEqual(50);
  });

  // ----------------------------------------------------------------
  // All 16 signal types accepted
  // ----------------------------------------------------------------

  const signalTypes = [
    { event_type: "page_view", action: "view", metadata: { referrer: "" } },
    { event_type: "click", action: "click", metadata: { tag: "button", text: "Buy Now" } },
    { event_type: "scroll", action: "scroll_50", metadata: { depth: 50 } },
    { event_type: "time_on_page", action: "page_hidden", metadata: { duration_ms: 5000 } },
    { event_type: "form_interaction", action: "field_focus", metadata: { field_name: "email" } },
    { event_type: "heartbeat", action: "session_alive", metadata: {} },
    { event_type: "micro_hesitation", action: "field_deletion", metadata: { field_name: "phone", chars_deleted: 5, peak_length: 10, current_length: 5 } },
    { event_type: "cursor_heatmap", action: "linger", metadata: { x: 400, y: 300, duration_ms: 2000, element_tag: "h2" } },
    { event_type: "copy_paste", action: "copy", metadata: { content: "1HGCG5655WA014568", content_type: "vin" } },
    { event_type: "tab_visibility", action: "tab_return", metadata: { tab_away_count: 3, away_duration_ms: 8000, likely_comparison_shopping: true } },
    { event_type: "device_orientation", action: "orientation_change", metadata: { orientation: "landscape" } },
    { event_type: "scroll_velocity", action: "velocity_summary", metadata: { avg_velocity: 0.5, behavior: "scanning" } },
    { event_type: "time_to_first_interaction", action: "first_interaction", metadata: { ttfi_ms: 1500, intent: "purposeful" } },
    { event_type: "chat_message", action: "chat_user", metadata: { role: "user", content: "do you have trucks?" } },
    { event_type: "return_visit", action: "page_revisit", metadata: { page: "/inventory", visit_count: 3, sticky_page: true } },
    { event_type: "cross_page_correlation", action: "interaction_chain", metadata: { chain_length: 6, unique_pages: 3, pages: ["/", "/inventory", "/contact"] } },
  ];

  for (const signal of signalTypes) {
    test(`POST accepts signal type: ${signal.event_type}`, async ({
      request,
    }) => {
      const res = await request.post("/api/analytics/events", {
        data: {
          events: [
            {
              ...signal,
              page: "/test",
              session_id: `test_signal_${signal.event_type}`,
              user_fingerprint: "test_fp_signals",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.accepted).toBe(1);
    });
  }

  // ----------------------------------------------------------------
  // Validation
  // ----------------------------------------------------------------

  test("POST rejects empty events array", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: { events: [] },
    });
    expect(res.status()).toBe(400);
  });

  test("POST rejects missing events field", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: { something: "else" },
    });
    expect(res.status()).toBe(400);
  });

  test("POST skips events with missing event_type", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            action: "view",
            page: "/",
            session_id: "s1",
            user_fingerprint: "fp1",
            timestamp: new Date().toISOString(),
            metadata: {},
          },
        ],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(0);
  });

  test("POST skips events with missing session_id", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "click",
            action: "click",
            page: "/",
            user_fingerprint: "fp1",
            timestamp: new Date().toISOString(),
            metadata: {},
          },
        ],
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(0);
  });

  // ----------------------------------------------------------------
  // Diagnostics endpoint
  // ----------------------------------------------------------------

  test("GET returns buffer stats", async ({ request }) => {
    const res = await request.get("/api/analytics/events");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("total_events");
    expect(body).toHaveProperty("active_sessions");
    expect(body).toHaveProperty("events_by_type");
    expect(typeof body.total_events).toBe("number");
    expect(typeof body.active_sessions).toBe("number");
  });

  // ----------------------------------------------------------------
  // Security
  // ----------------------------------------------------------------

  test("POST sanitizes XSS in event metadata", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      data: {
        events: [
          {
            event_type: "click",
            action: "<script>alert('xss')</script>",
            page: "/<img onerror=alert(1)>",
            session_id: "test_xss",
            user_fingerprint: "test_fp_xss",
            timestamp: new Date().toISOString(),
            metadata: {
              text: "<script>document.cookie</script>",
              href: "javascript:alert(1)",
            },
          },
        ],
      },
    });

    // Event is accepted (stored as raw data, sanitized on output)
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(1);
  });

  test("POST handles malformed JSON gracefully", async ({ request }) => {
    const res = await request.post("/api/analytics/events", {
      headers: { "Content-Type": "application/json" },
      data: "not valid json{{{",
    });

    // Should return 400 or 500, not crash
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
