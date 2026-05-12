/**
 * Touchpoint QR-scan E2E.
 *
 * Asserts the POST /api/touchpoints/scan happy + validation paths against
 * the running server. We do NOT depend on a registered touchpoint in the
 * database -- the contract this spec pins is the response *shape*:
 * { event_id, outcome, action_slug, action_parameters, detail }.
 *
 * Run: npx playwright test tests/e2e/touchpoint-qr-scan.spec.ts
 */

import { test, expect } from "@playwright/test";

const TENANT = "11111111-1111-4111-9111-111111111111";
const ENDPOINT = "/api/touchpoints/scan";

test.describe("POST /api/touchpoints/scan", () => {
  test("returns 200 with the documented shape for a canonical wolfpack QR", async ({
    request,
  }) => {
    const res = await request.post(ENDPOINT, {
      data: {
        tenant_id: TENANT,
        type: "qr",
        raw: `wp://qr/${TENANT}/walkaround-VIN999`,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.event_id).toBe("string");
    expect(body.event_id).toMatch(/[0-9a-f-]{36}/);
    expect([
      "action_triggered",
      "no_match",
      "duplicate_suppressed",
      "rate_limited",
      "error",
    ]).toContain(body.outcome);
    expect("action_slug" in body).toBe(true);
    expect("action_parameters" in body).toBe(true);
  });

  test("returns 400 on missing tenant_id", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: { type: "qr", raw: "wp://qr/x/y" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
  });

  test("returns 400 on unknown touchpoint type", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: { tenant_id: TENANT, type: "bluetooth", raw: "x" },
    });
    expect(res.status()).toBe(400);
  });

  test("returns 400 on invalid JSON body", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      data: "not-json",
      headers: { "content-type": "application/json" },
    });
    expect(res.status()).toBe(400);
  });
});
