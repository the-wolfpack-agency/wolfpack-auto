/**
 * Touchpoint dispatcher.
 *
 * The single entry-point for routing a physical-world scan into the
 * Wolfpack Assistant. Steps:
 *
 *   1. Pick the registered handler for the touchpoint type.
 *   2. Handler parses + validates the raw input.
 *   3. Look up the (tenant, type, id) registration in
 *      `touchpoint_registrations`.
 *   4. Suppress duplicates (same tuple + customer within 60s).
 *   5. Record the event in `touchpoint_events`.
 *   6. Emit an analytics + audit_log entry.
 *   7. Return the action slug + parameters so the route layer / assistant
 *      can execute the action.
 *
 * All side-effects (DB, audit, analytics) are wrapped in try/catch so
 * that one failure does not poison another -- the function ALWAYS
 * returns a {@link DispatchResult}, even on error, so the route can
 * shape a clean HTTP response.
 *
 * Triple-write hook: when QDRANT_URL + NEO4J_URI are configured, the
 * event is mirrored to the analytics_events triple-write fanout via the
 * existing `lib/triple-write.ts` infrastructure (so "scans similar to
 * this one" queries land naturally in the same vector / graph store).
 */

import { randomUUID, createHash } from "node:crypto";

import { trackTouchpoint } from "@/lib/analytics-hooks";
import { auditLog } from "@/lib/audit-log";

import type { TouchpointHandler } from "./handler-interface";
import {
  TouchpointNotSupportedError,
  TouchpointParseError,
  type DispatchResult,
  type ParsedScan,
  type TouchpointOutcome,
  type TouchpointType,
} from "./types";
import { createQrHandler } from "./qr-handler";
import { createNfcHandler } from "./nfc-handler";
import { createRfidHandler } from "./rfid-handler";
import { createBeaconHandler } from "./beacon-handler";

const DUPLICATE_WINDOW_SECONDS = 60;

export interface DispatchContext {
  customerId?: string;
  ip?: string;
  ua?: string;
}

export interface DispatchOptions {
  /** Override the default handler registry (used by tests). */
  handlers?: Map<TouchpointType, TouchpointHandler>;
}

/* ------------------------------------------------------------------ */
/* Default registry                                                    */
/* ------------------------------------------------------------------ */

let defaultRegistry: Map<TouchpointType, TouchpointHandler> | null = null;

export function getHandlerRegistry(): Map<TouchpointType, TouchpointHandler> {
  if (!defaultRegistry) {
    defaultRegistry = new Map<TouchpointType, TouchpointHandler>([
      ["qr", createQrHandler()],
      ["nfc", createNfcHandler()],
      ["rfid", createRfidHandler()],
      ["beacon", createBeaconHandler()],
    ]);
  }
  return defaultRegistry;
}

/**
 * Exposed for tests -- forces a fresh registry next call.
 */
export function _resetHandlerRegistry(): void {
  defaultRegistry = null;
}

/* ------------------------------------------------------------------ */
/* dispatchScan                                                        */
/* ------------------------------------------------------------------ */

export async function dispatchScan(
  tenantId: string,
  type: TouchpointType,
  rawInput: string,
  context: DispatchContext = {},
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  const handler = (options.handlers ?? getHandlerRegistry()).get(type);
  if (!handler) {
    return await recordAndReturn(
      tenantId,
      type,
      "unknown",
      null,
      context,
      "error",
      `no handler registered for type=${type}`,
    );
  }

  // 1. Parse.
  let parsed: ParsedScan;
  try {
    parsed = await handler.parse(rawInput);
  } catch (err) {
    const detail =
      err instanceof TouchpointParseError ||
      err instanceof TouchpointNotSupportedError
        ? err.detail
        : err instanceof Error
          ? err.message
          : "parse failed";
    const outcome: TouchpointOutcome =
      err instanceof TouchpointNotSupportedError ? "error" : "no_match";
    emitAnalytics(
      tenantId,
      outcome === "no_match" ? "touchpoint.unknown_payload" : "touchpoint.scanned",
      {
        touchpoint_type: type,
        outcome,
        detail,
      },
    );
    return await recordAndReturn(
      tenantId,
      type,
      "unknown",
      null,
      context,
      outcome,
      detail,
    );
  }

  // 2. Validate.
  let valid = false;
  try {
    valid = await handler.validate(parsed);
  } catch {
    valid = false;
  }
  if (!valid) {
    emitAnalytics(tenantId, "touchpoint.unknown_payload", {
      touchpoint_type: type,
      touchpoint_id: parsed.id,
      outcome: "error",
      detail: "validation_failed",
    });
    return await recordAndReturn(
      tenantId,
      type,
      parsed.id,
      parsed.payload,
      context,
      "error",
      "signature_or_payload_validation_failed",
    );
  }

  // 3. Duplicate-suppression -- same (tenant, touchpoint_id, customer)
  //    inside the duplicate window collapses into a single action.
  if (await isDuplicate(tenantId, type, parsed.id, context.customerId)) {
    emitAnalytics(tenantId, "touchpoint.duplicate_suppressed", {
      touchpoint_type: type,
      touchpoint_id: parsed.id,
    });
    return await recordAndReturn(
      tenantId,
      type,
      parsed.id,
      parsed.payload,
      context,
      "duplicate_suppressed",
      `dedup_window=${DUPLICATE_WINDOW_SECONDS}s`,
    );
  }

  // 4. Look up the action registration.
  const registration = await lookupRegistration(tenantId, type, parsed.id);

  // 5. Record.
  if (!registration) {
    emitAnalytics(tenantId, "touchpoint.scanned", {
      touchpoint_type: type,
      touchpoint_id: parsed.id,
      outcome: "no_match",
    });
    return await recordAndReturn(
      tenantId,
      type,
      parsed.id,
      parsed.payload,
      context,
      "no_match",
      "touchpoint not registered",
    );
  }

  const result = await recordAndReturn(
    tenantId,
    type,
    parsed.id,
    parsed.payload,
    context,
    "action_triggered",
    null,
    registration.action_slug ?? undefined,
    registration.action_parameters ?? undefined,
  );

  // 6. Analytics + audit AFTER the persist call so eventId is available.
  emitAnalytics(tenantId, "touchpoint.scanned", {
    touchpoint_type: type,
    touchpoint_id: parsed.id,
    outcome: "action_triggered",
  });
  if (registration.action_slug) {
    emitAnalytics(tenantId, "touchpoint.action_triggered", {
      touchpoint_type: type,
      touchpoint_id: parsed.id,
      action_slug: registration.action_slug,
    });
  }
  await auditTrail(tenantId, type, parsed.id, result.eventId, context);

  return result;
}

