/**
 * Log sanitization helper.
 *
 * Single source of truth for stripping log-injection vectors out of
 * user-controlled strings before they hit `console.*`. Strips CR/LF/TAB
 * and any C0 control character so attackers can't forge fake log lines,
 * truncates to 200 chars to bound log volume.
 *
 * Use everywhere a request-derived value (req.body field, search param,
 * route param, header) flows into a log message.
 */
export function sanitizeForLog(v: unknown): string {
  return String(v ?? "")
    .replace(/[\r\n\t]/g, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, "")
    .slice(0, 200);
}
