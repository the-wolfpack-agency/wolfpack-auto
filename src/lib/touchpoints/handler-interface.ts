/**
 * Touchpoint handler contract.
 *
 * Every handler (qr, nfc, rfid, beacon, webhook) implements this
 * interface. The contract is intentionally narrow:
 *   - `parse` turns raw scan input into a typed identifier + payload.
 *   - `validate` runs handler-specific authenticity checks (HMAC
 *     signature on a signed QR envelope, NFC tag UID checksum, etc.).
 *
 * Handlers MUST throw {@link TouchpointParseError} on malformed input
 * and {@link TouchpointNotSupportedError} when the provider integration
 * is not wired. Other errors propagate as 5xx -- the dispatcher catches
 * everything and records an "error" event so no scan is ever silently
 * dropped.
 */

import type { ParsedScan, TouchpointType } from "./types";

export interface TouchpointHandler {
  /** Touchpoint type slug -- matches the migration 081 CHECK constraint. */
  readonly type: TouchpointType;

  /**
   * Static set of payload-format capabilities this handler knows how to
   * parse. The QR handler declares "url", "json", "wp_signed",
   * "wolfpack_uri"; stub handlers declare nothing.
   */
  readonly supports: ReadonlySet<string>;

  /** Parse the raw scan input into a typed payload. */
  parse(rawInput: string | Buffer): Promise<ParsedScan>;

  /**
   * Validate the parsed payload -- e.g. HMAC signature for signed QR
   * envelopes. Returns true when the payload is authentic, false when
   * the signature check fails. Handlers without a signature concept
   * return true unconditionally.
   */
  validate(parsed: ParsedScan): Promise<boolean>;
}
