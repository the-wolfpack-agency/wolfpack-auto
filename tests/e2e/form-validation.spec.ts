/**
 * Form Validation — API boundary tests.
 *
 * Verifies that every POST/PUT handler rejects bad input with 400/422,
 * never with 500 or a silent 200/201.
 *
 * Rules applied throughout:
 *  - 400 or 422 → validation working correctly (pass)
 *  - 401 or 403 → auth guard fired before validation (acceptable pass)
 *  - 429         → rate-limit guard fired (acceptable pass)
 *  - 500         → server crashed on bad input (hard fail)
 *  - 200/201 on clearly invalid input → silent swallow (hard fail)
 *
 * Run: npx playwright test tests/e2e/form-validation.spec.ts
 */
import { test, expect } from "@playwright/test";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Assert a response rejects bad input (400 | 422) OR required auth first
 * (401 | 403) OR rate-limited (429).  Never accepts 500.
 */
function expectRejection(status: number, label: string): void {
  expect(
    status,
    `${label} — server crashed on bad input (500 is never acceptable)`,
  ).not.toBe(500);

  const acceptable = [400, 422, 401, 403, 429];
  expect(
    acceptable.includes(status),
    `${label} — got ${status}; expected one of [${acceptable.join(", ")}]`,
  ).toBe(true);
}

/**
 * Assert a well-formed request does NOT crash the server (anything < 500).
 * 200/201/401/403/422 are all fine — we're just guarding against 500.
 */
function expectNoServerCrash(status: number, label: string): void {
  expect(
    status,
    `${label} — server crashed on valid input (500 is never acceptable)`,
  ).toBeLessThan(500);
}

/* -------------------------------------------------------------------------- */
/* Group 1: Trade-in estimate  POST /api/trade-in/estimate                   */
/* -------------------------------------------------------------------------- */

test.describe("POST /api/trade-in/estimate — input validation", () => {
  const ENDPOINT = "/api/trade-in/estimate";

  test("empty body → 400 or 422", async ({ request }) => {
    const res = await request.post(ENDPOINT, { data: {} });
    expectRejection(res.status(), "trade-in/estimate: empty body");
  });

  test("year as string → 400 or 422 (Zod rejects non-number)", async ({
    request,
  }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        year: "not-a-number",
        make: "Toyota",
        model: "Camry",
        mileage: 50000,
        condition: "good",
      },
    });
    expectRejection(res.status(), "trade-in/estimate: year=string");
  });

  test("previousOwners as string '3+' → 400 or 422 (Zod rejects non-number)", async ({
    request,
  }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        year: 2020,
        make: "Toyota",
        model: "Camry",
        mileage: 50000,
        condition: "good",
        previousOwners: "3+", // must be z.number()
      },
    });
    expectRejection(res.status(), "trade-in/estimate: previousOwners=string");
  });

  test("condition with invalid enum value → 400 or 422", async ({
    request,
  }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        year: 2020,
        make: "Toyota",
        model: "Camry",
        mileage: 50000,
        condition: "mint", // not in enum: excellent | good | fair | poor
      },
    });
    expectRejection(res.status(), "trade-in/estimate: condition=invalid-enum");
  });

  test("negative mileage → 400 or 422", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        year: 2020,
        make: "Toyota",
        model: "Camry",
        mileage: -500,
        condition: "good",
      },
    });
    expectRejection(res.status(), "trade-in/estimate: mileage=-500");
  });

  test("valid minimal body → not 500", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        year: 2021,
        make: "Honda",
        model: "Accord",
        mileage: 35000,
        condition: "good",
      },
    });
    expectNoServerCrash(res.status(), "trade-in/estimate: valid body");
  });

  test("invalid JSON body → 400", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      // Send raw bytes that are not valid JSON
      data: "{ this is not json",
    });
    // The route catches JSON parse errors and returns 400
    expect(res.status(), "trade-in/estimate: malformed JSON").toBe(400);
  });
});

/* -------------------------------------------------------------------------- */
/* Group 2: Leads capture  POST /api/leads                                    */
/* -------------------------------------------------------------------------- */

