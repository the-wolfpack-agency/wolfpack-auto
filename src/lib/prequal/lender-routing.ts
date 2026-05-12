/**
 * Lender routing for the prequal flow (Stream B).
 *
 * Migration 067 introduced `prequal_offers` -- a synthetic offer list from
 * a rules engine. That's a great demo surface but it doesn't get the
 * customer in front of a real lender. This module replaces that path:
 *
 *   1. Pull the dealer's lender contact list from `dealer_lender_routes`
 *      (migration 070).
 *   2. Build a lender packet via `lender-packet-pdf.ts`.
 *   3. Email the packet to every active lender contact via
 *      `src/lib/email.ts`'s Resend-backed `sendEmail` -- gracefully
 *      degrading when RESEND_API_KEY isn't set (returns the rendered
 *      body so the dealer can copy/paste during demo).
 *   4. Record each send in `prequal_lender_dispatches` with status
 *      'sent' | 'queued' | 'failed' + the failure reason.
 *   5. Audit-log + analytics + triple-write for every dispatch.
 *
 * NOTHING here calls a credit bureau. NOTHING here adds new SDK deps.
 */

import { query } from "@/lib/db";
import { auditLog } from "@/lib/audit-log";
import { trackPrequal } from "@/lib/analytics-hooks";
import { writeEventsToSecondaryStores } from "@/lib/triple-write";
import type { AnalyticsEvent } from "@/lib/analytics-engine";
import { Resend } from "resend";
import { buildLenderPacket, type LenderPacketInput, type LenderPacket } from "./lender-packet-pdf";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type LenderType = "prime" | "sub_prime" | "captive" | "credit_union" | "other";

export interface DealerLenderRoute {
  id: string;
  dealerId: string;
  lenderName: string;
  contactEmail: string;
  contactName: string | null;
  sortOrder: number;
  active: boolean;
  lenderType: LenderType;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLenderRouteInput {
  dealerId: string;
  lenderName: string;
  contactEmail: string;
  contactName?: string | null;
  sortOrder?: number;
  lenderType?: LenderType;
  notes?: string | null;
}

export interface UpdateLenderRouteInput {
  lenderName?: string;
  contactEmail?: string;
  contactName?: string | null;
  sortOrder?: number;
  active?: boolean;
  lenderType?: LenderType;
  notes?: string | null;
}

export interface DispatchResult {
  dispatchId: string;
  lenderRouteId: string;
  lenderName: string;
  contactEmail: string;
  status: "sent" | "queued" | "failed";
  failureReason?: string;
}

export interface RouteToLendersResult {
  prequalId: string;
  dispatches: DispatchResult[];
  packetSubject: string;
  /** Plain-text body returned ONLY when RESEND_API_KEY is missing (graceful fallback). */
  packetTextFallback?: string;
}

/* -------------------------------------------------------------------------- */
/* Validators                                                                 */
/* -------------------------------------------------------------------------- */

// Anchored, length-bounded to avoid polynomial-time backtracking on
// untrusted input. RFC 5321 caps local at 64 + domain at 255 → cap at 320.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,63}$/;

export function isValidLenderEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length > 320) return false;
  return EMAIL_RE.test(trimmed);
}

export function isValidLenderType(t: string): t is LenderType {
  return ["prime", "sub_prime", "captive", "credit_union", "other"].includes(t);
}

/* -------------------------------------------------------------------------- */
/* CRUD: dealer_lender_routes                                                 */
/* -------------------------------------------------------------------------- */

