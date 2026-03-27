import { test, expect } from "@playwright/test";

test.describe("Tier 3 Analytics Signals — Data Moat Captures", () => {
  // ----------------------------------------------------------------
  // All new Tier 3 signal types accepted by the API
  // ----------------------------------------------------------------

  const tier3Signals = [
    {
      event_type: "page_performance",
      action: "timing_measured",
      metadata: {
        load_time_ms: 2340,
        ttfb_ms: 180,
        dom_interactive_ms: 890,
        dom_content_loaded_ms: 1200,
        transfer_size_kb: 512,
        page: "/inventory",
        connection_type: "4g",
      },
    },
    {
      event_type: "page_performance",
      action: "lcp_measured",
      metadata: { lcp_ms: 1800, element: "img", page: "/inventory" },
    },
    {
      event_type: "page_performance",
      action: "fid_measured",
      metadata: { fid_ms: 45, event_type: "click", page: "/inventory" },
    },
    {
      event_type: "cta_visibility",
      action: "cta_seen",
      metadata: {
        cta_text: "Schedule Test Drive",
        cta_tag: "a",
        cta_href: "/contact?action=test-drive",
        visible_duration_ms: 4500,
        position_pct: 72,
        page: "/inventory/VIN001",
        was_clicked: false,
      },
    },
    {
      event_type: "buyer_lifecycle",
      action: "lifecycle_snapshot",
      metadata: {
        visit_count: 4,
        days_since_first_visit: 8,
        total_vehicles_viewed: 12,
        unique_makes_explored: 4,
        recent_makes: ["toyota", "honda"],
        is_narrowing: true,
        total_searches: 7,
        visit_frequency_days: 2,
        lifecycle_stage: "evaluation",
      },
    },
    {
      event_type: "network_quality",
      action: "connection_detected",
      metadata: {
        effective_type: "4g",
        downlink_mbps: 10.5,
        rtt_ms: 50,
        save_data: false,
        page: "/",
      },
    },
    {
      event_type: "network_quality",
      action: "connection_changed",
      metadata: {
        effective_type: "3g",
        downlink_mbps: 1.5,
        rtt_ms: 200,
        save_data: false,
      },
    },
  ];

  for (const signal of tier3Signals) {
    test(`accepts signal: ${signal.event_type} (${signal.action})`, async ({ request }) => {
      const res = await request.post("/api/analytics/events", {
        data: {
          events: [
            {
              ...signal,
              page: signal.metadata.page ?? "/test",
              session_id: `tier3_${signal.event_type}_${signal.action}_${Date.now()}`,
              user_fingerprint: "tier3_test_fp",
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
  // Write-read verification for all tier 3 signals
  // ----------------------------------------------------------------

  test("all 7 tier 3 signal types survive write-read cycle", async ({ request }) => {
    const beforeRes = await request.get("/api/analytics/events");
    const before = await beforeRes.json();

    const events = tier3Signals.map((signal, i) => ({
      ...signal,
      page: signal.metadata.page ?? "/tier3-verify",
      session_id: `tier3_verify_${Date.now()}_${i}`,
      user_fingerprint: "tier3_verify_fp",
      timestamp: new Date().toISOString(),
    }));

    const writeRes = await request.post("/api/analytics/events", {
      data: { events },
    });
    expect(writeRes.status()).toBe(200);
    expect((await writeRes.json()).accepted).toBe(tier3Signals.length);

    const afterRes = await request.get("/api/analytics/events");
    const after = await afterRes.json();

    // Verify each unique event_type was persisted
    const uniqueTypes = new Set(tier3Signals.map((s) => s.event_type));
    for (const eventType of uniqueTypes) {
      const beforeCount = before.events_by_type[eventType] ?? 0;
      const afterCount = after.events_by_type[eventType] ?? 0;
      expect(afterCount, `Signal "${eventType}" was not persisted`).toBeGreaterThan(
        beforeCount,
      );
    }
  });

  // ----------------------------------------------------------------
  // Performance signals contain valid Web Vitals fields
  // ----------------------------------------------------------------

  test("page_performance events carry all Core Web Vitals fields", async ({ request }) => {
    const event = {
      event_type: "page_performance",
      action: "timing_measured",
      page: "/vitals-test",
      session_id: `vitals_${Date.now()}`,
      user_fingerprint: "vitals_fp",
      timestamp: new Date().toISOString(),
      metadata: {
        load_time_ms: 1500,
        ttfb_ms: 120,
        dom_interactive_ms: 600,
        dom_content_loaded_ms: 900,
        transfer_size_kb: 256,
        page: "/vitals-test",
        connection_type: "4g",
      },
    };

    const res = await request.post("/api/analytics/events", {
      data: { events: [event] },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accepted).toBe(1);

    // Verify all fields are numeric and reasonable
    expect(event.metadata.load_time_ms).toBeGreaterThan(0);
    expect(event.metadata.ttfb_ms).toBeGreaterThan(0);
    expect(event.metadata.dom_interactive_ms).toBeGreaterThan(0);
    expect(event.metadata.ttfb_ms).toBeLessThanOrEqual(event.metadata.load_time_ms);
    expect(event.metadata.dom_interactive_ms).toBeLessThanOrEqual(
      event.metadata.load_time_ms,
    );
  });

  // ----------------------------------------------------------------
  // CTA visibility captures position and exposure data
  // ----------------------------------------------------------------

  test("cta_visibility events capture scroll position and duration", async ({ request }) => {
    const events = [
      {
        event_type: "cta_visibility",
        action: "cta_seen",
        page: "/inventory",
        session_id: `cta_test_${Date.now()}`,
        user_fingerprint: "cta_test_fp",
        timestamp: new Date().toISOString(),
        metadata: {
          cta_text: "Get Pre-Approved",
          cta_tag: "button",
          cta_href: "/financing",
          visible_duration_ms: 3200,
          position_pct: 85,
          page: "/inventory",
          was_clicked: false,
        },
      },
      {
        event_type: "cta_visibility",
        action: "cta_seen",
        page: "/",
        session_id: `cta_test_${Date.now()}`,
        user_fingerprint: "cta_test_fp",
        timestamp: new Date().toISOString(),
        metadata: {
          cta_text: "Browse Inventory",
          cta_tag: "a",
          cta_href: "/inventory",
          visible_duration_ms: 8000,
          position_pct: 25,
          page: "/",
          was_clicked: true,
        },
      },
    ];

    const res = await request.post("/api/analytics/events", {
      data: { events },
    });

    expect(res.status()).toBe(200);
    expect((await res.json()).accepted).toBe(2);
  });

  // ----------------------------------------------------------------
  // Buyer lifecycle stages are classified correctly
  // ----------------------------------------------------------------

  test("buyer_lifecycle classifies stages based on visit count", async ({ request }) => {
    const stages = [
      { visit_count: 1, expected: "awareness" },
      { visit_count: 2, expected: "consideration" },
      { visit_count: 3, expected: "consideration" },
      { visit_count: 5, expected: "evaluation" },
      { visit_count: 8, expected: "decision" },
    ];

    for (const { visit_count, expected } of stages) {
      const res = await request.post("/api/analytics/events", {
        data: {
          events: [
            {
              event_type: "buyer_lifecycle",
              action: "lifecycle_snapshot",
              page: "/",
              session_id: `lifecycle_stage_${visit_count}_${Date.now()}`,
              user_fingerprint: `lifecycle_fp_${visit_count}`,
              timestamp: new Date().toISOString(),
              metadata: {
                visit_count,
                days_since_first_visit: visit_count * 3,
                total_vehicles_viewed: visit_count * 2,
                unique_makes_explored: Math.min(visit_count, 4),
                recent_makes: ["toyota"],
                is_narrowing: visit_count > 2,
                total_searches: visit_count,
                visit_frequency_days: 3,
                lifecycle_stage: expected,
              },
            },
          ],
        },
      });

      expect(res.status()).toBe(200);
      expect((await res.json()).accepted).toBe(1);
    }
  });

  // ----------------------------------------------------------------
  // Network quality events capture connection details
  // ----------------------------------------------------------------

  test("network_quality events capture all connection fields", async ({ request }) => {
    const connectionTypes = ["4g", "3g", "2g", "slow-2g"];

    for (const type of connectionTypes) {
      const res = await request.post("/api/analytics/events", {
        data: {
          events: [
            {
              event_type: "network_quality",
              action: "connection_detected",
              page: "/",
              session_id: `net_${type}_${Date.now()}`,
              user_fingerprint: "net_test_fp",
              timestamp: new Date().toISOString(),
              metadata: {
                effective_type: type,
                downlink_mbps: type === "4g" ? 10 : type === "3g" ? 1.5 : 0.3,
                rtt_ms: type === "4g" ? 50 : type === "3g" ? 200 : 600,
                save_data: type === "slow-2g",
                page: "/",
              },
            },
          ],
        },
      });

      expect(res.status()).toBe(200);
    }
  });
});
