/**
 * CSRF helper for Playwright e2e tests.
 *
 * The wolfpack middleware enforces double-submit-cookie CSRF on a small
 * set of public form endpoints (currently `/api/contact`). Tests that
 * POST to those endpoints must:
 *   1. Make a GET request first to receive a `wolfpack_csrf` cookie.
 *   2. Echo the cookie value back in the `x-csrf-token` header on the
 *      POST. The Playwright request fixture auto-sends the cookie
 *      itself, so callers only need to set the header.
 *
 * See `src/lib/csrf.ts` and `src/middleware.ts` for the server side.
 *
 * Usage:
 *
 *   import { csrfHeaders } from "../helpers/csrf";
 *   const headers = await csrfHeaders(request);
 *   await request.post("/api/contact", { headers, data: {...} });
 */
import type { APIRequestContext } from "@playwright/test";

const CSRF_COOKIE_NAME = "wolfpack_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

/**
 * Prime the CSRF cookie via a GET to `/` and return headers (including
 * the `x-csrf-token` value) that satisfy the middleware's double-submit
 * check on the next mutating request from the same `request` context.
 *
 * Returns an empty header map if no cookie is issued (e.g. middleware
 * disabled in some test environment) so callers don't need to special-case.
 */
export async function csrfHeaders(
  request: APIRequestContext,
): Promise<Record<string, string>> {
  // Any GET through middleware sets the cookie if it isn't already present.
  await request.get("/", { failOnStatusCode: false });

  const state = await request.storageState();
  const cookie = state.cookies.find((c) => c.name === CSRF_COOKIE_NAME);
  if (!cookie?.value) return {};

  return { [CSRF_HEADER_NAME]: cookie.value };
}
