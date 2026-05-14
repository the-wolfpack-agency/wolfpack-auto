/**
 * Natural Language Search — E2E Tests
 *
 * Validates the NL search API endpoint with various query patterns,
 * filter extraction accuracy, and zero-result query tracking.
 *
 * Endpoint tested:
 *   POST /api/inventory/nl-search — Natural language inventory search
 *
 * Category: nl_search_validation
 */

import { test, expect } from "@playwright/test";

// Add immediately after imports:
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set."
);

const ANALYTICS_CATEGORY = "nl_search_validation";
const NL_SEARCH_URL = "/api/inventory/nl-search";

/* ===================================================================== */
/*  Helper: emit validation event                                         */
/* ===================================================================== */

async function emitValidation(
  request: { post: Function },
  action: string,
  metadata: Record<string, unknown>,
) {
  try {
    await request.post("/api/analytics/collect", {
      data: {
        events: [
          {
            event_type: ANALYTICS_CATEGORY,
            action,
            page: "/tests/nl-search",
            session_id: "test-session",
            user_fingerprint: "test-runner",
            timestamp: new Date().toISOString(),
            metadata,
          },
        ],
      },
    });
  } catch {
    // Best-effort
  }
}

/* ===================================================================== */
/*  Basic API contract                                                    */
/* ===================================================================== */

test.describe("NL Search — API Contract", () => {
  test("POST with valid query returns 200 with parsed_filters", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "SUV under 20k" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();

    expect(body).toHaveProperty("query");
    expect(body).toHaveProperty("parsed_filters");
    expect(body).toHaveProperty("intent_category");
    expect(body).toHaveProperty("keywords_used");
    expect(body).toHaveProperty("vehicles");
    expect(body).toHaveProperty("total");

    await emitValidation(request, "api.contract_valid", {
      status: 200,
      has_parsed_filters: true,
      has_vehicles: Array.isArray(body.vehicles),
    });
  });

  test("POST with empty query returns 400", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "" },
    });

    expect(resp.status()).toBe(400);

    await emitValidation(request, "api.empty_query_rejected", {
      status: 400,
    });
  });

  test("POST with missing query returns 400", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: {},
    });

    expect(resp.status()).toBe(400);

    await emitValidation(request, "api.missing_query_rejected", {
      status: 400,
    });
  });

  test("POST with invalid JSON returns 400", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: "not json",
      headers: { "Content-Type": "text/plain" },
    });

    // May return 400 or 415 depending on how Next.js handles it
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    expect(resp.status()).toBeLessThan(500);

    await emitValidation(request, "api.invalid_json_rejected", {
      status: resp.status(),
    });
  });
});

/* ===================================================================== */
/*  Filter extraction accuracy                                            */
/* ===================================================================== */

test.describe("NL Search — Price Extraction", () => {
  test("'SUV under 20k' extracts max_price 20000", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "SUV under 20k" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.parsed_filters.max_price).toBe(20000);
    expect(body.parsed_filters.body_type).toBe("SUV");

    await emitValidation(request, "extraction.price_under", {
      query: "SUV under 20k",
      max_price: body.parsed_filters.max_price,
      body_type: body.parsed_filters.body_type,
    });
  });

  test("'car below $15,000' extracts max_price 15000", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "car below $15,000" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.parsed_filters.max_price).toBe(15000);

    await emitValidation(request, "extraction.price_below", {
      query: "car below $15,000",
      max_price: body.parsed_filters.max_price,
    });
  });

  test("'cheap sedan' extracts max_price 15000", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "cheap sedan" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.parsed_filters.max_price).toBe(15000);
    expect(body.parsed_filters.body_type).toBe("Sedan");

    await emitValidation(request, "extraction.price_cheap", {
      query: "cheap sedan",
      max_price: body.parsed_filters.max_price,
    });
  });
});

