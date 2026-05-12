/**
 * Touchpoint module -- vertical-agnostic scan handler framework.
 *
 * See docs/wolfpack-platform-multivertical-2026-05-12.md for the
 * strategic frame: year-1 ships QR-on-vehicle; year-2 retail mirrors
 * QR-on-receipt without code changes.
 *
 * Entry-points:
 *   - `dispatchScan`     -- the dispatcher route handlers call.
 *   - `createQrHandler`  -- the year-1 QR implementation.
 *   - `signQrPayload`    -- build a signed wp1 envelope (tests + UI).
 *   - `*Handler` classes -- stubs for NFC / RFID / iBeacon (year-2).
 *
 * All types live in `./types` so library consumers can `import type`
 * without pulling crypto.
 */

export type {
  DispatchResult,
  ParsedScan,
  TouchpointEventRow,
  TouchpointOutcome,
  TouchpointRegistrationRow,
  TouchpointType,
} from "./types";
export {
  TOUCHPOINT_OUTCOMES,
  TOUCHPOINT_TYPES,
  TouchpointNotSupportedError,
  TouchpointParseError,
} from "./types";
export type { TouchpointHandler } from "./handler-interface";

export { QrHandler, createQrHandler, signQrPayload } from "./qr-handler";
export { NfcHandler, createNfcHandler } from "./nfc-handler";
export { RfidHandler, createRfidHandler } from "./rfid-handler";
export { BeaconHandler, createBeaconHandler } from "./beacon-handler";

export {
  dispatchScan,
  getHandlerRegistry,
  _resetHandlerRegistry,
  type DispatchContext,
  type DispatchOptions,
} from "./dispatcher";