/* ------------------------------------------------------------------ */
/* Persistence helpers                                                 */
/* ------------------------------------------------------------------ */

async function recordAndReturn(
  tenantId: string,
  type: TouchpointType,
  touchpointId: string,
  payload: Record<string, unknown> | null,
  context: DispatchContext,
  outcome: TouchpointOutcome,
  detail: string | null,
  actionSlug?: string,
  actionParameters?: Record<string, unknown>,
): Promise<DispatchResult> {
  const eventId = randomUUID();

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO touchpoint_events
           (id, tenant_id, touchpoint_type, touchpoint_id, payload, customer_id,
            device_fingerprint, action_triggered_slug, outcome, outcome_detail,
            ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12)`,
        [
          eventId,
          tenantId,
          type,
          touchpointId,
          payload ? JSON.stringify(payload) : null,
          context.customerId ?? null,
          fingerprint(context),
          actionSlug ?? null,
          outcome,
          detail,
          context.ip ?? null,
          context.ua ?? null,
        ],
      );
    } catch (err) {
      console.error("[touchpoints/dispatcher] persist failed:", err);
    }
  }

  return {
    outcome,
    eventId,
    actionSlug,
    actionParameters,
    detail: detail ?? undefined,
  };
}

async function lookupRegistration(
  tenantId: string,
  type: TouchpointType,
  touchpointId: string,
): Promise<{
  action_slug: string | null;
  action_parameters: Record<string, unknown> | null;
} | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { query } = await import("@/lib/db");
    const result = await query<{
      action_slug: string | null;
      action_parameters: unknown;
    }>(
      `SELECT action_slug, action_parameters
         FROM touchpoint_registrations
        WHERE tenant_id = $1 AND touchpoint_type = $2 AND touchpoint_id = $3
              AND active = TRUE
        LIMIT 1`,
      [tenantId, type, touchpointId],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      action_slug: row.action_slug,
      action_parameters:
        (row.action_parameters as Record<string, unknown> | null) ?? null,
    };
  } catch (err) {
    console.error("[touchpoints/dispatcher] registration lookup failed:", err);
    return null;
  }
}

async function isDuplicate(
  tenantId: string,
  type: TouchpointType,
  touchpointId: string,
  customerId: string | undefined,
): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const { query } = await import("@/lib/db");
    const result = await query<{ id: string }>(
      `SELECT id FROM touchpoint_events
        WHERE tenant_id = $1 AND touchpoint_type = $2 AND touchpoint_id = $3
              AND COALESCE(customer_id::text, '') = COALESCE($4::text, '')
              AND scanned_at > NOW() - ($5 || ' seconds')::interval
        LIMIT 1`,
      [tenantId, type, touchpointId, customerId ?? null, DUPLICATE_WINDOW_SECONDS],
    );
    return result.rows.length > 0;
  } catch (err) {
    console.error("[touchpoints/dispatcher] duplicate-check failed:", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Side-effects                                                        */
/* ------------------------------------------------------------------ */

function emitAnalytics(
  tenantId: string,
  event:
    | "touchpoint.scanned"
    | "touchpoint.unknown_payload"
    | "touchpoint.action_triggered"
    | "touchpoint.duplicate_suppressed",
  meta: Record<string, string | number | boolean>,
): void {
  try {
    trackTouchpoint(event, tenantId, meta);
  } catch {
    /* swallow -- analytics must never block */
  }
}

async function auditTrail(
  tenantId: string,
  type: TouchpointType,
  touchpointId: string,
  eventId: string,
  context: DispatchContext,
): Promise<void> {
  try {
    await auditLog(
      "touchpoint.scanned",
      { touchpoint_type: type, touchpoint_id: touchpointId, event_id: eventId },
      context.customerId,
      tenantId,
      context.ip,
    );
  } catch {
    /* swallow -- audit must never block */
  }
}

function fingerprint(ctx: DispatchContext): string | null {
  if (!ctx.ip && !ctx.ua) return null;
  return createHash("sha256")
    .update(`${ctx.ip ?? ""}|${ctx.ua ?? ""}`)
    .digest("hex")
    .slice(0, 32);
}
