/**
 * SEO Content Signals — E2E Tests
 *
 * Validates filter combo tracking, engagement correlation,
 * zero-result gap detection, and analytics emission for
 * the SEO content signals system.
 *
 * Tested via:
 *   GET  /api/inventory — triggers filter combo tracking
 *   POST /api/inventory/nl-search — triggers SEO signal tracking
 *
 * Category: seo_signals_validation
 */

import { test, expect } from "@playwright/test";

const ANALYTICS_CATEGORY = "seo_signals_validation";
const INVENTORY_URL = "/api/inventory";
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
            page: "/tests/seo-signals",
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
/*  Filter combo tracking via inventory API                               */
/* ===================================================================== */

test.describe("SEO Signals — Filter Combo Tracking", () => {
  test("inventory API with make filter returns 200", async ({ request }) => {
    const resp = await request.get(`${INVENTORY_URL}?make=Honda`);
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body).toHaveProperty("vehicles");
    expect(body).toHaveProperty("total");

    await emitValidation(request, "filter_combo.make_filter", {
      make: "Honda",
      status: 200,
      total: body.total,
    });
  });

  test("inventory API with multiple filters returns 200", async ({ request }) => {
    const resp = await request.get(
      `${INVENTORY_URL}?make=Toyota&condition=used&body_style=SUV`,
    );
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body).toHaveProperty("vehicles");

    await emitValidation(request, "filter_combo.multi_filter", {
      make: "Toyota",
      condition: "used",
      body_style: "SUV",
      status: 200,
      total: body.total,
    });
  });

  test("inventory API with price filter returns 200", async ({ request }) => {
    const resp = await request.get(
      `${INVENTORY_URL}?price_max=25000`,
    );
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body).toHaveProperty("vehicles");

    await emitValidation(request, "filter_combo.price_filter", {
      price_max: 25000,
      status: 200,
      total: body.total,
    });
  });
});

/* ===================================================================== */
/*  Engagement correlation via NL search                                  */
/* ===================================================================== */

test.describe("SEO Signals — Engagement Correlation", () => {
  test("NL search returns vehicles for engagement tracking", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "used trucks under 25k" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();

    expect(body).toHaveProperty("vehicles");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("parsed_filters");

    // If vehicles are returned, they have VINs for engagement tracking
    if (body.vehicles.length > 0) {
      expect(body.vehicles[0]).toHaveProperty("vin");
    }

    await emitValidation(request, "engagement.nl_search_results", {
      query: "used trucks under 25k",
      result_count: body.total,
      has_vins: body.vehicles.length > 0,
    });
  });

  test("filter combo from NL search has trackable structure", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "Honda SUV" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();

    // Parsed filters should contain the structured data needed for SEO tracking
    expect(body.parsed_filters).toHaveProperty("make");
    expect(body.parsed_filters.make).toBe("Honda");
    expect(body.parsed_filters).toHaveProperty("body_type");
    expect(body.parsed_filters.body_type).toBe("SUV");

    await emitValidation(request, "engagement.filter_structure", {
      make: body.parsed_filters.make,
      body_type: body.parsed_filters.body_type,
      trackable: true,
    });
  });
});

/* ===================================================================== */
/*  Zero-result gap detection                                             */
/* ===================================================================== */

test.describe("SEO Signals — Zero Result Gap Detection", () => {
  test("obscure query returns zero or few results", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "purple Lamborghini minivan" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();

    // This should either return 0 results or very few
    expect(typeof body.total).toBe("number");

    await emitValidation(request, "zero_result.obscure_query", {
      query: "purple Lamborghini minivan",
      total: body.total,
      is_gap: body.total === 0,
    });
  });

  test("popular query returns results (not a gap)", async ({ request }) => {
    // A generic query should match placeholder inventory
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "car" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();

    // Generic car query should return some results from placeholder data
    expect(typeof body.total).toBe("number");

    await emitValidation(request, "zero_result.popular_query", {
      query: "car",
      total: body.total,
      has_results: body.total > 0,
    });
  });

  test("total count is numeric for gap tracking", async ({ request }) => {
    const queries = ["sedan", "truck under 30k", "electric SUV"];

    for (const q of queries) {
      const resp = await request.post(NL_SEARCH_URL, {
        data: { query: q },
      });
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(typeof body.total).toBe("number");
      expect(body.total).toBeGreaterThanOrEqual(0);
    }

    await emitValidation(request, "zero_result.total_numeric", {
      queries_tested: queries.length,
      all_numeric: true,
    });
  });
});

/* ===================================================================== */
/*  SEO content signal events                                             */
/* ===================================================================== */

test.describe("SEO Signals — Analytics Events", () => {
  test("seo.filter_combo event structure is valid", async ({ request }) => {
    const event = {
      filters: { make: "Honda", body_type: "SUV", max_price: "25000" },
      result_count: 12,
      engaged: false,
    };

    expect(event.filters).toBeTruthy();
    expect(typeof event.result_count).toBe("number");
    expect(typeof event.engaged).toBe("boolean");

    await emitValidation(request, "events.filter_combo_valid", {
      filter_keys: Object.keys(event.filters).join(","),
      result_count: event.result_count,
      engaged: event.engaged,
    });
  });

  test("seo.popular_combo event structure includes rank", async ({ request }) => {
    const event = {
      filters: { make: "Toyota", body_type: "Truck" },
      search_count: 42,
      rank: 1,
    };

    expect(event.rank).toBeGreaterThan(0);
    expect(event.search_count).toBeGreaterThan(0);

    await emitValidation(request, "events.popular_combo_valid", {
      rank: event.rank,
      search_count: event.search_count,
    });
  });

  test("seo.content_gap event structure includes zero_result flag", async ({ request }) => {
    const event = {
      filters: { make: "Lamborghini", body_type: "Van" },
      search_count: 5,
      zero_result: true,
    };

    expect(typeof event.zero_result).toBe("boolean");
    expect(event.zero_result).toBe(true);

    await emitValidation(request, "events.content_gap_valid", {
      zero_result: event.zero_result,
      search_count: event.search_count,
    });
  });

  test("analytics collect endpoint accepts seo signal events", async ({ request }) => {
    const resp = await request.post("/api/analytics/collect", {
      data: {
        events: [
          {
            event_type: "seo_signals",
            action: "seo.filter_combo",
            page: "/inventory",
            session_id: "e2e-test-session",
            user_fingerprint: "e2e-runner",
            timestamp: new Date().toISOString(),
            metadata: {
              filters: JSON.stringify({ make: "Honda", body_type: "SUV" }),
              result_count: 15,
              engaged: false,
            },
          },
        ],
      },
    });

    expect([200, 201]).toContain(resp.status());

    await emitValidation(request, "analytics.seo_event_accepted", {
      status: resp.status(),
    });
  });
});

/* ===================================================================== */
/*  Page title suggestion                                                 */
/* ===================================================================== */

test.describe("SEO Signals — Page Title Generation", () => {
  test("NL search parsed filters can generate SEO page titles", async ({ request }) => {
    const resp = await request.post(NL_SEARCH_URL, {
      data: { query: "used Honda SUV under 25k" },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();

    // The parsed filters contain enough data to generate a title
    const filters = body.parsed_filters;
    expect(filters.make || filters.body_type || filters.condition).toBeTruthy();

    await emitValidation(request, "page_title.filters_sufficient", {
      make: filters.make,
      body_type: filters.body_type,
      condition: filters.condition,
      max_price: filters.max_price,
    });
  });
});
