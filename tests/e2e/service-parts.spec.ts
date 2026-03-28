/**
 * service-parts.spec.ts
 *
 * E2E tests for the Service & Parts module.
 * Covers: appointments, repair orders, parts inventory (incl. low-stock filter),
 *         technicians, service history by VIN, and admin page rendering.
 *
 * Run: npx playwright test tests/e2e/service-parts.spec.ts
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// API: GET /api/admin/service/appointments
// ---------------------------------------------------------------------------

test.describe("Service Appointments API", () => {
  test("GET returns appointments array", async ({ request }) => {
    const resp = await request.get("/api/admin/service/appointments");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("appointments");
      expect(Array.isArray(body.appointments)).toBe(true);

      if (body.appointments.length > 0) {
        const appt = body.appointments[0];
        expect(appt).toHaveProperty("id");
        expect(appt).toHaveProperty("customer_name");
        expect(appt).toHaveProperty("scheduled_date");
        expect(appt).toHaveProperty("status");
      }
    }
  });

  test("POST creates appointment (returns 200 or 401)", async ({ request }) => {
    const resp = await request.post("/api/admin/service/appointments", {
      data: {
        customer_name: "E2E Test Customer",
        scheduled_date: "2026-04-15",
        scheduled_time: "10:00",
        vin: "1HGCV1F34PA000099",
        service_type: "oil_change",
        description: "E2E test appointment",
      },
    });
    expect(resp.status()).not.toBe(500);
    expect([200, 201, 401, 403]).toContain(resp.status());
  });

  test("POST with missing fields returns 400, not 500", async ({ request }) => {
    const resp = await request.post("/api/admin/service/appointments", {
      data: { customer_name: "Incomplete" },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(resp.status());
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/service/appointments");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/service/repair-orders
// ---------------------------------------------------------------------------

test.describe("Repair Orders API", () => {
  test("GET returns repair_orders array with ro_number, status, grand_total", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/service/repair-orders");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("repair_orders");
      expect(Array.isArray(body.repair_orders)).toBe(true);

      if (body.repair_orders.length > 0) {
        const ro = body.repair_orders[0];
        expect(ro).toHaveProperty("ro_number");
        expect(ro).toHaveProperty("status");
        expect(ro).toHaveProperty("grand_total");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/service/repair-orders");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/service/parts
// ---------------------------------------------------------------------------

test.describe("Parts Inventory API", () => {
  test("GET returns parts array with part_number, qty_on_hand", async ({ request }) => {
    const resp = await request.get("/api/admin/service/parts");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("parts");
      expect(Array.isArray(body.parts)).toBe(true);

      if (body.parts.length > 0) {
        const part = body.parts[0];
        expect(part).toHaveProperty("part_number");
        expect(part).toHaveProperty("qty_on_hand");
      }
    }
  });

  test("GET ?low_stock=true returns only items at/below reorder point", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/service/parts?low_stock=true");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("parts");
      expect(Array.isArray(body.parts)).toBe(true);

      // Every part returned should have qty_on_hand <= reorder_point
      for (const part of body.parts) {
        expect(part.qty_on_hand).toBeLessThanOrEqual(part.reorder_point);
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/service/parts");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/service/technicians
// ---------------------------------------------------------------------------

test.describe("Technicians API", () => {
  test("GET returns technicians array", async ({ request }) => {
    const resp = await request.get("/api/admin/service/technicians");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("technicians");
      expect(Array.isArray(body.technicians)).toBe(true);

      if (body.technicians.length > 0) {
        const tech = body.technicians[0];
        expect(tech).toHaveProperty("name");
        expect(tech).toHaveProperty("status");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/service/technicians");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/service/history/[vin]
// ---------------------------------------------------------------------------

test.describe("Service History API", () => {
  test("GET returns service history array for known VIN", async ({ request }) => {
    const resp = await request.get("/api/admin/service/history/1HGCV1F34PA000001");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("history");
      expect(Array.isArray(body.history)).toBe(true);
      expect(body.history.length).toBeGreaterThan(0);
    }
  });

  test("GET returns history for unknown VIN (fallback data)", async ({ request }) => {
    const resp = await request.get("/api/admin/service/history/WBAPH5C55BA000000");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("history");
      expect(Array.isArray(body.history)).toBe(true);
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/service/history/1FTEW1EP3MFA78901");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Admin pages: load without crashing
// ---------------------------------------------------------------------------

test.describe("Service & Parts pages load without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  const PAGES = [
    { path: "/admin/service", label: "Service Dashboard" },
    { path: "/admin/service/appointments", label: "Appointments" },
    { path: "/admin/service/repair-orders", label: "Repair Orders" },
    { path: "/admin/service/parts", label: "Parts" },
    { path: "/admin/service/technicians", label: "Technicians" },
  ];

  for (const pg of PAGES) {
    test(`${pg.label} page loads`, async ({ page }) => {
      await page.goto(pg.path, { waitUntil: "domcontentloaded" });
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toMatch(/500.*internal server error/i);
      expect(bodyText).not.toMatch(/Server error: 500/);
    });
  }
});
