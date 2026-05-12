/**
 * NFC touchpoint handler -- STUB.
 *
 * Year-2 work. NFC tags carry a UID + optional NDEF payload. The
 * production handler will:
 *   - Parse the NDEF record (typically a URI record pointing at a
 *     `wp://nfc/{tenant}/{uid}` URL or a signed envelope identical
 *     to the QR-handler's wp1 format).
 *   - Validate the tag UID against the registration table.
 *   - Optionally verify a NXP NTAG 424 DNA SUN message (Secure Unique
 *     NFC) when the tag is provisioned for anti-cloning.
 *
 * The provider credential we'll need is the NXP NTAG 424 DNA master
 * key for SUN verification -- see TODO(provider-credential).
 */

import type { TouchpointHandler } from "./handler-interface";
import {
  TouchpointNotSupportedError,
  type ParsedScan,
} from "./types";

export class NfcHandler implements TouchpointHandler {
  public readonly type = "nfc" as const;
  public readonly supports: ReadonlySet<string> = new Set<string>();

  async parse(rawInput: string | Buffer): Promise<ParsedScan> {
    void rawInput;
    // TODO(provider-credential): wire NXP NTAG 424 DNA master key for
    // SUN signature verification + NDEF parser.
    throw new TouchpointNotSupportedError(
      "nfc",
      "NFC parsing not yet wired -- see TODO(provider-credential)",
    );
  }

  async validate(parsed: ParsedScan): Promise<boolean> {
    void parsed;
    // TODO(provider-credential): SUN-message verification.
    return false;
  }
}

export function createNfcHandler(): NfcHandler {
  return new NfcHandler();
}
