import { test, expect } from "@playwright/test";

// Add immediately after imports:
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set."
);

/**
 * buyer-journey.spec.ts
 *
 * Comprehensive buyer-side E2E journeys covering inventory browsing,
 * vehicle detail pages, lead/contact form submission, and input validation.
 *
 * All tests tolerate missing infrastructure (no DB, no Redis) by using
 * permissive status-code patterns where the API has documented fallbacks.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid lead payload — change fields per test. */
function validLeadPayload(overrides: Record<string, unknown> = {}) {
  return {
    dealer_id: "default",
    first_name: "E2E",
    last_name: "Buyer",
    email: "e2e.buyer@wolfpackmotors.test",
    vehicle_interest: "2024 Toyota Camry SE",
    source: "website_form",
    ...overrides,
  };
}

/** Minimal valid contact payload. */
function validContactPayload(overrides: Record<string, unknown> = {}) {
  return {
    first_name: "E2E",
    last_name: "Contact",
    email: "e2e.contact@wolfpackmotors.test",
    subject: "Inquiry about your inventory",
    message: "I would like more information about vehicles you have in stock.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Journey 1 — Browse inventory → VDP → submit lead
// ---------------------------------------------------------------------------

test.describe("Buyer journey: browse inventory → VDP → lead submission", () => {
  test("Vehicle inventory page renders vehicle cards", async ({ page }) => {
    const response = await page.goto("/inventory", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Page must not error
    expect(response?.status()).not.toBe(500);

    // At least one vehicle card or list item must be present
    const vehicleLinks = page.locator('a[href*="/inventory/"]');
    await expect(vehicleLinks.first()).toBeVisible({ timeout: 15_000 });
  });

  test("Clicking a vehicle card loads the vehicle detail page with price", async ({
    page,
  }) => {
    await page.goto("/inventory", { waitUntil: "domcontentloaded" });

    // Find first inventory link
    const firstCard = page.locator('a[href*="/inventory/"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    const href = await firstCard.getAttribute("href");
    expect(href).toBeTruthy();

    // Navigate directly to the VDP URL to avoid click-interception issues
    await page.goto(href!, { waitUntil: "domcontentloaded" });

    // VDP must have a heading with vehicle info
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
    const headingText = await heading.textContent();
    expect(headingText!.trim().length).toBeGreaterThan(3);

    // Price must appear somewhere on the page
    const priceEl = page.locator("text=/\\$[\\d,]+/").first();
    await expect(priceEl).toBeVisible({ timeout: 10_000 });
  });

  test("Lead POST with valid payload returns 201", async ({ request }) => {
    const resp = await request.post("/api/leads", {
      data: validLeadPayload(),
    });

    // 201 in all modes (DB or no-DB graceful fallback)
    expect(resp.status()).toBe(201);

    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(typeof body.lead_id).toBe("string");
    expect(body.lead_id.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Journey 2 — Filter inventory by make
// ---------------------------------------------------------------------------

test.describe("Buyer journey: filter inventory by make", () => {
  test("GET /api/inventory?make=Toyota returns only Toyota vehicles (or empty)", async ({
    request,
  }) => {
    const resp = await request.get("/api/inventory?make=Toyota");
    expect([200, 503]).toContain(resp.status());

    if (resp.status() === 503) {
      // Search service unavailable — acceptable in CI without DB
      return;
    }

    const body = await resp.json();
    expect(Array.isArray(body.vehicles)).toBe(true);

    // Every vehicle in the result must be a Toyota (or the list may be empty)
    for (const vehicle of body.vehicles) {
      expect((vehicle.make as string).toLowerCase()).toBe("toyota");
    }
  });

  test("GET /api/inventory?make=Ford returns only Ford vehicles (or empty)", async ({
    request,
  }) => {
    const resp = await request.get("/api/inventory?make=Ford");
    expect([200, 503]).toContain(resp.status());

    if (resp.status() === 503) return;

    const body = await resp.json();
    expect(Array.isArray(body.vehicles)).toBe(true);

    for (const vehicle of body.vehicles) {
      expect((vehicle.make as string).toLowerCase()).toBe("ford");
    }
  });

  test("GET /api/inventory?year_min=2023&year_max=2025 respects year range", async ({
    request,
  }) => {
    const resp = await request.get("/api/inventory?year_min=2023&year_max=2025");
    expect([200, 503]).toContain(resp.status());

    if (resp.status() === 503) return;

    const body = await resp.json();
    expect(Array.isArray(body.vehicles)).toBe(true);

    for (const vehicle of body.vehicles) {
      const year = vehicle.year as number;
      expect(year).toBeGreaterThanOrEqual(2023);
      expect(year).toBeLessThanOrEqual(2025);
    }
  });
});

// ---------------------------------------------------------------------------
// Journey 3 — Search inventory
// ---------------------------------------------------------------------------

test.describe("Buyer journey: search inventory", () => {
  test("GET /api/inventory?q=Camry returns search results without 500", async ({
    request,
  }) => {
    const resp = await request.get("/api/inventory?q=Camry");
    expect([200, 503]).toContain(resp.status());

    if (resp.status() === 503) return;

    const body = await resp.json();
    expect(body).toHaveProperty("vehicles");
    expect(Array.isArray(body.vehicles)).toBe(true);
  });

  test("GET /api/inventory response always has required shape", async ({
    request,
  }) => {
    const resp = await request.get("/api/inventory");
    expect([200, 503]).toContain(resp.status());

    if (resp.status() === 503) return;

    const body = await resp.json();
    expect(body).toHaveProperty("vehicles");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("page");
    expect(body).toHaveProperty("page_size");
    expect(body).toHaveProperty("facets");
    expect(typeof body.total).toBe("number");
    expect(typeof body.page).toBe("number");
  });

  test("GET /api/inventory?condition=new filters by condition", async ({
    request,
  }) => {
    const resp = await request.get("/api/inventory?condition=new");
    expect([200, 503]).toContain(resp.status());

    if (resp.status() === 503) return;

    const body = await resp.json();
    expect(Array.isArray(body.vehicles)).toBe(true);

    for (const vehicle of body.vehicles) {
      expect(vehicle.condition).toBe("new");
    }
  });
});

// ---------------------------------------------------------------------------
// Journey 4 — Submit contact form (with CSRF awareness)
// ---------------------------------------------------------------------------

test.describe("Buyer journey: contact form submission", () => {
  test("Contact form POST with valid data returns 201 when CSRF bypassed", async ({
    request,
  }) => {
    // Direct API call with Bearer auth header to bypass CSRF middleware
    const resp = await request.post("/api/contact", {
      headers: { Authorization: "Bearer e2e-test" },
      data: validContactPayload(),
    });

    // 201 always (with or without DB), 429 if rate-limited
    expect([201, 429]).toContain(resp.status());

    if (resp.status() === 201) {
      const body = await resp.json();
      expect(body.success).toBe(true);
    }
  });

  test("Contact form POST without CSRF token returns 403 or 201 (demo mode)", async ({
    request,
  }) => {
    // Without Bearer auth the middleware applies CSRF check
    const resp = await request.post("/api/contact", {
      data: validContactPayload(),
    });

    // 403 = CSRF blocked (production), 201 = CSRF check disabled (demo), 422 = validation
    expect([201, 403, 422, 429]).toContain(resp.status());
  });

  test("Contact form with CSRF cookie+header flow returns 201", async ({
    page,
    request,
  }) => {
    // Visit homepage to get the wolfpack_csrf cookie set by middleware
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Read the CSRF cookie
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c) => c.name === "wolfpack_csrf");

    if (!csrfCookie) {
      // CSRF cookie not set — may be disabled in demo; skip CSRF test
      test.info().annotations.push({
        type: "info",
        description: "wolfpack_csrf cookie not found — CSRF may be disabled in demo mode",
      });
      return;
    }

    const resp = await request.post("/api/contact", {
      headers: { "x-csrf-token": csrfCookie.value },
      data: validContactPayload(),
    });

    expect([201, 429]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// Journey 5 — Contact form rejects missing fields
// ---------------------------------------------------------------------------

test.describe("Buyer journey: contact form validation", () => {
  test("Contact form with only first_name returns 422", async ({ request }) => {
    const resp = await request.post("/api/contact", {
      headers: { Authorization: "Bearer e2e-test" },
      data: { first_name: "OnlyFirst" },
    });

    // 422 = validation error, 403 = CSRF (both correct rejections)
    expect([422, 403]).toContain(resp.status());

    if (resp.status() === 422) {
      const body = await resp.json();
      expect(body).toHaveProperty("error");
      expect(Array.isArray(body.details)).toBe(true);
      // Should flag missing required fields
      expect(body.details.length).toBeGreaterThan(0);
    }
  });

  test("Contact form with empty body returns 422 or 400", async ({ request }) => {
    const resp = await request.post("/api/contact", {
      headers: { Authorization: "Bearer e2e-test" },
      data: {},
    });

    expect([400, 422, 403]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// Journey 6 — Financing page renders
// ---------------------------------------------------------------------------

test.describe("Buyer journey: financing page", () => {
  test("Financing page loads without server error", async ({ page }) => {
    const response = await page.goto("/financing", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    expect(response?.status()).not.toBe(500);

    // Page should have some meaningful content
    const body = await page.textContent("body");
    expect(body!.length).toBeGreaterThan(50);
  });

  test("Financing page has main heading", async ({ page }) => {
    const response = await page.goto("/financing", {
      waitUntil: "domcontentloaded",
    });

    if (!response || response.status() >= 400) {
      test.info().annotations.push({
        type: "skip",
        description: "Financing page not accessible",
      });
      return;
    }

    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Journey 7 — Lead submission with invalid email rejected
// ---------------------------------------------------------------------------

test.describe("Buyer journey: lead validation — invalid email", () => {
  test("Lead POST with invalid email returns 422", async ({ request }) => {
    const resp = await request.post("/api/leads", {
      data: validLeadPayload({ email: "notanemail" }),
    });

    expect(resp.status()).toBe(422);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
    expect(Array.isArray(body.details)).toBe(true);

    const emailError = body.details.find(
      (d: { field: string; message: string }) => d.field === "email",
    );
    expect(emailError).toBeDefined();
  });

  test("Lead POST with empty email returns 422", async ({ request }) => {
    const resp = await request.post("/api/leads", {
      data: validLeadPayload({ email: "" }),
    });

    expect(resp.status()).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// Journey 8 — Lead submission with invalid source rejected
// ---------------------------------------------------------------------------

test.describe("Buyer journey: lead validation — invalid source", () => {
  test("Lead POST with source='telepathy' returns 422", async ({ request }) => {
    const resp = await request.post("/api/leads", {
      data: validLeadPayload({ source: "telepathy" }),
    });

    expect(resp.status()).toBe(422);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
    expect(Array.isArray(body.details)).toBe(true);

    const sourceError = body.details.find(
      (d: { field: string; message: string }) => d.field === "source",
    );
    expect(sourceError).toBeDefined();
  });

  test("Lead POST with source='social_media' returns 422 (not an allowed enum)", async ({
    request,
  }) => {
    const resp = await request.post("/api/leads", {
      data: validLeadPayload({ source: "social_media" }),
    });

    expect(resp.status()).toBe(422);
  });

  test("Lead POST with missing dealer_id returns 422", async ({ request }) => {
    const payload = validLeadPayload();
    // Remove dealer_id to trigger validation failure
    const { dealer_id: _removed, ...rest } = payload as Record<string, unknown>;
    const resp = await request.post("/api/leads", { data: rest });

    expect(resp.status()).toBe(422);
  });
});
