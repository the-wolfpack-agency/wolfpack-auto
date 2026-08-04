/**
 * The panel an admin page shows when its data could not be loaded.
 *
 * WHY THIS EXISTS
 *
 * On 2026-08-04 production reported `TypeError: Failed to fetch` on
 * `/admin/leads`. It was not a crash — the page caught it and sent it to
 * Sentry, exactly as intended. The defect was what the operator saw: the catch
 * set `loading = false` and nothing else, so the leads table rendered as an
 * empty list. Indistinguishable from "this dealer has no leads".
 *
 * Two failure paths produced that same blank table:
 *   - the fetch rejecting (offline, dropped mobile connection, tab suspended)
 *   - `if (res.ok)` with no `else`, so a 401 or a 500 fell straight through
 *
 * A sweep found 41 of the 94 admin pages that fetch had no user-visible error
 * state at all. Two pages had already written their own local `ErrorState`,
 * character-for-character apart from the heading, which is why this is a shared
 * component rather than a third copy.
 *
 * Pair it with `describeFetchFailure()` so the operator is told which of the
 * two happened, and can tell "we are offline" apart from "your session ended".
 */
export function ErrorState({
  title,
  message,
  onRetry,
}: {
  /** What could not be loaded, in the operator's words: "Unable to load leads". */
  title: string;
  /** Why, in one sentence. Never a raw exception string. */
  message: string;
  /** Omit when there is nothing sensible to retry. */
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      data-testid="admin-error-state"
      className="rounded-xl border border-red-200 bg-red-50 p-6"
    >
      <p className="font-semibold text-red-800">{title}</p>
      <p className="mt-1 text-sm text-red-600">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          Try again
        </button>
      )}
    </div>
  );
}

/**
 * Turn a failed request into a sentence an operator can act on.
 *
 * Takes the response when one arrived, or the thrown error when the request
 * never completed. Deliberately never returns the raw exception text: "Failed
 * to fetch" is what the browser says, and it tells a service manager nothing.
 */
export function describeFetchFailure(input: {
  res?: Response | null;
  err?: unknown;
}): string {
  const { res, err } = input;

  if (res) {
    if (res.status === 401)
      return "Your session has ended. Sign in again to continue.";
    if (res.status === 403)
      return "Your account does not have access to this.";
    if (res.status === 404)
      return "That data is no longer available. Refresh and try again.";
    if (res.status === 429)
      return "Too many requests just now. Wait a moment and try again.";
    if (res.status >= 500)
      return "The server had a problem loading this. Try again in a moment.";
    return `The request was refused (${res.status}). Try again in a moment.`;
  }

  /* No response at all. The request never reached the server or never came
     back: offline, connection dropped mid-request, or the tab was suspended
     by the phone. This is the `TypeError: Failed to fetch` case. */
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You appear to be offline. Check your connection and try again.";
  }
  if (err instanceof Error && err.name === "AbortError") {
    return "The request was cancelled. Try again.";
  }
  return "Could not reach the server. Check your connection and try again.";
}
