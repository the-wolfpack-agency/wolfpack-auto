/**
 * RFID touchpoint handler -- STUB.
 *
 * Year-2 work. RFID tags (EPC Gen2 / UHF) typically surface their EPC
 * via a reader gateway, not via the customer's phone. The production
 * handler will:
 *   - Accept a reader-gateway webhook payload (EPC + reader_id +
 *     observed_at).
 *   - Map (reader_id, EPC) to a touchpoint_id.
 *   - Optionally verify the reader gateway's signed callback.
 *
 * The provider credential we'll need is the reader-gateway HMAC secret
 * per reader -- see TODO(provider-credential).
 */

import type { TouchpointHandler } from "./handler-interface";
import {
  TouchpointNotSupportedError,
  type ParsedScan,
} from "./types";

export class RfidHandler implements TouchpointHandler {
  public readonly type = "rfid" as const;
  public readonly supports: ReadonlySet<string> = new Set<string>();

  async parse(rawInput: string | Buffer): Promise<ParsedScan> {
    void rawInput;
    // TODO(provider-credential): wire reader-gateway HMAC secret + EPC
    // parser (Zebra FX9600 / Impinj R420 reference).
    throw new TouchpointNotSupportedError(
      "rfid",
      "RFID parsing not yet wired -- see TODO(provider-credential)",
    );
  }

  async validate(parsed: ParsedScan): Promise<boolean> {
    void parsed;
    // TODO(provider-credential): reader-gateway signature verification.
    return false;
  }
}

export function createRfidHandler(): RfidHandler {
  return new RfidHandler();
}
