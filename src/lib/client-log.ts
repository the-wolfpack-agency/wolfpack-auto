/**
 * Client-side error reporter — replaces ad-hoc `console.error(...)` in
 * admin pages so a dealer doing a demo with DevTools open doesn't see
 * a red sea of stack traces. Production routes errors to Sentry (which
 * is wired in `instrumentation-client.ts`); development still logs to
 * the console so engineers see issues during local work.
 *
 * Usage:
 *   import { reportClientError } from "@/lib/client-log";
 *   try { ... } catch (err) {
 *     reportClientError("Failed to fetch leads", err, { dealer_id, route: "/admin/leads" });
 *   }
 *
 * Never throws. The reporter is best-effort — never block the user-
 * facing happy path on telemetry.
 */

import * as Sentry from "@sentry/nextjs";

type ErrorContext = Record<string, string | number | boolean | null | undefined>;

const IS_DEV = process.env.NODE_ENV !== "production";

export function reportClientError(
  context: string,
  err: unknown,
  extra?: ErrorContext,
): void {
  /* In development we want console output so engineers see the issue
   *  in their dev tools. In production we suppress console output and
   *  route exclusively through Sentry. */
  if (IS_DEV) {
    // eslint-disable-next-line no-console
    console.error(`[${context}]`, err, extra ?? {});
  }

  try {
    if (err instanceof Error) {
      Sentry.captureException(err, {
        tags: { client_context: context },
        extra: extra ? { ...extra } : undefined,
      });
    } else {
      Sentry.captureMessage(`${context}: ${String(err).slice(0, 500)}`, {
        level: "error",
        tags: { client_context: context },
        extra: extra ? { ...extra } : undefined,
      });
    }
  } catch {
    /* Sentry itself failed — swallow. We've already logged in dev; in
     *  prod we'd rather lose this one error than crash the UI. */
  }
}
