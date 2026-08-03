import { test, expect } from "@playwright/test";

// Add immediately after imports:
test.skip(
  !process.env.DATABASE_URL,
  "Needs real Postgres (Phase 1 Tests runs in shadow mode). Run via the real-DB integration phase or locally with DATABASE_URL set."
);

/**
 * Data integrity tests that verify data flows through APIs correctly.
 *
 * These hit the actual API routes and verify responses contain expected
 * fields, enforce uniqueness, and handle edge cases.
 */

const BASE_URL = process.env.E2E_URL || "http://localhost:3000";

test.describe("Data integrity: contact form submission", () => {
  test("Contact form POST creates a record and returns success", async ({
    request,
  }) => {
    const response = await request.post(`${BASE_URL}/api/contact`, {
      data: {
        first_name: "IntegrationTest",
        last_name: "User",
        email: `e2e-contact-${Date.now()}@wolfpackmotors.test`,
        phone: "3035559999",
        subject: "General Inquiry",
        message: "This is an automated integration test submission.",
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.lead_id).toBeTruthy();
    expect(body.created_at).toBeTruthy();
  });

  test("Contact form rejects invalid data with 422", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/contact`, {
      data: {
        // Missing required fields
        email: "not-an-email",
      },
    });

    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeTruthy();
    expect(body.details.length).toBeGreaterThan(0);
  });
});

test.describe("Data integrity: leads API", () => {
  test("Lead submission creates a record", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/leads`, {
      data: {
        dealer_id: "default",
        first_name: "LeadTest",
        last_name: "User",
        email: `e2e-lead-${Date.now()}@wolfpackmotors.test`,
        phone: null,
        vehicle_interest: "2024 Honda CR-V",
        source: "website_form",
        notes: "Automated e2e test lead",
      },
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.lead_id).toBeTruthy();
    expect(body.created_at).toBeTruthy();
  });

  test("Lead submission rejects invalid data", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/leads`, {
      data: {
        // Missing required dealer_id and other fields
        email: "test@test.com",
      },
    });

    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("Validation failed");
  });
});

test.describe("Data integrity: inventory API consistency", () => {
  test("Inventory API returns consistent vehicle data", async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/inventory`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.vehicles).toBeTruthy();
    expect(Array.isArray(body.vehicles)).toBe(true);
    expect(body.vehicles.length).toBeGreaterThan(0);

    // Verify each vehicle has required fields
    const vins = new Set<string>();
    for (const vehicle of body.vehicles) {
      expect(vehicle.vin).toBeTruthy();
      expect(typeof vehicle.vin).toBe("string");
      expect(vehicle.year).toBeTruthy();
      expect(typeof vehicle.year).toBe("number");
      expect(vehicle.make).toBeTruthy();
      expect(typeof vehicle.make).toBe("string");
      expect(vehicle.model).toBeTruthy();
      expect(typeof vehicle.model).toBe("string");
      expect(vehicle.price).toBeTruthy();
      expect(typeof vehicle.price).toBe("number");

      // Collect VINs to check for duplicates
      vins.add(vehicle.vin);
    }

    // Verify no duplicate VINs
    expect(vins.size).toBe(body.vehicles.length);
  });

  test("Inventory API total count matches vehicles array length", async ({
    request,
  }) => {
    const response = await request.get(`${BASE_URL}/api/inventory`);
    const body = await response.json();
    expect(body.total).toBe(body.vehicles.length);
  });

  test("Inventory API accepts filter parameters", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/inventory?condition=used`
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(Array.isArray(body.vehicles)).toBe(true);
  });
});

test.describe("Data integrity: analytics events", () => {
  test("Analytics events endpoint accepts and buffers events", async ({
    request,
  }) => {
    const response = await request.post(
      `${BASE_URL}/api/analytics/events`,
      {
        data: {
          events: [
            {
              event_type: "page_view",
              action: "view",
              page: "/e2e-test",
              session_id: `e2e-session-${Date.now()}`,
              user_fingerprint: "e2e-test-fingerprint",
              timestamp: new Date().toISOString(),
              metadata: { test: true },
            },
            {
              event_type: "click",
              action: "cta_click",
              page: "/e2e-test",
              session_id: `e2e-session-${Date.now()}`,
              user_fingerprint: "e2e-test-fingerprint",
              timestamp: new Date().toISOString(),
              metadata: { element: "test-button" },
            },
          ],
        },
      }
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.accepted).toBe(2);
    expect(typeof body.buffered).toBe("number");
  });

  test("Analytics events rejects empty batch", async ({ request }) => {
    const response = await request.post(
      `${BASE_URL}/api/analytics/events`,
      {
        data: { events: [] },
      }
    );

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("events array required");
  });
});

test.describe("Data integrity: chat API", () => {
  test("Chat API returns vehicle results for search queries", async ({
    request,
  }) => {
    const response = await request.post(`${BASE_URL}/api/chat`, {
      data: {
        message: "Do you have any SUVs?",
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.response).toBeTruthy();
    expect(typeof body.response).toBe("string");
    expect(body.response.length).toBeGreaterThan(10);

    // Vehicle search queries should return vehicle data
    if (body.vehicles) {
      expect(Array.isArray(body.vehicles)).toBe(true);
      for (const v of body.vehicles) {
        expect(v.vin).toBeTruthy();
        expect(v.title).toBeTruthy();
        expect(v.price).toBeTruthy();
      }
    }
  });

  test("Chat API handles rule-based intents", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/chat`, {
      data: {
        message: "What are your business hours?",
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.response).toBeTruthy();
    // Hours response should mention times
    expect(body.response).toMatch(/AM|PM|Mon|Sat|Sun/i);
  });

  test("Chat API rejects empty messages", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/chat`, {
      data: {
        message: "",
      },
    });

    expect(response.status()).toBe(400);
  });
});

test.describe("Data integrity: admin export endpoints", () => {
  test("Leads export endpoint responds", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/admin/export/leads`
    );

    // May return 401/403 if auth is required, or 200 with CSV
    if (response.status() === 200) {
      const contentType = response.headers()["content-type"] || "";
      // Should be CSV or JSON
      expect(contentType).toMatch(/csv|json|text/i);
    } else {
      // Auth required — acceptable in test environment
      expect([401, 403]).toContain(response.status());
      test.info().annotations.push({
        type: "info",
        description: `Leads export returned ${response.status()} — likely needs auth`,
      });
    }
  });

  test("Analytics export endpoint responds", async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/admin/export/analytics`
    );

    if (response.status() === 200) {
      const body = await response.json();
      // Should have some structure
      expect(typeof body).toBe("object");
    } else {
      expect([401, 403]).toContain(response.status());
      test.info().annotations.push({
        type: "info",
        description: `Analytics export returned ${response.status()} — likely needs auth`,
      });
    }
  });
});
