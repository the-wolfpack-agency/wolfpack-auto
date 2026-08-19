/**
 * Where sign-in is allowed to send somebody afterwards.
 *
 * `callbackUrl` arrives in the query string, so anybody can choose its value,
 * and the login page assigns it to `window.location.href` once the password has
 * been accepted. A value of "https://evil.example/admin/login" would therefore
 * take somebody who has just authenticated to somebody else's copy of this
 * page, which is a credential-phishing primitive rather than a redirect bug.
 *
 * Only a same-origin PATH is honoured:
 *   - must start with "/"        rejects "https://evil.example"
 *   - must not start with "//"   protocol-relative, read as another origin
 *   - must not start with "/\"   some browsers normalise the backslash
 *
 * A rejected value is not an error: it falls back to the dashboard, because
 * somebody who has just signed in correctly should land somewhere useful rather
 * than be shown a security message about a URL they did not type.
 *
 * It lives in lib, not inline in the page, so the rule is one function with one
 * test rather than a regex copied into an assertion that only ever tests
 * itself. Found while fixing the invitation dead end on 2026-08-19: the
 * middleware redirect now carries the query as well as the path, and widening
 * what travels through here without checking what it is would be careless.
 */
const SAME_ORIGIN_PATH = /^\/(?![/\\])/;

export function safeCallbackUrl(raw: string | null | undefined, fallback = "/admin"): string {
  return raw && SAME_ORIGIN_PATH.test(raw) ? raw : fallback;
}
