/**
 * comms-automation.spec.ts
 *
 * E2E tests for the Communication Automation module.
 * Covers: message templates, follow-up sequences, message log,
 *         send endpoint (success + validation), and admin page rendering.
 *
 * Run: npx playwright test tests/e2e/comms-automation.spec.ts
 */
import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// API: GET /api/admin/comms/templates
// ---------------------------------------------------------------------------

test.describe("Comms Templates API", () => {
  test("GET returns templates array with name, channel, body", async ({ request }) => {
    const resp = await request.get("/api/admin/comms/templates");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("templates");
      expect(Array.isArray(body.templates)).toBe(true);

      if (body.templates.length > 0) {
        const tpl = body.templates[0];
        expect(tpl).toHaveProperty("name");
        expect(tpl).toHaveProperty("channel");
        expect(tpl).toHaveProperty("body");
      }
    }
  });

  test("POST creates template (or returns 401)", async ({ request }) => {
    const resp = await request.post("/api/admin/comms/templates", {
      data: {
        name: "E2E Test Template",
        channel: "email",
        category: "test",
        subject: "Test subject",
        body: "Hello {first_name}, this is a test.",
      },
    });
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("id");
    } else {
      expect([401, 403]).toContain(resp.status());
    }
  });

  test("POST with missing fields returns 400, not 500", async ({ request }) => {
    const resp = await request.post("/api/admin/comms/templates", {
      data: { name: "Incomplete" },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(resp.status());
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/comms/templates");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/comms/sequences
// ---------------------------------------------------------------------------

test.describe("Comms Sequences API", () => {
  test("GET returns sequences array", async ({ request }) => {
    const resp = await request.get("/api/admin/comms/sequences");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("sequences");
      expect(Array.isArray(body.sequences)).toBe(true);

      if (body.sequences.length > 0) {
        const seq = body.sequences[0];
        expect(seq).toHaveProperty("name");
        expect(seq).toHaveProperty("trigger");
        expect(seq).toHaveProperty("steps");
        expect(Array.isArray(seq.steps)).toBe(true);
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/comms/sequences");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/comms/log
// ---------------------------------------------------------------------------

test.describe("Comms Message Log API", () => {
  test("GET returns messages array with status, channel, recipient", async ({
    request,
  }) => {
    const resp = await request.get("/api/admin/comms/log");
    expect(resp.status()).not.toBe(500);

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("messages");
      expect(Array.isArray(body.messages)).toBe(true);

      if (body.messages.length > 0) {
        const msg = body.messages[0];
        expect(msg).toHaveProperty("status");
        expect(msg).toHaveProperty("channel");
        expect(msg).toHaveProperty("recipient");
      }
    }
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.get("/api/admin/comms/log");
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/comms/send
// ---------------------------------------------------------------------------

test.describe("Comms Send API", () => {
  test("POST with valid body returns success (or 401)", async ({ request }) => {
    const resp = await request.post("/api/admin/comms/send", {
      data: {
        channel: "email",
        recipient: "e2e-test@example.test",
        body: "Hello from E2E test",
      },
    });
    expect(resp.status()).not.toBe(500);
    expect([200, 401, 403]).toContain(resp.status());

    if (resp.status() === 200) {
      const body = await resp.json();
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("id");
    }
  });

  test("POST with missing recipient returns 400", async ({ request }) => {
    const resp = await request.post("/api/admin/comms/send", {
      data: {
        channel: "email",
        body: "Missing recipient",
      },
    });
    expect(resp.status()).not.toBe(500);
    // 400 (validation) or 401 (auth)
    expect([400, 401, 403]).toContain(resp.status());
  });

  test("POST with missing channel and recipient returns 400", async ({ request }) => {
    const resp = await request.post("/api/admin/comms/send", {
      data: { body: "No channel or recipient" },
    });
    expect(resp.status()).not.toBe(500);
    expect([400, 401, 403]).toContain(resp.status());
  });

  test("never returns 500", async ({ request }) => {
    const resp = await request.post("/api/admin/comms/send", {
      data: {
        channel: "sms",
        recipient: "+15550000000",
        body: "Test",
      },
    });
    expect(resp.status()).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Admin pages: load without crashing
// ---------------------------------------------------------------------------

test.describe("Comms pages load without 500", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Run once");

  const PAGES = [
    { path: "/admin/comms/templates", label: "Templates" },
    { path: "/admin/comms/sequences", label: "Sequences" },
    { path: "/admin/comms/log", label: "Message Log" },
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
