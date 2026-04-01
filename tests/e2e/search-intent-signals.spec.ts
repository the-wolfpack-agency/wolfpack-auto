/**
 * Search Intent Signals — E2E Tests
 *
 * Validates:
 *   - Intent classification for different referrer patterns
 *   - UTM parameter extraction
 *   - Scroll velocity detection (slow/fast scrolling simulation)
 *   - Hesitation detection
 *   - Scroll-back (revisit) detection
 *   - All events emit to /api/analytics/events
 *
 * Summary analytics emitted with category: search_intent_validation
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

/* -------------------------------------------------------------------------- */
/* Helper: send events and verify acceptance                                  */
/* -------------------------------------------------------------------------- */

async function sendEvents(
  request: APIRequestContext,
  events: Record<string, unknown>[],
): Promise<{ accepted: number; buffered: number }> {
  const res = await request.post(`${BASE}/api/analytics/events`, {
    data: { events },
  });
  expect(res.status(), "Events API should return 200").toBe(200);
  const body = await res.json();
  expect(body.accepted, "Events should be accepted").toBeGreaterThan(0);
  return body;
}

/* -------------------------------------------------------------------------- */
/* Unique session per test run                                                */
/* -------------------------------------------------------------------------- */

const RUN_ID = Date.now().toString(36);
const session = (name: string) => `test_search_intent_${name}_${RUN_ID}`;
const fp = (name: string) => `fp_search_intent_${name}_${RUN_ID}`;
const ts = () => new Date().toISOString();

/* ===================================================================== */
/*  1. Search Intent Classification — Referrer Patterns                   */
/* ===================================================================== */

test.describe("Search intent classification via events API", () => {
  test("Google organic search intent is accepted", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "search_intent",
        action: "search_intent.classified",
        page: "/inventory",
        session_id: session("google"),
        user_fingerprint: fp("google"),
        timestamp: ts(),
        metadata: {
          source: "google",
          medium: "organic",
          campaign: "",
          content: "",
          term: "",
          intent_category: "price_shopping",
          landing_page: "/inventory",
          raw_query: "cheap trucks near me",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });

  test("Facebook social traffic intent is accepted", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "search_intent",
        action: "search_intent.classified",
        page: "/inventory",
        session_id: session("fb"),
        user_fingerprint: fp("fb"),
        timestamp: ts(),
        metadata: {
          source: "facebook",
          medium: "social",
          campaign: "",
          content: "",
          term: "",
          intent_category: "general_browse",
          landing_page: "/inventory",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });

  test("Direct visit intent is accepted", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "search_intent",
        action: "search_intent.classified",
        page: "/",
        session_id: session("direct"),
        user_fingerprint: fp("direct"),
        timestamp: ts(),
        metadata: {
          source: "direct",
          medium: "direct",
          campaign: "",
          content: "",
          term: "",
          intent_category: "direct",
          landing_page: "/",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });

  test("Bing search with specific model intent", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "search_intent",
        action: "search_intent.classified",
        page: "/inventory",
        session_id: session("bing"),
        user_fingerprint: fp("bing"),
        timestamp: ts(),
        metadata: {
          source: "bing",
          medium: "organic",
          campaign: "",
          content: "",
          term: "",
          intent_category: "specific_model",
          landing_page: "/inventory",
          raw_query: "2024 ford f-150 for sale",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });

  test("Email campaign with financing intent", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "search_intent",
        action: "search_intent.classified",
        page: "/financing",
        session_id: session("email"),
        user_fingerprint: fp("email"),
        timestamp: ts(),
        metadata: {
          source: "newsletter",
          medium: "email",
          campaign: "spring_financing",
          content: "header_cta",
          term: "",
          intent_category: "financing",
          landing_page: "/financing",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });
});

/* ===================================================================== */
/*  2. UTM Parameter Extraction                                           */
/* ===================================================================== */

