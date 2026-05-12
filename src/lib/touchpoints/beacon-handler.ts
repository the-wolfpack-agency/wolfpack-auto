/**
 * iBeacon touchpoint handler -- STUB.
 *
 * Year-2 work. iBeacons broadcast (UUID, major, minor) tuples; the
 * customer's app surfaces a proximity event. The production handler
 * will:
 *   - Accept an app-sent payload `{ uuid, major, minor, rssi }`.
 *   - Map (uuid, major, minor) to a touchpoint_id.
 *   - Optionally bucket by RSSI to derive an "immediate / near / far"
 *     proximity tier.
 *
 * The provider credential we'll need is the per-tenant Beacon UUID set
 * (provisioned via the Wolfpack mobile SDK) -- see
 * TODO(provider-credential).
 */

import type { TouchpointHandler } from "./handler-interface";
import {
  TouchpointNotSupportedError,
  type ParsedScan,
} from "./types";

export class BeaconHandler implements TouchpointHandler {
  public readonly type = "beacon" as const;
  public readonly supports: ReadonlySet<string> = new Set<string>();

  async parse(rawInput: string | Buffer): Promise<ParsedScan> {
    void rawInput;
    // TODO(provider-credential): wire the per-tenant Beacon UUID
    // registry + RSSI proximity classification.
    throw new TouchpointNotSupportedError(
      "beacon",
      "iBeacon parsing not yet wired -- see TODO(provider-credential)",
    );
  }

  async validate(parsed: ParsedScan): Promise<boolean> {
    void parsed;
    // TODO(provider-credential): iBeacon SDK attestation.
    return false;
  }
}

export function createBeaconHandler(): BeaconHandler {
  return new BeaconHandler();
}
