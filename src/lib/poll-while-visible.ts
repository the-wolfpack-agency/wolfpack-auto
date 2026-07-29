/**
 * A setInterval that only invokes `fn` while the browser tab is VISIBLE.
 *
 * Dashboard widgets poll the database on a timer. Plain setInterval keeps
 * firing when the tab is backgrounded or left open unattended, so a single
 * forgotten admin/status tab hammers Neon around the clock and silently burns
 * public-network-transfer quota. Guarding on document.visibilityState means a
 * hidden tab costs zero database egress; polling resumes when the tab is shown.
 *
 * Returns the interval id so callers clear it exactly as before.
 */
export function pollWhileVisible(
  fn: () => void,
  intervalMs: number,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    if (
      typeof document === "undefined" ||
      document.visibilityState === "visible"
    ) {
      fn();
    }
  }, intervalMs);
}