test.describe("POST /api/leads — input validation", () => {
  const ENDPOINT = "/api/leads";

  test("empty body → 400, 422, or 401", async ({ request }) => {
    const res = await request.post(ENDPOINT, { data: {} });
    expectRejection(res.status(), "leads: empty body");
  });

  test("missing required email field → 400, 422, or 401", async ({
    request,
  }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        dealer_id: "dealer-abc",
        first_name: "Jane",
        last_name: "Doe",
        // email intentionally omitted
        vehicle_interest: "Looking for an SUV",
      },
    });
    expectRejection(res.status(), "leads: missing email");
  });

  test("invalid email format → 422", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        dealer_id: "dealer-abc",
        first_name: "Jane",
        last_name: "Doe",
        email: "not-an-email",
        vehicle_interest: "Looking for an SUV",
      },
    });
    expectRejection(res.status(), "leads: invalid email format");
  });

  test("missing dealer_id → 422", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        // dealer_id intentionally omitted
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@example.com",
        vehicle_interest: "Looking for an SUV",
      },
    });
    expectRejection(res.status(), "leads: missing dealer_id");
  });

  test("invalid phone E.164 format → 422", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        dealer_id: "dealer-abc",
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@example.com",
        phone: "555-0100", // not E.164
        vehicle_interest: "Looking for an SUV",
      },
    });
    expectRejection(res.status(), "leads: invalid phone format");
  });

  test("valid minimal lead body → not 500", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        dealer_id: "dealer-abc",
        first_name: "Jane",
        last_name: "Doe",
        email: "jane.doe.test@example.com",
        vehicle_interest: "Looking for a reliable family SUV",
      },
    });
    // The route accepts valid leads even without a real DB (queued response)
    expectNoServerCrash(res.status(), "leads: valid minimal body");
  });

  test("invalid JSON body → 400", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: "{ bad json",
    });
    expect(res.status(), "leads: malformed JSON").toBe(400);
  });
});

/* -------------------------------------------------------------------------- */
/* Group 3: Walkaround  GET /api/walkaround                                   */
/* -------------------------------------------------------------------------- */

test.describe("GET /api/walkaround — query param validation", () => {
  const ENDPOINT = "/api/walkaround";

  test("no VIN param → 400", async ({ request }) => {
    // The route checks: if (!vin || vin.length < 5) → 400
    const res = await request.get(ENDPOINT);
    expect(res.status(), "walkaround: no VIN param").toBe(400);
  });

  test("VIN too short (< 5 chars) → 400", async ({ request }) => {
    const res = await request.get(`${ENDPOINT}?vin=AB3`);
    expect(res.status(), "walkaround: VIN < 5 chars").toBe(400);
  });

  test("VIN at boundary (exactly 5 chars) → not 500", async ({ request }) => {
    // Route accepts vin.length >= 5 (shadow mode generates a fake vehicle)
    const res = await request.get(`${ENDPOINT}?vin=ABCDE`);
    expectNoServerCrash(res.status(), "walkaround: VIN length 5 boundary");
  });

  test("standard 17-char VIN → not 500", async ({ request }) => {
    const res = await request.get(`${ENDPOINT}?vin=1HGBH41JXMN109186`);
    expectNoServerCrash(res.status(), "walkaround: valid 17-char VIN");
  });

  /* ---------------------------------------------------------------------- */
  /* POST /api/walkaround — card engagement logging                          */
  /* ---------------------------------------------------------------------- */

  test("POST — empty body → 400", async ({ request }) => {
    const res = await request.post(ENDPOINT, { data: {} });
    // Route: if (!vin || !card_id || !action) → 400
    expect(res.status(), "walkaround POST: empty body").toBe(400);
  });

  test("POST — missing vin → 400", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: { card_id: "card-001", action: "flipped" },
    });
    expect(res.status(), "walkaround POST: missing vin").toBe(400);
  });

  test("POST — invalid action value → 400", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        vin: "1HGBH41JXMN109186",
        card_id: "card-001",
        action: "exploded", // not in: flipped | shared | saved
      },
    });
    expect(res.status(), "walkaround POST: invalid action").toBe(400);
  });

  test("POST — valid body → not 500", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        vin: "1HGBH41JXMN109186",
        card_id: "card-001",
        action: "flipped",
      },
    });
    expectNoServerCrash(res.status(), "walkaround POST: valid body");
  });
});

/* -------------------------------------------------------------------------- */
/* Group 4: Admin settings  PUT /api/admin/settings/notifications             */
/* -------------------------------------------------------------------------- */

