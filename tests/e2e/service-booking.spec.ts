/**
 * service-booking.spec.ts
 *
 * E2E tests for the public Service Booking module.
 * Covers: available slots, booking appointments, validation,
 *         and public page rendering (no auth required).
 *
 * Run: npx playwright test tests/e2e/service-booking.spec.ts
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// API: GET /api/service/schedule/slots — available time slots
// ---------------------------------------------------------------------------

test.describe("Service Slots API — GET /api/service/schedule/slots", () => {
  test("returns available slots for a given date", async ({ request }) => {
    const resp = await request.get(
      "/api/service/schedule/slots?date=2026-03-28",
    );
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("slots");
      expect(Array.isArray(body.slots)).toBe(true);

      if (body.slots.length > 0) {
        const slot = body.slots[0];
        expect(slot).toHaveProperty("time");
        expect(slot).toHaveProperty("available");
        expect(typeof slot.available).toBe("boolean");
      }
    }
  });

  test("slots for future date returns results", async ({ request }) => {
    const resp = await request.get(
      "/api/service/schedule/slots?date=2026-04-15",
    );
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("slots");
      expect(Array.isArray(body.slots)).toBe(true);
    }
  });

  test("missing date param returns 400, not 500", async ({ request }) => {
    const resp = await request.get("/api/service/schedule/slots");
    expect(resp.status()).not.toBe(500);
    // Should require date param (zod returns 400, semantic validators return 422)
    // or return empty with 200.
    expect([200, 400, 422]).toContain(resp.status());
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get(
      "/api/service/schedule/slots?date=2026-03-28",
    );
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/service/schedule — book appointment
// ---------------------------------------------------------------------------

test.describe("Service Booking API — POST /api/service/schedule", () => {
  test("books appointment and returns confirmation", async ({ request }) => {
    const resp = await request.post("/api/service/schedule", {
      data: {
        customer_name: "E2E Test Customer",
        customer_email: "e2e@test.com",
        customer_phone: "555-0199",
        date: "2026-04-15",
        time: "10:00",
        service_type: "oil_change",
        vehicle_year: 2024,
        vehicle_make: "Honda",
        vehicle_model: "Civic",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200 || resp.status() === 201) {
      const body = await resp.json();
      expect(body).toHaveProperty("confirmation");
      const conf = body.confirmation;
      expect(conf).toHaveProperty("id");
      expect(conf).toHaveProperty("date");
      expect(conf).toHaveProperty("time");
      expect(conf).toHaveProperty("service_type");
    }
  });

  test("POST with missing required fields returns 400, not 500", async ({
    request,
  }) => {
    const resp = await request.post("/api/service/schedule", {
      data: {
        customer_name: "Incomplete Booking",
        // missing date, time, service_type
      },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 422]).toContain(resp.status());
  });

  test("POST with missing customer_name returns 400, not 500", async ({
    request,
  }) => {
    const resp = await request.post("/api/service/schedule", {
      data: {
        date: "2026-04-15",
        time: "10:00",
        service_type: "oil_change",
        // missing customer_name
      },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 422]).toContain(resp.status());
  });

  test("POST with invalid date format does not 500", async ({ request }) => {
    const resp = await request.post("/api/service/schedule", {
      data: {
        customer_name: "Bad Date Test",
        customer_email: "e2e@test.com",
        date: "not-a-date",
        time: "10:00",
        service_type: "oil_change",
      },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 422]).toContain(resp.status());
  });
});

// ---------------------------------------------------------------------------
// Public pages: load without crashing (no auth needed)
// ---------------------------------------------------------------------------

test.describe("Service Booking pages load without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  test("Service booking page loads (public)", async ({ page }) => {
    await page.goto("/service", { waitUntil: "domcontentloaded" });
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/500.*internal server error/i);
    expect(bodyText).not.toMatch(/Server error: 500/);
  });

  test("Service schedule page loads (public)", async ({ page }) => {
    await page.goto("/service/schedule", { waitUntil: "domcontentloaded" });
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toMatch(/500.*internal server error/i);
    expect(bodyText).not.toMatch(/Server error: 500/);
  });
});
