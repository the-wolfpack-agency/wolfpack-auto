/**
 * Advanced Analytics Signals — E2E Tests
 *
 * Validates webhook handlers, photo management, buyer's guide, lead conversion,
 * inventory export, and push notification endpoints.
 *
 * Endpoints tested:
 *   POST /api/webhooks/resend                      — Resend email webhook
 *   GET  /api/admin/vehicles/[vin]/photos          — Vehicle photos
 *   GET  /api/admin/vehicles/[vin]/buyers-guide    — FTC Buyer's Guide
 *   POST /api/admin/leads/[id]/convert             — Lead-to-deal conversion
 *   GET  /api/admin/inventory/export               — CSV inventory export
 *   GET  /api/admin/notifications/push             — Push subscriptions
 */

import { test, expect } from "@playwright/test";

// Shadow-mode skip: webhook handlers + admin vehicle/lead/inventory routes
// all read/write Postgres (leads, vehicles, deals, push subscriptions). In
// shadow mode (DATABASE_URL='') the round-trips collapse. Re-run via the
// real-DB integration phase.
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set.",
);

/* ===================================================================== */
/*  Resend Webhook Handler                                                */
/* ===================================================================== */

test.describe("Resend Webhook — /api/webhooks/resend", () => {
  test("POST with email.delivered event returns 200 with received:true", async ({
    request,
  }) => {
    const resp = await request.post("/api/webhooks/resend", {
      data: {
        type: "email.delivered",
        data: {
          email_id: "email_test_001",
          from: "noreply@wolfpackauto.com",
          to: ["buyer@example.com"],
          subject: "Your Vehicle Inquiry",
        },
        created_at: new Date().toISOString(),
      },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty("received");
    expect(body.received).toBe(true);
  });

  test("POST with email.opened event returns 200 with received:true", async ({
    request,
  }) => {
    const resp = await request.post("/api/webhooks/resend", {
      data: {
        type: "email.opened",
        data: {
          email_id: "email_test_002",
          to: ["buyer@example.com"],
          subject: "New Inventory Alert",
        },
      },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.received).toBe(true);
  });

  test("POST with unknown event type returns 200 (accepted gracefully)", async ({
    request,
  }) => {
    const resp = await request.post("/api/webhooks/resend", {
      data: {
        type: "email.some_future_event",
        data: { email_id: "email_test_003" },
      },
    });

    // Webhook always returns 200 to prevent retries
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.received).toBe(true);
  });

  test("POST with email.clicked event returns 200 with received:true", async ({
    request,
  }) => {
    const resp = await request.post("/api/webhooks/resend", {
      data: {
        type: "email.clicked",
        data: {
          email_id: "email_test_004",
          to: ["buyer@example.com"],
          click: { link: "https://wolfpackauto.com/inventory/123" },
        },
      },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.received).toBe(true);
  });

  test("POST with email.bounced event returns 200 with received:true", async ({
    request,
  }) => {
    const resp = await request.post("/api/webhooks/resend", {
      data: {
        type: "email.bounced",
        data: {
          email_id: "email_test_005",
          to: ["invalid@nowhere.invalid"],
        },
      },
    });

    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.received).toBe(true);
  });

  test("POST with empty body still returns 200 (never errors on webhook)", async ({
    request,
  }) => {
    // Sending an empty text body — the endpoint reads req.text() first
    const resp = await request.post("/api/webhooks/resend", {
      headers: { "content-type": "text/plain" },
      data: "",
    });

    // Webhook always returns 200 to prevent Resend retries
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.received).toBe(true);
  });
});

/* ===================================================================== */
/*  Vehicle Photos                                                        */
/* ===================================================================== */

test.describe("Vehicle Photos — /api/admin/vehicles/[vin]/photos", () => {
  test("GET /api/admin/vehicles/[vin]/photos returns 200 with photo list", async ({
    request,
  }) => {
    const vin = "1HGCV1F34PA000001";
    const resp = await request.get(`/api/admin/vehicles/${vin}/photos`);
    const status = resp.status();

    if (status !== 200) {
      const body = await resp.text().catch(() => "(no body)");
      expect(
        status,
        `GET /api/admin/vehicles/${vin}/photos returned ${status}. Body: ${body.slice(0, 300)}`,
      ).toBe(200);
    }

    const body = await resp.json();

    expect(body).toHaveProperty("vin");
    expect(body.vin).toBe(vin.toUpperCase());
    expect(body).toHaveProperty("photos");
    expect(Array.isArray(body.photos)).toBe(true);
    expect(body).toHaveProperty("total");
    expect(typeof body.total).toBe("number");
    expect(body.total).toBe(body.photos.length);
  });
});

/* ===================================================================== */
/*  Buyer's Guide                                                         */
/* ===================================================================== */

test.describe("Buyer's Guide — /api/admin/vehicles/[vin]/buyers-guide", () => {
  test("GET returns 200 with HTML content", async ({ request }) => {
    const vin = "1HGCV1F34PA000001";
    const resp = await request.get(
      `/api/admin/vehicles/${vin}/buyers-guide`,
    );
    const status = resp.status();

    if (status !== 200) {
      const body = await resp.text().catch(() => "(no body)");
      expect(
        status,
        `GET buyers-guide returned ${status}. Body: ${body.slice(0, 300)}`,
      ).toBe(200);
    }

    const contentType = resp.headers()["content-type"] ?? "";
    expect(contentType).toContain("text/html");

    const html = await resp.text();
    expect(html.length).toBeGreaterThan(500);
  });

  test("GET buyers-guide contains FTC-required fields", async ({
    request,
  }) => {
    const vin = "1HGCV1F34PA000001";
    const resp = await request.get(
      `/api/admin/vehicles/${vin}/buyers-guide`,
    );
    expect(resp.status()).toBe(200);

    const html = await resp.text();

    // FTC Used Car Rule required elements
    expect(html.toLowerCase()).toContain("buyer");
    expect(html).toContain("As Is");
    expect(html.toUpperCase()).toContain(vin.toUpperCase());
    expect(html).toContain("Warranty");
    expect(html).toContain("Federal Trade Commission");
    expect(html).toContain("16 CFR Part 455");
  });

  test("GET buyers-guide contains dealer information", async ({
    request,
  }) => {
    const vin = "1HGCV1F34PA000001";
    const resp = await request.get(
      `/api/admin/vehicles/${vin}/buyers-guide`,
    );
    expect(resp.status()).toBe(200);

    const html = await resp.text();

    // Must have dealer info section
    expect(html).toContain("dealer-info");
    expect(html).toContain("dealer-name");

    // Must have vehicle info section
    expect(html).toContain("vehicle-info");
    expect(html).toContain("VIN");
    expect(html).toContain("Year");
    expect(html).toContain("Price");
    expect(html).toContain("Mileage");
  });

  test("GET buyers-guide contains signature lines and print button", async ({
    request,
  }) => {
    const vin = "1HGCV1F34PA000001";
    const resp = await request.get(
      `/api/admin/vehicles/${vin}/buyers-guide`,
    );
    expect(resp.status()).toBe(200);

    const html = await resp.text();

    // Buyer and dealer signature sections
    expect(html).toContain("Buyer");
    expect(html).toContain("Dealer Representative");
    expect(html).toContain("Signature");

    // Print functionality
    expect(html).toContain("print-btn");
    expect(html).toContain("window.print()");
  });
});

/* ===================================================================== */
/*  Lead Conversion                                                       */
/* ===================================================================== */

test.describe("Lead Conversion — /api/admin/leads/[id]/convert", () => {
  test("POST /api/admin/leads/[id]/convert returns 201 with deal object", async ({
    request,
  }) => {
    const leadId = `e2e-lead-${Date.now()}`;
    const resp = await request.post(
      `/api/admin/leads/${leadId}/convert`,
      {
        data: {
          deal_type: "retail",
          selling_price: 32000,
        },
      },
    );
    const status = resp.status();

    // Accept 200 or 201 — shadow mode returns 201
    expect(
      [200, 201],
      `POST convert returned ${status} instead of 200/201`,
    ).toContain(status);

    const body = await resp.json();

    expect(body).toHaveProperty("deal");
    expect(body).toHaveProperty("lead_id");
    expect(body.lead_id).toBe(leadId);
    expect(body).toHaveProperty("converted");
    expect(body.converted).toBe(true);

    // Deal object structure
    const deal = body.deal;
    expect(deal).toHaveProperty("id");
    expect(deal).toHaveProperty("dealer_id");
    expect(deal).toHaveProperty("status");
    expect(deal.status).toBe("working");
    expect(deal).toHaveProperty("deal_type");
    expect(deal).toHaveProperty("lead_id");
    expect(deal.lead_id).toBe(leadId);
  });

  test("POST convert with already-converted lead returns 409 (or 201 in shadow mode with idempotency)", async ({
    request,
  }) => {
    // First conversion
    const leadId = `e2e-dup-lead-${Date.now()}`;
    const first = await request.post(
      `/api/admin/leads/${leadId}/convert`,
      { data: { deal_type: "retail" } },
    );
    expect([200, 201]).toContain(first.status());

    // Second conversion of same lead — should hit idempotency cache
    // In DB mode with real data: 409 (already converted)
    // In shadow mode: 201 from idempotency cache (same payload)
    const second = await request.post(
      `/api/admin/leads/${leadId}/convert`,
      { data: { deal_type: "retail" } },
    );

    // Accept 201 (idempotency cache hit) or 409 (DB duplicate detection)
    expect([201, 409]).toContain(second.status());

    const body = await second.json();
    if (second.status() === 409) {
      expect(body).toHaveProperty("error");
      expect(body.error.toLowerCase()).toContain("already");
    } else {
      // Idempotency hit — returns the same deal
      expect(body).toHaveProperty("converted");
      expect(body.converted).toBe(true);
    }
  });
});

/* ===================================================================== */
/*  Inventory CSV Export                                                   */
/* ===================================================================== */

test.describe("Inventory Export — /api/admin/inventory/export", () => {
  test("GET returns 200 with CSV content and Content-Disposition header", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/inventory/export");
    const status = resp.status();

    if (status !== 200) {
      const body = await resp.text().catch(() => "(no body)");
      expect(
        status,
        `GET /api/admin/inventory/export returned ${status}. Body: ${body.slice(0, 300)}`,
      ).toBe(200);
    }

    // Content-Type must be CSV
    const contentType = resp.headers()["content-type"] ?? "";
    expect(
      contentType,
      `Expected text/csv content type, got: ${contentType}`,
    ).toContain("text/csv");

    // Must have Content-Disposition for download
    const disposition = resp.headers()["content-disposition"] ?? "";
    expect(
      disposition,
      "Missing Content-Disposition header for CSV download",
    ).toContain("attachment");
    expect(disposition).toContain("inventory-export");
    expect(disposition).toContain(".csv");
  });

  test("GET export CSV contains header row with required columns", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/inventory/export");
    expect(resp.status()).toBe(200);

    const csv = await resp.text();
    const lines = csv.split("\n");
    expect(lines.length).toBeGreaterThan(1); // header + at least one row

    const headerRow = lines[0];
    expect(headerRow).toContain("VIN");
    expect(headerRow).toContain("Year");
    expect(headerRow).toContain("Make");
    expect(headerRow).toContain("Model");
    expect(headerRow).toContain("Price");
    expect(headerRow).toContain("Status");
    expect(headerRow).toContain("Mileage");
  });

  test("GET export CSV data rows have correct column count", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/inventory/export");
    expect(resp.status()).toBe(200);

    const csv = await resp.text();
    const lines = csv.split("\n").filter((line) => line.trim().length > 0);
    expect(lines.length).toBeGreaterThan(1);

    const headerColumns = lines[0].split(",").length;

    // Check that data rows have the same number of columns as the header
    for (let i = 1; i < Math.min(lines.length, 5); i++) {
      const dataColumns = lines[i].split(",").length;
      expect(
        dataColumns,
        `Row ${i} has ${dataColumns} columns but header has ${headerColumns}`,
      ).toBe(headerColumns);
    }
  });

  test("GET export CSV data rows contain real VIN-like values", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/inventory/export");
    expect(resp.status()).toBe(200);

    const csv = await resp.text();
    const lines = csv.split("\n").filter((line) => line.trim().length > 0);
    expect(lines.length).toBeGreaterThan(1);

    // First data row — VIN should be a non-empty alphanumeric string
    const firstDataRow = lines[1].split(",");
    const vin = firstDataRow[0].replace(/"/g, "");
    expect(vin.length).toBeGreaterThan(0);
    expect(/^[A-Z0-9]+$/i.test(vin)).toBe(true);
  });
});

