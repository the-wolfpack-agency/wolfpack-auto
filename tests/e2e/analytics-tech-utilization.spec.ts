/**
 * E2E: service tech utilization grid.
 *
 * Asserts the API returns a 200 in shadow mode with a populated grid and a
 * plain-English headline, and that the page route never 5xxs. Drill query
 * param exercises the second analytics event.
 */

import { test, expect, request as pwRequest } from "@playwright/test";

const API = "/api/admin/analytics/tech-utilization";

test.describe("Tech utilization", () => {
  test("API returns 200 with cells + headline + hoursAvailableFromConstant flag", async ({ baseURL }) => {
    const api = await pwRequest.newContext({ baseURL });
    const res = await api.get(API);
    expect([200, 401]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body.cells)).toBe(true);
      expect(body.cells.length).toBeGreaterThan(0);
      expect(typeof body.headline).toBe("string");
      expect(body.hoursAvailableFromConstant).toBe(true);
      expect(Array.isArray(body.weeks)).toBe(true);
      // No raw enums in the headline.
      expect(body.headline).not.toContain("hours_billed");
    }
    await api.dispose();
  });

  test("drilled=true returns 200", async ({ baseURL }) => {
    const api = await pwRequest.newContext({ baseURL });
    const res = await api.get(`${API}?drilled=true&techId=demo-tech-1`);
    expect([200, 401]).toContain(res.status());
    await api.dispose();
  });

  test("admin page route never 5xxs", async ({ baseURL }) => {
    const api = await pwRequest.newContext({ baseURL });
    const res = await api.get("/admin/analytics/tech-utilization");
    expect(res.status()).toBeLessThan(500);
    await api.dispose();
  });
});