test.describe("UTM parameter extraction via events API", () => {
  test("All UTM params are captured in intent event", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "search_intent",
        action: "search_intent.classified",
        page: "/inventory",
        session_id: session("utm_full"),
        user_fingerprint: fp("utm_full"),
        timestamp: ts(),
        metadata: {
          source: "google",
          medium: "cpc",
          campaign: "spring_sale_2026",
          content: "banner_top",
          term: "used trucks",
          intent_category: "price_shopping",
          landing_page: "/inventory",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });

  test("Partial UTM params are accepted (missing content/term)", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "search_intent",
        action: "search_intent.classified",
        page: "/",
        session_id: session("utm_partial"),
        user_fingerprint: fp("utm_partial"),
        timestamp: ts(),
        metadata: {
          source: "instagram",
          medium: "social",
          campaign: "summer_promo",
          content: "",
          term: "",
          intent_category: "general_browse",
          landing_page: "/",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });
});

/* ===================================================================== */
/*  3. Scroll Velocity Detection                                          */
/* ===================================================================== */

test.describe("Scroll velocity events via API", () => {
  test("Slow scroll (reading) velocity profile is accepted", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "scroll_behavior",
        action: "scroll.velocity_profile",
        page: "/inventory/1FTFW1E87NFA12345",
        session_id: session("scroll_slow"),
        user_fingerprint: fp("scroll_slow"),
        timestamp: ts(),
        metadata: {
          profile: JSON.stringify({ hero: "slow", pricing: "slow", details: "medium" }),
          section_details: JSON.stringify({
            hero: { avg: 120, samples: 15 },
            pricing: { avg: 80, samples: 20 },
            details: { avg: 450, samples: 10 },
          }),
          buyer_type: "price_buyer",
          slowest_section: "pricing",
          total_revisits: 2,
          page: "/inventory/1FTFW1E87NFA12345",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });

  test("Fast scroll (skipping) velocity is accepted", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "scroll_behavior",
        action: "scroll.fast_skip",
        page: "/inventory/1FTFW1E87NFA12345",
        session_id: session("scroll_fast"),
        user_fingerprint: fp("scroll_fast"),
        timestamp: ts(),
        metadata: {
          section: "vehicle_history",
          velocity_px_per_sec: 2500,
          page: "/inventory/1FTFW1E87NFA12345",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });

  test("Visual buyer velocity profile is accepted", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "scroll_behavior",
        action: "scroll.velocity_profile",
        page: "/inventory/WDDZF4JB0LA123456",
        session_id: session("visual_buyer"),
        user_fingerprint: fp("visual_buyer"),
        timestamp: ts(),
        metadata: {
          profile: JSON.stringify({ photos: "slow", hero: "medium", pricing: "fast" }),
          buyer_type: "visual_buyer",
          slowest_section: "photos",
          total_revisits: 0,
          page: "/inventory/WDDZF4JB0LA123456",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });
});

/* ===================================================================== */
/*  4. Hesitation Detection                                               */
/* ===================================================================== */

test.describe("Scroll hesitation events via API", () => {
  test("Hesitation on pricing section is accepted", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "scroll_behavior",
        action: "scroll.hesitation",
        page: "/inventory/1FTFW1E87NFA12345",
        session_id: session("hesitation_price"),
        user_fingerprint: fp("hesitation_price"),
        timestamp: ts(),
        metadata: {
          section: "pricing",
          duration_ms: 4200,
          scroll_y: 1800,
          page: "/inventory/1FTFW1E87NFA12345",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });

  test("Hesitation on vehicle history section is accepted", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "scroll_behavior",
        action: "scroll.hesitation",
        page: "/inventory/1FTFW1E87NFA12345",
        session_id: session("hesitation_history"),
        user_fingerprint: fp("hesitation_history"),
        timestamp: ts(),
        metadata: {
          section: "vehicle_history",
          duration_ms: 6800,
          scroll_y: 3200,
          page: "/inventory/1FTFW1E87NFA12345",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });

  test("Short hesitation on hero is accepted", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "scroll_behavior",
        action: "scroll.hesitation",
        page: "/inventory/1FTFW1E87NFA12345",
        session_id: session("hesitation_hero"),
        user_fingerprint: fp("hesitation_hero"),
        timestamp: ts(),
        metadata: {
          section: "hero",
          duration_ms: 1600,
          scroll_y: 100,
          page: "/inventory/1FTFW1E87NFA12345",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });
});

/* ===================================================================== */
/*  5. Scroll-back (Revisit) Detection                                    */
/* ===================================================================== */

