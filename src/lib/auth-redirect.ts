/**
 * Send an unauthenticated user to the login page instead of showing them a
 * dead form.
 *
 * WHY
 *
 * /admin/agency/new-dealer rendered "Authentication required" inline, in red,
 * above a fully populated form. The session had expired, so nothing the person
 * typed could ever be saved, but the page gave no way to fix it: no link, no
 * redirect, just a filled-in form that would fail again on every submit.
 *
 * A 401 on an authenticated page is not a validation error to display. It means
 * there is no session, and the only useful response is to go and get one.
 *
 * `next` carries the path back, so signing in returns to the page they were on
 * rather than dumping them on a dashboard.
 */

/** The sign-in page for the tenant console. */
export const ADMIN_LOGIN_PATH = "/admin/login";

/**
 * Build the login URL that returns to `currentPath` afterwards.
 *
 * Pure, so the redirect target is testable without a browser.
 * Only same-origin paths are carried: a `next` of `https://evil.test` or
 * `//evil.test` would turn the login page into an open redirect.
 */
export function loginUrlFor(currentPath: string): string {
  const safe = /^\/(?!\/)/.test(currentPath) ? currentPath : "/admin";
  return `${ADMIN_LOGIN_PATH}?next=${encodeURIComponent(safe)}`;
}

/**
 * If `response` says the caller has no session, navigate to login and report
 * true so the caller can stop.
 *
 * Returns false for every other status, including 403: that is a real
 * permission answer for a real session, and bouncing somebody to a login page
 * they are already signed into is a loop, not a fix.
 */
export function redirectToLoginIfUnauthenticated(
  response: { status: number },
  location: { pathname: string; href: string } = typeof window !== "undefined"
    ? window.location
    : { pathname: "/admin", href: "" },
): boolean {
  if (response.status !== 401) return false;
  location.href = loginUrlFor(location.pathname);
  return true;
}
