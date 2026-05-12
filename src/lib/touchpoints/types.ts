/**
 * Touchpoint module — shared types.
 *
 * A "touchpoint" is any physical-world identifier a customer can engage
 * with: a QR code, an NFC tag, an RFID badge, an iBeacon, or a server-
 * delivered webhook. Year-1 ships the QR handler in full; the other
 * handlers are stubs with TODO(provider-credential) markers reserving
 * the year-two work.
 *
 * The module is intentionally vertical-agnostic: the same primitive
 * handles automotive QR-on-windshield and retail QR-on-receipt without
 * code changes.
 */

/* ------------------------------------------------------------------ */
/* Type-system primitives                                              */
/* ------------------------------------------------------------------ */

export const TOUCHPOINT_TYPES = [
  "qr",
  "nfc",
  "rfid",
  "beacon",
  "webhook",
] as const;

export type TouchpointType = (typeof TOUCHPOINT_TYPES)[number];

export const TOUCHPOINT_OUTCOMES = [
  "action_triggered",
  "no_match",
  "duplicate_suppressed",
  "rate_limited",
  "error",
] as const;

export type TouchpointOutcome = (typeof TOUCHPOINT_OUTCOMES)[number];

/* ------------------------------------------------------------------ */
/* Parsed payloads                                                     */
/* ------------------------------------------------------------------ */

/**
 * Output of {@link TouchpointHandler.parse}. The `id` is the canonical
 * touchpoint identifier the dispatcher will look up against
 * `touchpoint_registrations`; the `payload` is the type-specific decoded
 * body (e.g. for QR codes, this might include the raw URL or the signed
 * envelope's claims).
 */
export interface ParsedScan {
  id: string;
  payload: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Persistence shapes                                                  */
/* ------------------------------------------------------------------ */

/**
 * Row shape for `touchpoint_events`. The DB row may have extra columns
 * (timestamps, etc.); this interface is the read-side projection used by
 * the admin detail route.
 */
export interface TouchpointEventRow {
  id: string;
  tenant_id: string;
  touchpoint_type: TouchpointType;
  touchpoint_id: string;
  payload: Record<string, unknown> | null;
  customer_id: string | null;
  device_fingerprint: string | null;
  scanned_at: string;
  action_triggered_slug: string | null;
  outcome: TouchpointOutcome | null;
  outcome_detail: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

/**
 * Row shape for `touchpoint_registrations`. Tenants register physical
 * touchpoints ahead of time and bind each to an assistant action.
 */
export interface TouchpointRegistrationRow {
  id: string;
  tenant_id: string;
  touchpoint_type: TouchpointType;
  touchpoint_id: string;
  action_slug: string | null;
  action_parameters: Record<string, unknown> | null;
  label: string | null;
  active: boolean;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Dispatcher return                                                   */
/* ------------------------------------------------------------------ */

export interface DispatchResult {
  /** Resolved outcome -- mirrors the CHECK constraint on touchpoint_events. */
  outcome: TouchpointOutcome;
  /** UUID of the touchpoint_events row that was just written. */
  eventId: string;
  /** Action slug to execute (when outcome === "action_triggered"). */
  actionSlug?: string;
  /** Default parameters for the action (from touchpoint_registrations). */
  actionParameters?: Record<string, unknown>;
  /** Human-readable detail -- forwarded to outcome_detail. */
  detail?: string;
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/**
 * Thrown by handlers when the payload cannot be parsed at all
 * (malformed input, unknown format, bad signature). The dispatcher
 * catches this and records the event with outcome="error".
 */
export class TouchpointParseError extends Error {
  constructor(
    public readonly type: TouchpointType,
    public readonly detail: string,
  ) {
    super(`Touchpoint parse failure (${type}): ${detail}`);
    this.name = "TouchpointParseError";
  }
}

/**
 * Thrown when a handler has been called for a touchpoint type whose
 * provider integration is not yet wired (year-two stubs).
 */
export class TouchpointNotSupportedError extends Error {
  constructor(
    public readonly type: TouchpointType,
    public readonly detail: string,
  ) {
    super(`Touchpoint not supported (${type}): ${detail}`);
    this.name = "TouchpointNotSupportedError";
  }
}