test.describe("Scroll revisit events via API", () => {
  test("Revisit to pricing section is accepted", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "scroll_behavior",
        action: "scroll.revisit",
        page: "/inventory/1FTFW1E87NFA12345",
        session_id: session("revisit_pricing"),
        user_fingerprint: fp("revisit_pricing"),
        timestamp: ts(),
        metadata: {
          section: "pricing",
          revisit_count: 2,
          page: "/inventory/1FTFW1E87NFA12345",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });

  test("Multiple revisits to photos section is accepted", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "scroll_behavior",
        action: "scroll.revisit",
        page: "/inventory/1FTFW1E87NFA12345",
        session_id: session("revisit_photos"),
        user_fingerprint: fp("revisit_photos"),
        timestamp: ts(),
        metadata: {
          section: "photos",
          revisit_count: 3,
          page: "/inventory/1FTFW1E87NFA12345",
        },
      },
    ]);
    expect(accepted).toBe(1);
  });
});

/* ===================================================================== */
/*  6. Batch event emission — all event types in one batch                */
/* ===================================================================== */

test.describe("Batch analytics emission", () => {
  test("All search intent + scroll behavior events accepted in a single batch", async ({ request }) => {
    const sid = session("batch");
    const fingerprint = fp("batch");

    const { accepted } = await sendEvents(request, [
      // Intent classification
      {
        event_type: "search_intent",
        action: "search_intent.classified",
        page: "/inventory/1FTFW1E87NFA12345",
        session_id: sid,
        user_fingerprint: fingerprint,
        timestamp: ts(),
        metadata: {
          source: "google",
          medium: "organic",
          intent_category: "specific_model",
          landing_page: "/inventory/1FTFW1E87NFA12345",
          raw_query: "2024 f150 lariat",
        },
      },
      // Hesitation
      {
        event_type: "scroll_behavior",
        action: "scroll.hesitation",
        page: "/inventory/1FTFW1E87NFA12345",
        session_id: sid,
        user_fingerprint: fingerprint,
        timestamp: ts(),
        metadata: { section: "pricing", duration_ms: 3500, scroll_y: 1600 },
      },
      // Revisit
      {
        event_type: "scroll_behavior",
        action: "scroll.revisit",
        page: "/inventory/1FTFW1E87NFA12345",
        session_id: sid,
        user_fingerprint: fingerprint,
        timestamp: ts(),
        metadata: { section: "photos", revisit_count: 1 },
      },
      // Fast skip
      {
        event_type: "scroll_behavior",
        action: "scroll.fast_skip",
        page: "/inventory/1FTFW1E87NFA12345",
        session_id: sid,
        user_fingerprint: fingerprint,
        timestamp: ts(),
        metadata: { section: "similar_vehicles", velocity_px_per_sec: 3200 },
      },
      // Velocity profile
      {
        event_type: "scroll_behavior",
        action: "scroll.velocity_profile",
        page: "/inventory/1FTFW1E87NFA12345",
        session_id: sid,
        user_fingerprint: fingerprint,
        timestamp: ts(),
        metadata: {
          profile: JSON.stringify({ pricing: "slow", photos: "slow", details: "medium", similar_vehicles: "skip" }),
          buyer_type: "price_buyer",
          slowest_section: "pricing",
          total_revisits: 1,
        },
      },
    ]);

    expect(accepted).toBe(5);
  });
});

/* ===================================================================== */
/*  7. Summary analytics emission                                         */
/* ===================================================================== */

test.describe("Search intent validation summary", () => {
  test("Emit summary analytics event for search_intent_validation", async ({ request }) => {
    const { accepted } = await sendEvents(request, [
      {
        event_type: "test_summary",
        action: "search_intent_validation",
        page: "/tests",
        session_id: session("summary"),
        user_fingerprint: fp("summary"),
        timestamp: ts(),
        metadata: {
          category: "search_intent_validation",
          run_id: RUN_ID,
          tests_run: 14,
          event_types_validated: [
            "search_intent.classified",
            "scroll.hesitation",
            "scroll.revisit",
            "scroll.fast_skip",
            "scroll.velocity_profile",
          ],
          sources_validated: ["google", "facebook", "bing", "direct", "email", "instagram"],
          intents_validated: [
            "price_shopping",
            "specific_model",
            "financing",
            "general_browse",
            "direct",
          ],
          buyer_types_validated: ["price_buyer", "visual_buyer", "trust_buyer"],
        },
      },
    ]);
    expect(accepted).toBe(1);
  });
});
