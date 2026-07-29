/**
 * @jest-environment node
 *
 * Middleware public-route guard.
 *
 * Regression cover for the admin forgot-password loop a client hit: the login
 * page linked "Forgot password" to /admin/reset-password, but the middleware
 * auth gate protected every /admin/* route except login, so a locked-out user
 * was bounced back to /admin/login and the reset page just looked like it
 * refreshed.
 *
 * These tests assert BOTH directions so the fix cannot silently regress and the
 * gate itself cannot silently weaken:
 *   - Public, session-less routes (login, reset-password page + API) must pass
 *     through, never redirect to login and never 401.
 *   - A genuinely protected admin route must still redirect an unauthenticated
 *     browser request to /admin/login (the auth wall still works).
 */

import { NextRequest } from "next/server";

// Unauthenticated: getToken resolves null, as it would for a logged-out user.
jest.mock("next-auth/jwt", () => ({
  getToken: jest.fn(async () => null),
}));

import { middleware } from "../middleware";

function request(path: string, method = "GET"): NextRequest {
  return new NextRequest(`https://wolfpack-auto.vercel.app${path}`, { method });
}

function redirectLocation(res: Response): string {
  return res.headers.get("location") ?? "";
}

describe("middleware: password reset is reachable without a session", () => {
  test("GET /admin/reset-password is not redirected to login", async () => {
    const res = await middleware(request("/admin/reset-password"));
    expect(redirectLocation(res)).not.toContain("/admin/login");
  });

  test("POST /api/admin/reset-password (request email) is not 401", async () => {
    const res = await middleware(request("/api/admin/reset-password", "POST"));
    expect(res.status).not.toBe(401);
  });

  test("PUT /api/admin/reset-password (set new password) is not 401", async () => {
    const res = await middleware(request("/api/admin/reset-password", "PUT"));
    expect(res.status).not.toBe(401);
  });

  test("GET /admin/login is reachable and not redirected", async () => {
    const res = await middleware(request("/admin/login"));
    expect(redirectLocation(res)).not.toContain("callbackUrl");
  });
});

describe("middleware: the auth wall still gates real protected routes", () => {
  test("unauthenticated GET /admin/inventory redirects to /admin/login", async () => {
    const res = await middleware(request("/admin/inventory"));
    expect(redirectLocation(res)).toContain("/admin/login");
    expect(redirectLocation(res)).toContain(
      "callbackUrl=%2Fadmin%2Finventory",
    );
  });

  test("unauthenticated GET /api/admin/leads returns 401", async () => {
    const res = await middleware(request("/api/admin/leads"));
    expect(res.status).toBe(401);
  });
});
