/**
 * CSRF protection using the double-submit cookie pattern.
 *
 * How it works:
 *   1. The server generates a random token and sets it as a cookie
 *      (readable by JS, SameSite=Strict).
 *   2. Client-side code reads the cookie and includes the token as
 *      an X-CSRF-Token header (or csrf_token body field) on every
 *      mutating request (POST / PUT / DELETE).
 *   3. The server compares the cookie value to the header/body value.
 *      An attacker on a different origin cannot read the cookie, so
 *      they cannot forge the header.
 *
 * NextAuth handles its own CSRF for /api/auth routes, so those are
 * excluded. Routes protected by JWT Bearer tokens (API clients) are
 * also excluded since the token itself serves as a CSRF guard.
 */

/** Cookie name for the CSRF double-submit token. */
export const CSRF_COOKIE_NAME = "wolfpack_csrf";

/** Header name clients must send the token in. */
export const CSRF_HEADER_NAME = "x-csrf-token";

/** Body field name (alternative to the header). */
export const CSRF_BODY_FIELD = "csrf_token";

/**
 * Generate a cryptographically random CSRF token.
 * Uses crypto.randomUUID() which is available in both Node.js and Edge Runtime.
 */
export function generateCSRFToken(): string {
  return crypto.randomUUID();
}

/**
 * Validate that the submitted token matches the cookie token.
 *
 * Both values must be non-empty strings and must match exactly.
 * Timing-safe comparison is not critical here because the token
 * is a random UUID (not a secret derived from a key), but we
 * compare character-by-character to be safe.
 */
export function validateCSRFToken(
  submittedToken: string | undefined | null,
  cookieToken: string | undefined | null,
): boolean {
  if (!submittedToken || !cookieToken) return false;
  if (submittedToken.length !== cookieToken.length) return false;

  // Constant-time comparison
  let mismatch = 0;
  for (let i = 0; i < submittedToken.length; i++) {
    mismatch |= submittedToken.charCodeAt(i) ^ cookieToken.charCodeAt(i);
  }
  return mismatch === 0;
}
