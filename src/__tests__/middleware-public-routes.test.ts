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

describe("middleware: invite acceptance is reachable without a session", () => {
  // Regression cover for the invite loop a coworker hit: the emailed
  // "Accept Invitation" link points at /admin/accept-invite?token=..., but the
  // auth gate bounced the session-less invitee to
  // /admin/login?callbackUrl=%2Fadmin%2Faccept-invite, dropping the ?token= and
  // showing the sign-in form instead of the set-password flow. An invited user
  // has no account yet, so gating this route makes the invite unusable.
  test("GET /admin/accept-invite is not redirected to login", async () => {
    const res = await middleware(request("/admin/accept-invite"));
    expect(redirectLocation(res)).not.toContain("/admin/login");
  });

  test("GET /admin/accept-invite with a token does not drop the token via a login redirect", async () => {
    const res = await middleware(request("/admin/accept-invite?token=abc123"));
    // The whole bug: the invitee was redirected and lost the token. Assert no
    // redirect to login at all, so the page renders and reads its own ?token=.
    expect(redirectLocation(res)).not.toContain("/admin/login");
    expect(redirectLocation(res)).not.toContain("callbackUrl");
  });

  test("POST /api/admin/accept-invite (set password from invite) is not 401", async () => {
    const res = await middleware(request("/api/admin/accept-invite", "POST"));
    expect(res.status).not.toBe(401);
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

/**
 * The login round trip must not eat the query string.
 *
 * Reported 2026-08-19: the CEO opened an invitation link and got "Invalid or
 * missing invitation token". Accept-invite is exempt from this gate, so it was
 * not the cause that time, and the comment in the middleware records the day it
 * WAS: an invitee bounced to login lost their ?token= because the callback
 * carried the path alone.
 *
 * Exempting one route fixed one route. The mechanism that truncates every
 * other one stayed exactly as it was, and a link that loses its parameters
 * looks like a broken destination page rather than a broken redirect.
 */
describe("middleware: a redirect to login preserves the whole destination", () => {
  test("the query survives, not just the path", async () => {
    const res = await middleware(request("/admin/vehicles?status=sold&page=3"));
    const location = redirectLocation(res);
    expect(location).toContain("/admin/login");

    const callback = new URL(location).searchParams.get("callbackUrl");
    expect(callback).toBe("/admin/vehicles?status=sold&page=3");
  });

  test("a path with no query is unchanged, with no stray question mark", async () => {
    const res = await middleware(request("/admin/vehicles"));
    const callback = new URL(redirectLocation(res)).searchParams.get("callbackUrl");
    expect(callback).toBe("/admin/vehicles");
  });

  test("the callback stays a path, so it can never send anybody off-site", async () => {
    /* It is read straight into window.location.href after sign-in. Whatever
       this contains must be same-origin by construction. */
    const res = await middleware(request("/admin/vehicles?next=https://evil.example"));
    const callback = new URL(redirectLocation(res)).searchParams.get("callbackUrl") ?? "";
    expect(callback.startsWith("/")).toBe(true);
    expect(callback.startsWith("//")).toBe(false);
  });
});