test.describe("NL Search — Body Type Extraction", () => {
  test("'truck that can tow' extracts Truck + towing", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "truck that can tow" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.parsed_filters.body_type).toBe("Truck");
    expect(body.parsed_filters.towing).toBe(true);

    await emitValidation(request, "extraction.body_type_truck", {
      query: "truck that can tow",
      body_type: body.parsed_filters.body_type,
      towing: body.parsed_filters.towing,
    });
  });

  test("'red convertible' extracts Convertible + Red", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "red convertible" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.parsed_filters.body_type).toBe("Convertible");
    expect(body.parsed_filters.color).toBe("Red");

    await emitValidation(request, "extraction.body_type_convertible", {
      query: "red convertible",
      body_type: body.parsed_filters.body_type,
      color: body.parsed_filters.color,
    });
  });
});

test.describe("NL Search — Make and Model Extraction", () => {
  test("'Honda Civic' extracts make + model", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "Honda Civic under 20k" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.parsed_filters.make).toBe("Honda");
    expect(body.parsed_filters.model).toBe("Civic");

    await emitValidation(request, "extraction.make_model", {
      query: "Honda Civic under 20k",
      make: body.parsed_filters.make,
      model: body.parsed_filters.model,
    });
  });

  test("'Tesla Model 3' extracts Tesla + Model 3", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "Tesla Model 3" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.parsed_filters.make).toBe("Tesla");
    expect(body.parsed_filters.model).toBe("Model 3");

    await emitValidation(request, "extraction.tesla_model3", {
      query: "Tesla Model 3",
      make: body.parsed_filters.make,
      model: body.parsed_filters.model,
    });
  });
});

test.describe("NL Search — Use Case Extraction", () => {
  test("'good first car for teenager' extracts use case preset", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "good first car for teenager" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.parsed_filters.max_price).toBe(15000);
    expect(body.parsed_filters.use_case).toBe("teenager");

    await emitValidation(request, "extraction.use_case_teenager", {
      query: "good first car for teenager",
      max_price: body.parsed_filters.max_price,
      use_case: body.parsed_filters.use_case,
    });
  });

  test("'family SUV' extracts family use case", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "family SUV" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.parsed_filters.use_case).toBe("family");

    await emitValidation(request, "extraction.use_case_family", {
      query: "family SUV",
      use_case: body.parsed_filters.use_case,
    });
  });
});

test.describe("NL Search — Intent Classification", () => {
  test("classifies specific vehicle intent", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "2022 Honda Civic" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.intent_category).toBe("specific_vehicle");

    await emitValidation(request, "intent.specific_vehicle", {
      query: "2022 Honda Civic",
      intent: body.intent_category,
    });
  });

  test("classifies budget search intent", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "under 15k" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.intent_category).toBe("budget_search");

    await emitValidation(request, "intent.budget_search", {
      query: "under 15k",
      intent: body.intent_category,
    });
  });

  test("classifies EV search intent", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "electric car" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.intent_category).toBe("ev_search");

    await emitValidation(request, "intent.ev_search", {
      query: "electric car",
      intent: body.intent_category,
    });
  });
});

/* ===================================================================== */
/*  Zero-result query tracking                                            */
/* ===================================================================== */

test.describe("NL Search — Zero Result Tracking", () => {
  test("response includes total count for result tracking", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "flying car with laser beams" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(typeof body.total).toBe("number");

    await emitValidation(request, "zero_results.total_included", {
      query: "flying car with laser beams",
      total: body.total,
      is_zero: body.total === 0,
    });
  });
});

/* ===================================================================== */
/*  Keywords used tracking                                                */
/* ===================================================================== */

test.describe("NL Search — Keywords Tracking", () => {
  test("keywords_used array is populated for multi-filter query", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "red Honda SUV under 20k" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.keywords_used)).toBe(true);
    expect(body.keywords_used.length).toBeGreaterThan(0);
    expect(body.keywords_used).toContain("color");
    expect(body.keywords_used).toContain("make");
    expect(body.keywords_used).toContain("body_type");
    expect(body.keywords_used).toContain("price");

    await emitValidation(request, "keywords.multi_filter", {
      query: "red Honda SUV under 20k",
      keywords: body.keywords_used.join(","),
      count: body.keywords_used.length,
    });
  });
});