/* ===================================================================== */
/*  Push Notifications                                                    */
/* ===================================================================== */

test.describe("Push Notifications — /api/admin/notifications/push", () => {
  test("GET returns 200 with subscriptions array", async ({ request }) => {
    const resp = await request.get("/api/admin/notifications/push");
    const status = resp.status();

    if (status !== 200) {
      const body = await resp.text().catch(() => "(no body)");
      expect(
        status,
        `GET /api/admin/notifications/push returned ${status}. Body: ${body.slice(0, 300)}`,
      ).toBe(200);
    }

    const body = await resp.json();

    expect(body).toHaveProperty("subscriptions");
    expect(body).toHaveProperty("count");
    expect(Array.isArray(body.subscriptions)).toBe(true);
    expect(typeof body.count).toBe("number");
    expect(body.count).toBe(body.subscriptions.length);
  });

  test("GET push subscriptions — each subscription has required fields", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/notifications/push");
    expect(resp.status()).toBe(200);

    const body = await resp.json();

    // In demo/shadow mode, mock subscriptions should be present
    if (body.subscriptions.length > 0) {
      for (const sub of body.subscriptions) {
        expect(sub).toHaveProperty("id");
        expect(sub).toHaveProperty("dealer_id");
        expect(sub).toHaveProperty("endpoint");
        expect(typeof sub.endpoint).toBe("string");
        expect(sub.endpoint.startsWith("https://")).toBe(true);
        expect(sub).toHaveProperty("keys");
        expect(sub.keys).toHaveProperty("p256dh");
        expect(sub.keys).toHaveProperty("auth");
        expect(sub).toHaveProperty("user_agent");
        expect(sub).toHaveProperty("created_at");
        expect(sub).toHaveProperty("last_used_at");
      }
    }
  });

  test("POST push subscribe with invalid subscription returns 400", async ({
    request,
  }) => {
    const resp = await request.post("/api/admin/notifications/push", {
      data: {
        action: "subscribe",
        subscription: { endpoint: null, keys: null },
      },
    });

    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
  });

  test("POST push with unknown action returns 400", async ({ request }) => {
    const resp = await request.post("/api/admin/notifications/push", {
      data: {
        action: "nonexistent_action",
      },
    });

    expect(resp.status()).toBe(400);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("Unknown action");
  });
});
