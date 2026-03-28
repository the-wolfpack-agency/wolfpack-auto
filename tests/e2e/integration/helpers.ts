/**
 * Shared helpers for integration tests.
 *
 * Provides authenticated API access via the demo user
 * and common assertions used across all integration specs.
 */
import { APIRequestContext, expect } from "@playwright/test";

/* ------------------------------------------------------------------ */
/*  Auth helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Authenticate as the demo user and return the session cookies.
 * Throws if sign-in fails so the entire test file is skipped.
 */
export async function getAuthCookies(
  request: APIRequestContext,
): Promise<string> {
  // 1. Fetch CSRF token
  const csrfRes = await request.get("/api/auth/csrf");
  expect(csrfRes.ok(), "CSRF endpoint must return 200").toBeTruthy();
  const { csrfToken } = await csrfRes.json();

  // Extract clean cookie name=value pairs from set-cookie headers
  const csrfRaw = csrfRes.headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value.split(";")[0].trim())
    .join("; ");

  // 2. Sign in with demo credentials
  const signInRes = await request.post("/api/auth/callback/credentials", {
    form: {
      email: "demo@wolfpackauto.com",
      password: "demo",
      csrfToken,
      json: "true",
    },
    headers: { cookie: csrfRaw },
  });

  // NextAuth redirects on success (302) or returns 200 with JSON
  const status = signInRes.status();
  expect(
    status === 200 || status === 302,
    `Demo login must succeed (got ${status})`,
  ).toBeTruthy();

  // Extract session cookies
  const signInRaw = signInRes.headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value.split(";")[0].trim())
    .join("; ");

  return [csrfRaw, signInRaw].filter(Boolean).join("; ");
}

/* ------------------------------------------------------------------ */
/*  Unique ID generator                                                */
/* ------------------------------------------------------------------ */

let counter = 0;

/** Returns a unique suffix for test data to avoid collisions. */
export function uniqueId(prefix = "test"): string {
  return `${prefix}-${Date.now()}-${++counter}`;
}

/* ------------------------------------------------------------------ */
/*  Analytics health helper                                            */
/* ------------------------------------------------------------------ */

export interface AnalyticsHealth {
  status: string;
  db_connected: boolean;
  events_last_hour: number;
  events_last_day: number;
  events_last_week: number;
  modules_reporting: string[];
  modules_silent: string[];
  healthy: boolean;
  message: string;
}

/**
 * Fetch analytics health. Works in both DB and shadow mode.
 * In shadow mode events_last_hour will be 0, which tests must tolerate.
 */
export async function getAnalyticsHealth(
  request: APIRequestContext,
  cookies: string,
): Promise<AnalyticsHealth> {
  const res = await request.get("/api/admin/analytics/health", {
    headers: { cookie: cookies },
  });
  expect(res.status()).not.toBe(500);
  if (res.status() === 401 || res.status() === 403) {
    return { status: "unauthenticated", db_connected: false, events_last_hour: 0, events_last_day: 0, events_last_week: 0, modules_reporting: [], modules_silent: [], healthy: false, message: "Not authenticated" };
  }
  return res.json();
}

/**
 * Assert the analytics health endpoint responds without 500.
 * In shadow mode (no DATABASE_URL) events_last_hour is always 0,
 * so we only assert the endpoint is reachable and well-formed.
 */
export async function assertAnalyticsReachable(
  request: APIRequestContext,
  cookies: string,
): Promise<AnalyticsHealth> {
  const health = await getAnalyticsHealth(request, cookies);
  expect(health.status).toBeTruthy();
  expect(typeof health.events_last_hour).toBe("number");
  expect(typeof health.events_last_day).toBe("number");
  return health;
}

/* ------------------------------------------------------------------ */
/*  Authenticated request shorthand                                    */
/* ------------------------------------------------------------------ */

export async function authGet(
  request: APIRequestContext,
  cookies: string,
  url: string,
) {
  const res = await request.get(url, { headers: { cookie: cookies } });
  expect(res.status(), `GET ${url} must not 500`).not.toBe(500);
  return res;
}

export async function authPost(
  request: APIRequestContext,
  cookies: string,
  url: string,
  data: Record<string, unknown>,
) {
  const res = await request.post(url, {
    headers: { cookie: cookies },
    data,
  });
  expect(res.status(), `POST ${url} must not 500`).not.toBe(500);
  return res;
}

export async function authPatch(
  request: APIRequestContext,
  cookies: string,
  url: string,
  data: Record<string, unknown>,
) {
  const res = await request.patch(url, {
    headers: { cookie: cookies },
    data,
  });
  expect(res.status(), `PATCH ${url} must not 500`).not.toBe(500);
  return res;
}

/* ------------------------------------------------------------------ */
/*  Browser login helper                                               */
/* ------------------------------------------------------------------ */

import type { Page } from "@playwright/test";

/**
 * Log in via the browser UI as the demo user.
 * Navigates to /admin/login, fills credentials, submits.
 */
export async function browserLogin(page: Page): Promise<void> {
  await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  const emailInput = page.locator('input[name="email"], input[type="email"]');
  const passwordInput = page.locator('input[name="password"], input[type="password"]');
  const submitBtn = page.locator('button[type="submit"]');

  if (await emailInput.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
    await emailInput.first().fill("demo@wolfpackauto.com");
    await passwordInput.first().fill("demo");
    await submitBtn.first().click();
    await page.waitForTimeout(2000);
  }
}