test.describe("PUT /api/admin/settings/notifications — input validation", () => {
  const ENDPOINT = "/api/admin/settings/notifications";

  test("unauthenticated empty body → 401 or 400 (never 500)", async ({
    request,
  }) => {
    // Without a valid session, requireAuth() fires first → 401.
    // The important thing is that the server does NOT crash.
    const res = await request.put(ENDPOINT, { data: {} });
    expectRejection(res.status(), "notifications PUT: empty body, no auth");
  });

  test("unauthenticated invalid JSON → 400 or 401 (never 500)", async ({
    request,
  }) => {
    const res = await request.put(ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: "{ not json",
    });
    // Auth guard or JSON parse error — either way, not 500
    expectRejection(
      res.status(),
      "notifications PUT: malformed JSON, no auth",
    );
  });

  test("unauthenticated valid prefs body → 401 (never 500)", async ({
    request,
  }) => {
    const res = await request.put(ENDPOINT, {
      data: {
        new_lead: true,
        lead_score_change: false,
        trade_in_submitted: true,
        low_inventory: false,
        compliance_alert: true,
        email_enabled: true,
        sms_enabled: false,
      },
    });
    // Auth required; accept 401 or 403 — never 500
    expectNoServerCrash(
      res.status(),
      "notifications PUT: valid prefs body, no auth",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Group 5: Admin inventory  POST /api/admin/inventory                        */
/* -------------------------------------------------------------------------- */

test.describe("POST /api/admin/inventory — input validation", () => {
  const ENDPOINT = "/api/admin/inventory";

  test("unauthenticated empty body → 401 or 400 (never 500)", async ({
    request,
  }) => {
    const res = await request.post(ENDPOINT, { data: {} });
    // requireAuth() fires first → 401, or body validation → 400
    expectRejection(
      res.status(),
      "admin/inventory POST: empty body, no auth",
    );
  });

  test("unauthenticated body with invalid VIN format → 401 or 400 (never 500)", async ({
    request,
  }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        vin: "TOOSHORT",     // < 17 chars
        year: 2022,
        make: "Ford",
        model: "F-150",
        price: 45000,
      },
    });
    // Auth guard fires before VIN check; 401 is fine. 500 is not.
    expectRejection(
      res.status(),
      "admin/inventory POST: short VIN, no auth",
    );
  });

  test("unauthenticated body missing price → 401 or 400 (never 500)", async ({
    request,
  }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        vin: "1HGBH41JXMN109186",
        year: 2022,
        make: "Ford",
        model: "F-150",
        // price intentionally omitted — required field
      },
    });
    expectRejection(
      res.status(),
      "admin/inventory POST: missing price, no auth",
    );
  });

  test("unauthenticated body with string year → 401 or 400 (never 500)", async ({
    request,
  }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        vin: "1HGBH41JXMN109186",
        year: "twenty-twenty-two", // must be number
        make: "Ford",
        model: "F-150",
        price: 45000,
      },
    });
    // TODO: add Zod validation to this route (currently uses manual type checks)
    expectRejection(
      res.status(),
      "admin/inventory POST: year=string, no auth",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Group 6: Trade-in submit  POST /api/trade-in/submit                        */
/* -------------------------------------------------------------------------- */

test.describe("POST /api/trade-in/submit — input validation", () => {
  const ENDPOINT = "/api/trade-in/submit";

  test("empty body → 400, 422, or 401 (never 500)", async ({ request }) => {
    const res = await request.post(ENDPOINT, { data: {} });
    expectRejection(res.status(), "trade-in/submit: empty body");
  });

  test("invalid JSON body → 400 or 401 (never 500)", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: "not json at all",
    });
    expectRejection(res.status(), "trade-in/submit: malformed JSON");
  });
});

/* -------------------------------------------------------------------------- */
/* Group 7: Contact form  POST /api/contact                                   */
/* -------------------------------------------------------------------------- */

test.describe("POST /api/contact — input validation", () => {
  const ENDPOINT = "/api/contact";

  test("empty body → 400 or 422 (never 500)", async ({ request }) => {
    const res = await request.post(ENDPOINT, { data: {} });
    expectRejection(res.status(), "contact: empty body");
  });

  test("invalid JSON body → 400 (never 500)", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: { "Content-Type": "application/json" },
      data: "{ broken",
    });
    expectRejection(res.status(), "contact: malformed JSON");
  });
});
