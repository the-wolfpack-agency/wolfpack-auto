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
          if (sameOriginApi) {
            handling = true;
            const next = window.location.pathname + window.location.search;
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
