"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

/**
 * Global session-expiry guard for the admin area.
 *
 * While any admin page is mounted, this wraps window.fetch. When an
 * authenticated same-origin /api call returns 401 (the session JWT expired),
 * the user is logged out and sent to the login page with a `next` param,
 * instead of being left on a page whose actions silently fail with an
 * "Authentication required" message they never see the cause of.
 *
 * The auth endpoints and the signout request itself are excluded so there is
 * no redirect loop, and a guard flag ensures signOut fires only once.
 *
 * Renders nothing.
 */
/**
 * Pages that legitimately have no session. A 401 on these is expected, not a
 * signal to send somebody to sign in.
 */
const PUBLIC_AUTH_PATHS = [
  "/admin/login",
  "/admin/accept-invite",
  "/admin/reset-password",
  "/admin/forgot-password",
];

export default function AdminAuthWatcher() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const original = window.fetch;
    let handling = false;

    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args);
      if (res.status === 401 && !handling) {
        const input = args[0];
        const rawUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input instanceof Request
                ? input.url
                : "";
        try {
          const u = new URL(rawUrl, window.location.origin);
          const sameOriginApi =
            u.origin === window.location.origin &&
            u.pathname.startsWith("/api/") &&
            !u.pathname.startsWith("/api/auth/");

          /* Never redirect while already on an unauthenticated page.
           *
           * The login page has no session by definition, so any /api call it
           * makes answers 401. Redirecting to login from login is a loop, and
           * because each hop encoded the previous URL into `next`, the address
           * grew on every pass: ?next=%2Fadmin%2Flogin%3Fnext%3D%252F... until
           * the browser was refreshing continuously. */
          const onPublicAuthPage = PUBLIC_AUTH_PATHS.some(
            (p) => window.location.pathname === p || window.location.pathname.startsWith(`${p}/`),
          );

          if (sameOriginApi && !onPublicAuthPage) {
            handling = true;
            const current = window.location.pathname + window.location.search;
            /* Never carry a login URL forward as `next`; that is what let the
               parameter nest inside itself. */
            const next = PUBLIC_AUTH_PATHS.some((p) => window.location.pathname.startsWith(p))
              ? "/admin"
              : current;
            void signOut({
              callbackUrl: `/admin/login?next=${encodeURIComponent(next)}`,
            });
          }
        } catch {
          // Unparseable URL: leave the response untouched.
        }
      }
      return res;
    };

    return () => {
      window.fetch = original;
    };
  }, []);

  return null;
}
