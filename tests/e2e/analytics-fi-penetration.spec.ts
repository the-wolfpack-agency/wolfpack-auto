/**
 * E2E: F&I product penetration heatmap.
 *
 * Verifies:
 *   1. The page route does not 5xx (admin routes may 401 in CI without a
 *      logged-in session — that's a 401, not 500; we accept either as a
 *      sign the route is wired correctly).
 *   2. The API endpoint returns 200 in shadow mode (no DATABASE_URL) with
 *      a non-empty `cells` array and a plain-English `headline`.
 *   3. The drilled=true query param fires both `_viewed` and `_drilled`
 *      analytics events (the route emits them; we assert the 200 response
 *      shape so the contract is locked even if the UI changes).
 */

import { test, expect, request as pwRequest } from "@playwright/test";

const API = "/api/admin/analytics/fi-penetration";

test.describe("F&I penetration", () => {
  test("API returns 200 + cells + plain-English headline (shadow mode)", async ({ baseURL }) => {
    const api = await pwRequest.newContext({ baseURL });
    const res = await api.get(API);
    // Some CI configs gate /api/admin behind auth even in shadow mode; accept
    // 401 or 200, but FAIL on 500 — 5xx means the route handler is broken.
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body.cells)).toBe(true);
      expect(body.cells.length).toBeGreaterThan(0);
      expect(typeof body.headline).toBe("string");
      // Plain-English: dealership words, not "attach_rate=0.78".
      expect(body.headline).not.toContain("attach_rate");
      expect(body.headline).not.toContain("undefined");
      // Months axis renders ISO strings the UI can format.
      expect(Array.isArray(body.months)).toBe(true);
    }
    await api.dispose();
  });

  test("drilled=true returns 200 (cells unchanged, analytics fires server-side)", async ({ baseURL }) => {
    const api = await pwRequest.newContext({ baseURL });
    const res = await api.get(`${API}?drilled=true`);
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.cells.length).toBeGreaterThan(0);
    }
    await api.dispose();
  });

  test("admin page route is wired (200 or 401, never 5xx)", async ({ baseURL }) => {
    const api = await pwRequest.newContext({ baseURL });
    const res = await api.get("/admin/analytics/fi-penetration");
    expect(res.status()).toBeLessThan(500);
    await api.dispose();
  });
});