function rowToRoute(r: {
  id: string;
  dealer_id: string;
  lender_name: string;
  contact_email: string;
  contact_name: string | null;
  sort_order: number;
  active: boolean;
  lender_type: LenderType;
  notes: string | null;
  created_at: string;
  updated_at: string;
}): DealerLenderRoute {
  return {
    id: r.id,
    dealerId: r.dealer_id,
    lenderName: r.lender_name,
    contactEmail: r.contact_email,
    contactName: r.contact_name,
    sortOrder: r.sort_order,
    active: r.active,
    lenderType: r.lender_type,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listLenderRoutes(dealerId: string): Promise<DealerLenderRoute[]> {
  const result = await query<{
    id: string;
    dealer_id: string;
    lender_name: string;
    contact_email: string;
    contact_name: string | null;
    sort_order: number;
    active: boolean;
    lender_type: LenderType;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, dealer_id, lender_name, contact_email, contact_name,
            sort_order, active, lender_type, notes, created_at, updated_at
       FROM dealer_lender_routes
      WHERE dealer_id = $1
      ORDER BY sort_order ASC, lender_name ASC`,
    [dealerId],
  );
  return result.rows.map(rowToRoute);
}

export async function createLenderRoute(
  input: CreateLenderRouteInput,
): Promise<DealerLenderRoute> {
  if (!input.lenderName.trim()) {
    throw new Error("lender_name is required");
  }
  if (!isValidLenderEmail(input.contactEmail)) {
    throw new Error("contact_email is not a valid email");
  }
  const lenderType = input.lenderType ?? "other";
  if (!isValidLenderType(lenderType)) {
    throw new Error(`Invalid lender_type: ${lenderType}`);
  }

  const result = await query<{
    id: string;
    dealer_id: string;
    lender_name: string;
    contact_email: string;
    contact_name: string | null;
    sort_order: number;
    active: boolean;
    lender_type: LenderType;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `INSERT INTO dealer_lender_routes (
       dealer_id, lender_name, contact_email, contact_name,
       sort_order, active, lender_type, notes
     ) VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7)
     RETURNING id, dealer_id, lender_name, contact_email, contact_name,
               sort_order, active, lender_type, notes, created_at, updated_at`,
    [
      input.dealerId,
      input.lenderName.trim(),
      input.contactEmail.trim().toLowerCase(),
      input.contactName ?? null,
      input.sortOrder ?? 0,
      lenderType,
      input.notes ?? null,
    ],
  );

  const row = result.rows[0];
  void auditLog(
    "prequal.lender_route.created",
    {
      lender_route_id: row.id,
      lender_name: row.lender_name,
      contact_email: row.contact_email,
      lender_type: row.lender_type,
    },
    undefined,
    input.dealerId,
  );
  return rowToRoute(row);
}

export async function updateLenderRoute(
  dealerId: string,
  routeId: string,
  patch: UpdateLenderRouteInput,
): Promise<DealerLenderRoute | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (patch.lenderName !== undefined) {
    if (!patch.lenderName.trim()) throw new Error("lender_name cannot be empty");
    fields.push(`lender_name = $${i++}`);
    values.push(patch.lenderName.trim());
  }
  if (patch.contactEmail !== undefined) {
    if (!isValidLenderEmail(patch.contactEmail))
      throw new Error("contact_email is not a valid email");
    fields.push(`contact_email = $${i++}`);
    values.push(patch.contactEmail.trim().toLowerCase());
  }
  if (patch.contactName !== undefined) {
    fields.push(`contact_name = $${i++}`);
    values.push(patch.contactName);
  }
  if (patch.sortOrder !== undefined) {
    fields.push(`sort_order = $${i++}`);
    values.push(patch.sortOrder);
  }
  if (patch.active !== undefined) {
    fields.push(`active = $${i++}`);
    values.push(patch.active);
  }
  if (patch.lenderType !== undefined) {
    if (!isValidLenderType(patch.lenderType))
      throw new Error(`Invalid lender_type: ${patch.lenderType}`);
    fields.push(`lender_type = $${i++}`);
    values.push(patch.lenderType);
  }
  if (patch.notes !== undefined) {
    fields.push(`notes = $${i++}`);
    values.push(patch.notes);
  }

  if (fields.length === 0) {
    // Nothing to update -- just return current state.
    const current = await query<{
      id: string;
      dealer_id: string;
      lender_name: string;
      contact_email: string;
      contact_name: string | null;
      sort_order: number;
      active: boolean;
      lender_type: LenderType;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, dealer_id, lender_name, contact_email, contact_name,
              sort_order, active, lender_type, notes, created_at, updated_at
         FROM dealer_lender_routes
        WHERE id = $1 AND dealer_id = $2`,
      [routeId, dealerId],
    );
    return current.rows.length ? rowToRoute(current.rows[0]) : null;
  }

  values.push(routeId, dealerId);
  const result = await query<{
    id: string;
    dealer_id: string;
    lender_name: string;
    contact_email: string;
    contact_name: string | null;
    sort_order: number;
    active: boolean;
    lender_type: LenderType;
    notes: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `UPDATE dealer_lender_routes
        SET ${fields.join(", ")}
      WHERE id = $${i++}
        AND dealer_id = $${i++}
      RETURNING id, dealer_id, lender_name, contact_email, contact_name,
                sort_order, active, lender_type, notes, created_at, updated_at`,
    values,
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  void auditLog(
    "prequal.lender_route.updated",
    { lender_route_id: row.id, patch },
    undefined,
    dealerId,
  );
  return rowToRoute(row);
}

export async function deleteLenderRoute(
  dealerId: string,
  routeId: string,
): Promise<boolean> {
  const result = await query<{ id: string }>(
    `DELETE FROM dealer_lender_routes
      WHERE id = $1 AND dealer_id = $2
      RETURNING id`,
    [routeId, dealerId],
  );
  const deleted = result.rows.length > 0;
  if (deleted) {
    void auditLog(
      "prequal.lender_route.deleted",
      { lender_route_id: routeId },
      undefined,
      dealerId,
    );
  }
  return deleted;
}

/* -------------------------------------------------------------------------- */
/* Triple-write helper                                                        */
/* -------------------------------------------------------------------------- */

function fanout(
  action: string,
  dealerId: string,
  prequalId: string,
  metadata: Record<string, string | number | boolean>,
): void {
  const ev: AnalyticsEvent = {
    event_type: "prequal_lender_dispatch",
    action,
    page: "/admin/prequal",
    session_id: prequalId,
    user_fingerprint: "server",
    timestamp: new Date().toISOString(),
    metadata: { ...metadata, dealer_id: dealerId, prequal_id: prequalId },
  };
  void writeEventsToSecondaryStores([ev]).catch(() => {
    /* never throw */
  });
}

/* -------------------------------------------------------------------------- */
/* Email send                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Resend client is lazily constructed -- absent RESEND_API_KEY, we return
 * `null` and the caller falls back to "log + return body in API response".
 * Same pattern used in src/lib/email.ts. Wrapping a separate instance here
 * keeps the function signature flexible for tests (Resend doesn't take
 * a recipient list in `email.ts`'s public helpers).
 */
function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

const DEFAULT_FROM =
  process.env.RESEND_FROM_EMAIL ?? "Wolfpack Motors <leads@wolfpackauto.com>";

async function sendLenderEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
  pdfBuffer?: Buffer;
  /** Optional sender override (per-dealer in the future). */
  from?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const client = getResendClient();
  if (!client) {
    console.log(
      `[prequal/lender-routing] No RESEND_API_KEY -- skipping live send to ${opts.to}. ` +
        `Subject="${opts.subject}", body=${opts.text.length} chars.`,
    );
    return { ok: false, reason: "resend_not_configured" };
  }

  try {
    const attachments = opts.pdfBuffer
      ? [
          {
            filename: "lender-packet.pdf",
            content: opts.pdfBuffer.toString("base64"),
          },
        ]
      : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendArgs: any = {
      from: opts.from ?? DEFAULT_FROM,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    };
    if (attachments) sendArgs.attachments = attachments;

    const { error } = await client.emails.send(sendArgs);
    if (error) {
      return { ok: false, reason: error.message ?? "resend_error" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/* -------------------------------------------------------------------------- */
/* Dispatch persistence                                                       */
/* -------------------------------------------------------------------------- */

async function recordDispatch(args: {
  prequalId: string;
  dealerId: string;
  lenderRouteId: string;
  packetUrl?: string | null;
  packetFormat: "text" | "pdf" | "html";
  status: "sent" | "queued" | "failed";
  failureReason?: string;
}): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO prequal_lender_dispatches (
       prequal_id, dealer_id, lender_route_id,
       packet_url, packet_format, status, failure_reason, sent_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7,
               CASE WHEN $6 = 'sent' THEN NOW() ELSE NULL END)
     RETURNING id`,
    [
      args.prequalId,
      args.dealerId,
      args.lenderRouteId,
      args.packetUrl ?? null,
      args.packetFormat,
      args.status,
      args.failureReason ?? null,
    ],
  );
  return result.rows[0].id;
}

/* -------------------------------------------------------------------------- */
/* Main entrypoint -- route a prequal to all active lender contacts           */
/* -------------------------------------------------------------------------- */

export interface RouteToLendersInput {
  dealerId: string;
  /** Same `prequalId` carried on the URL. Used for FK + audit trail. */
  prequalId: string;
  /** Already-assembled packet inputs -- callers (the route) gather these. */
  packetInput: LenderPacketInput;
  /**
   * Optional filter: when provided, only routes whose id is in this list
   * will be emailed. Defaults to all active routes.
   */
  onlyRouteIds?: string[];
}

export async function routePrequalToLenders(
  input: RouteToLendersInput,
): Promise<RouteToLendersResult> {
  // 1. Load + filter the dealer's routes.
  const allRoutes = await listLenderRoutes(input.dealerId);
  const activeRoutes = allRoutes.filter((r) => r.active);
  const targets = input.onlyRouteIds
    ? activeRoutes.filter((r) => input.onlyRouteIds!.includes(r.id))
    : activeRoutes;

  // 2. Build the packet ONCE -- same body to every lender.
  let packet: LenderPacket;
  try {
    packet = buildLenderPacket(input.packetInput);
  } catch (err) {
    // PII-redaction throw or builder bug -- DO NOT proceed.
    try {
      trackPrequal("prequal.lender_route_failed", input.dealerId, {
        prequal_id: input.prequalId,
        reason: "packet_build_failed",
        message: (err as Error).message,
      });
    } catch {
      /* ignore */
    }
    throw err;
  }

  try {
    trackPrequal("prequal.lender_packet_built", input.dealerId, {
      prequal_id: input.prequalId,
      target_count: targets.length,
      has_pdf: !!packet.pdfBuffer,
      is_mock_bureau: packet.summary.isMockBureau,
      is_mock_income: packet.summary.isMockIncome,
    });
  } catch {
    /* analytics never blocks */
  }

  // 3. Fire off one email per active route.
  const dispatches: DispatchResult[] = [];
  let anyResendMissing = false;
  for (const route of targets) {
    const send = await sendLenderEmail({
      to: route.contactEmail,
      subject: packet.subject,
      html: packet.html,
      text: packet.text,
      pdfBuffer: packet.pdfBuffer,
    });

    let status: "sent" | "queued" | "failed";
    let failureReason: string | undefined;
    if (send.ok) {
      status = "sent";
    } else if (send.reason === "resend_not_configured") {
      status = "queued";
      failureReason = "resend_not_configured";
      anyResendMissing = true;
    } else {
      status = "failed";
      failureReason = send.reason;
    }

    const dispatchId = await recordDispatch({
      prequalId: input.prequalId,
      dealerId: input.dealerId,
      lenderRouteId: route.id,
      packetFormat: packet.pdfBuffer ? "pdf" : "text",
      status,
      failureReason,
    });

    void auditLog(
      "prequal.lender_packet.dispatched",
      {
        dispatch_id: dispatchId,
        prequal_id: input.prequalId,
        lender_route_id: route.id,
        lender_name: route.lenderName,
        contact_email: route.contactEmail,
        status,
        failure_reason: failureReason ?? null,
      },
      undefined,
      input.dealerId,
    );

    try {
      if (status === "sent") {
        trackPrequal("prequal.lender_packet_emailed", input.dealerId, {
          prequal_id: input.prequalId,
          dispatch_id: dispatchId,
          lender_route_id: route.id,
          lender_name: route.lenderName,
        });
      } else if (status === "failed") {
        trackPrequal("prequal.lender_route_failed", input.dealerId, {
          prequal_id: input.prequalId,
          dispatch_id: dispatchId,
          reason: failureReason ?? "unknown",
        });
      }
    } catch {
      /* analytics never blocks */
    }

    fanout("prequal.lender_dispatched", input.dealerId, input.prequalId, {
      lender_route_id: route.id,
      lender_name: route.lenderName,
      status,
    });

    dispatches.push({
      dispatchId,
      lenderRouteId: route.id,
      lenderName: route.lenderName,
      contactEmail: route.contactEmail,
      status,
      failureReason,
    });
  }

  return {
    prequalId: input.prequalId,
    dispatches,
    packetSubject: packet.subject,
    packetTextFallback: anyResendMissing ? packet.text : undefined,
  };
}
