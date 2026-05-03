/**
 * Omnichannel Online-to-Store Continuity
 *
 * Enables seamless handoff between online browsing, in-store visits,
 * phone calls, email, and SMS interactions. Customers can start online
 * and have their session picked up on a dealership tablet via QR code.
 *
 * Persists touchpoints to PostgreSQL (customer_touchpoints from migration 052).
 * Sessions and handoffs stay in-memory (ephemeral real-time state).
 * Falls back entirely to in-memory when DATABASE_URL is not set (shadow mode).
 */

import { query } from "@/lib/db";
import { randomBytes, randomUUID } from "node:crypto";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type TouchpointType = "online" | "in_store" | "phone" | "email" | "sms";

export interface Touchpoint {
  id: string;
  channel: TouchpointType;
  timestamp: string;
  summary: string;
  metadata: Record<string, string | number | boolean>;
}

export interface CustomerSession {
  sessionId: string;
  customerId: string;
  dealerId: string;
  channel: TouchpointType;
  startedAt: string;
  lastActivityAt: string;
  vehiclesViewed: string[];
  pagesVisited: string[];
  formData: Record<string, string>;
}

export interface OmnichannelProfile {
  customerId: string;
  dealerId: string;
  touchpoints: Touchpoint[];
  channels: TouchpointType[];
  firstContact: string;
  lastContact: string;
  totalInteractions: number;
  preferredChannel: TouchpointType;
}

export interface HandoffData {
  handoffId: string;
  customerId: string;
  fromChannel: TouchpointType;
  toChannel: TouchpointType;
  sessionSnapshot: CustomerSession;
  token: string;
  qrUrl: string;
  createdAt: string;
  expiresAt: string;
  scanned: boolean;
}

/* ------------------------------------------------------------------ */
/*  In-memory stores (shadow mode + ephemeral state)                   */
/* ------------------------------------------------------------------ */

const sessions = new Map<string, CustomerSession>();
const touchpoints = new Map<string, Touchpoint[]>();
const handoffs = new Map<string, HandoffData>();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function generateId(): string {
  // Crypto-strong randomness — handoff IDs are referenced by URL/QR.
  return `${Date.now()}-${randomUUID()}`;
}

function generateToken(): string {
  // 32 hex chars = 128 bits, generated via CSPRNG (closes js/insecure-randomness).
  return randomBytes(16).toString("hex");
}

function useDb(): boolean {
  return !!process.env.DATABASE_URL;
}

function rowToTouchpoint(row: Record<string, unknown>): Touchpoint {
  return {
    id: row.id as string,
    channel: row.channel as TouchpointType,
    timestamp: typeof row.timestamp === "string" ? row.timestamp : (row.timestamp as Date).toISOString(),
    summary: row.summary as string,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata as Record<string, string | number | boolean>) ?? {},
  };
}

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Record a customer touchpoint on any channel.
 */
export async function recordTouchpoint(
  customerId: string,
  channel: TouchpointType,
  summary: string,
  metadata: Record<string, string | number | boolean> = {},
  dealerId: string = "",
): Promise<Touchpoint> {
  const tp: Touchpoint = {
    id: generateId(),
    channel,
    timestamp: new Date().toISOString(),
    summary,
    metadata,
  };

  if (useDb()) {
    try {
      await query(
        `INSERT INTO customer_touchpoints (id, dealer_id, customer_id, channel, timestamp, summary, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tp.id, dealerId, customerId, tp.channel, tp.timestamp, tp.summary, JSON.stringify(tp.metadata)],
      );
      // Also keep in-memory for real-time access during the session
      const existing = touchpoints.get(customerId) ?? [];
      existing.push(tp);
      touchpoints.set(customerId, existing);
      return tp;
    } catch (err: unknown) {
      console.warn("[omnichannel] DB write failed, using in-memory:", (err as Error).message);
    }
  }

  const existing = touchpoints.get(customerId) ?? [];
  existing.push(tp);
  touchpoints.set(customerId, existing);
  return tp;
}

/**
 * Create a handoff token so in-store staff can pick up where the
 * customer left off online.
 */
export async function createHandoff(
  customerId: string,
  fromChannel: TouchpointType,
  toChannel: TouchpointType,
  dealerId: string,
): Promise<HandoffData> {
  const session: CustomerSession = sessions.get(customerId) ?? {
    sessionId: generateId(),
    customerId,
    dealerId,
    channel: fromChannel,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    vehiclesViewed: [],
    pagesVisited: [],
    formData: {},
  };

  const token = generateToken();
  const handoffId = generateId();
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h

  const handoff: HandoffData = {
    handoffId,
    customerId,
    fromChannel,
    toChannel,
    sessionSnapshot: session,
    token,
    qrUrl: generateQRHandoff(handoffId, token),
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    scanned: false,
  };

  handoffs.set(handoffId, handoff);

  // Persist the handoff as a touchpoint in DB
  if (useDb()) {
    try {
      await query(
        `INSERT INTO customer_touchpoints (id, dealer_id, customer_id, channel, timestamp, summary, metadata, handoff_token, qr_code_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          handoffId,
          dealerId,
          customerId,
          fromChannel,
          now.toISOString(),
          `Handoff created: ${fromChannel} -> ${toChannel}`,
          JSON.stringify({ handoff_id: handoffId, to_channel: toChannel }),
          token,
          handoff.qrUrl,
        ],
      );
    } catch (err: unknown) {
      console.warn("[omnichannel] DB handoff write failed:", (err as Error).message);
    }
  }

  // Record the handoff as a touchpoint (in-memory path)
  const tpList = touchpoints.get(customerId) ?? [];
  tpList.push({
    id: handoffId,
    channel: fromChannel,
    timestamp: now.toISOString(),
    summary: `Handoff created: ${fromChannel} -> ${toChannel}`,
    metadata: { handoff_id: handoffId, to_channel: toChannel },
  });
  touchpoints.set(customerId, tpList);

  return handoff;
}

