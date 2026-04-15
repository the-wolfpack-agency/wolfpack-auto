/**
 * Webhook Public Allowlist
 *
 * Any webhook route listed here is explicitly declared to NOT require
 * HMAC signature verification. Every entry MUST include a documented
 * reason explaining why it is safe to accept unsigned requests.
 *
 * The webhook-signature-coverage.test.ts test enforces that every
 * webhook route either verifies a signature OR appears here.
 *
 * To add an entry:
 *   { path: "my-provider/route.ts", reason: "..." }
 *
 * The `path` is relative to src/app/api/webhooks/.
 */

export interface WebhookAllowlistEntry {
  /** Path relative to src/app/api/webhooks/ (e.g. "health/route.ts"). */
  path: string;
  /** Human-readable justification reviewed and approved by engineering lead. */
  reason: string;
}

/**
 * Currently, all webhook routes (resend, stripe, twilio) implement
 * signature verification. No routes are allowlisted.
 */
export const WEBHOOK_PUBLIC_ALLOWLIST: WebhookAllowlistEntry[] = [];