/**
 * Generate a QR code URL that loads the customer's session on a
 * dealership tablet.
 */
export function generateQRHandoff(sessionId: string, token?: string): string {
  const t = token ?? generateToken();
  return `/handoff/${sessionId}?token=${t}`;
}

/**
 * Get unified timeline of ALL touchpoints across channels.
 */
export async function getOmnichannelTimeline(customerId: string): Promise<Touchpoint[]> {
  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM customer_touchpoints WHERE customer_id = $1 ORDER BY timestamp ASC`,
        [customerId],
      );
      if (result.rows.length > 0) {
        return result.rows.map(rowToTouchpoint);
      }
    } catch (err: unknown) {
      console.warn("[omnichannel] DB read failed, using in-memory:", (err as Error).message);
    }
  }

  const tps = touchpoints.get(customerId) ?? [];
  return [...tps].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

/**
 * Build a full omnichannel profile for a customer.
 */
export async function getOmnichannelProfile(
  customerId: string,
  dealerId: string,
): Promise<OmnichannelProfile> {
  const timeline = await getOmnichannelTimeline(customerId);
  const channels = [...new Set(timeline.map((t) => t.channel))];

  // Determine preferred channel by frequency
  const channelCounts: Record<string, number> = {};
  for (const tp of timeline) {
    channelCounts[tp.channel] = (channelCounts[tp.channel] ?? 0) + 1;
  }
  const preferredChannel = (Object.entries(channelCounts).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0] ?? "online") as TouchpointType;

  return {
    customerId,
    dealerId,
    touchpoints: timeline,
    channels,
    firstContact: timeline[0]?.timestamp ?? new Date().toISOString(),
    lastContact: timeline[timeline.length - 1]?.timestamp ?? new Date().toISOString(),
    totalInteractions: timeline.length,
    preferredChannel,
  };
}

/**
 * Merge online browsing data with in-store interactions into a
 * unified customer view.
 */
export async function mergeOnlineAndStoreActivity(
  customerId: string,
): Promise<{ online: Touchpoint[]; inStore: Touchpoint[]; merged: Touchpoint[] }> {
  const timeline = await getOmnichannelTimeline(customerId);
  return {
    online: timeline.filter((t) => t.channel === "online"),
    inStore: timeline.filter((t) => t.channel === "in_store"),
    merged: timeline,
  };
}

/**
 * Look up a handoff by ID.
 */
export async function getHandoff(handoffId: string): Promise<HandoffData | null> {
  // Handoffs are ephemeral — always check in-memory first
  const memHandoff = handoffs.get(handoffId);
  if (memHandoff) return memHandoff;

  if (useDb()) {
    try {
      const result = await query(
        `SELECT * FROM customer_touchpoints WHERE id = $1 AND handoff_token IS NOT NULL`,
        [handoffId],
      );
      if (result.rows.length > 0) {
        const row = result.rows[0];
        const metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata as string) : (row.metadata as Record<string, unknown>);
        // Reconstruct minimal handoff data from touchpoint
        return {
          handoffId: row.id as string,
          customerId: row.customer_id as string,
          fromChannel: row.channel as TouchpointType,
          toChannel: (metadata?.to_channel as TouchpointType) ?? "in_store",
          sessionSnapshot: {
            sessionId: handoffId,
            customerId: row.customer_id as string,
            dealerId: row.dealer_id as string,
            channel: row.channel as TouchpointType,
            startedAt: typeof row.timestamp === "string" ? row.timestamp : (row.timestamp as Date).toISOString(),
            lastActivityAt: typeof row.timestamp === "string" ? row.timestamp : (row.timestamp as Date).toISOString(),
            vehiclesViewed: [],
            pagesVisited: [],
            formData: {},
          },
          token: row.handoff_token as string,
          qrUrl: row.qr_code_url as string,
          createdAt: typeof row.timestamp === "string" ? row.timestamp : (row.timestamp as Date).toISOString(),
          expiresAt: new Date(new Date(typeof row.timestamp === "string" ? row.timestamp : (row.timestamp as Date).toISOString()).getTime() + 24 * 60 * 60 * 1000).toISOString(),
          scanned: false,
        };
      }
    } catch (err: unknown) {
      console.warn("[omnichannel] DB handoff read failed:", (err as Error).message);
    }
  }

  return null;
}

/**
 * Mark a handoff as scanned / redeemed.
 */
export async function scanHandoff(handoffId: string, token: string): Promise<HandoffData | null> {
  const handoff = await getHandoff(handoffId);
  if (!handoff || handoff.token !== token) return null;
  if (new Date(handoff.expiresAt) < new Date()) return null;
  handoff.scanned = true;

  // Update in-memory if present
  const memHandoff = handoffs.get(handoffId);
  if (memHandoff) memHandoff.scanned = true;

  return handoff;
}

/**
 * Store / update a customer session.
 */
export function upsertSession(session: CustomerSession): void {
  sessions.set(session.customerId, session);
}

/**
 * Clear all in-memory data (for testing).
 */
export function _resetForTesting(): void {
  sessions.clear();
  touchpoints.clear();
  handoffs.clear();
}
