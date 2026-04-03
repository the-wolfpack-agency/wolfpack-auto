/**
 * Omnichannel Online-to-Store Continuity
 *
 * Enables seamless handoff between online browsing, in-store visits,
 * phone calls, email, and SMS interactions. Customers can start online
 * and have their session picked up on a dealership tablet via QR code.
 */

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
/*  In-memory stores (shadow mode)                                     */
/* ------------------------------------------------------------------ */

const sessions = new Map<string, CustomerSession>();
const touchpoints = new Map<string, Touchpoint[]>();
const handoffs = new Map<string, HandoffData>();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateToken(): string {
  return Array.from({ length: 32 }, () =>
    Math.random().toString(36).charAt(2),
  ).join("");
}

/* ------------------------------------------------------------------ */
/*  Core functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Record a customer touchpoint on any channel.
 */
export function recordTouchpoint(
  customerId: string,
  channel: TouchpointType,
  summary: string,
  metadata: Record<string, string | number | boolean> = {},
): Touchpoint {
  const tp: Touchpoint = {
    id: generateId(),
    channel,
    timestamp: new Date().toISOString(),
    summary,
    metadata,
  };
  const existing = touchpoints.get(customerId) ?? [];
  existing.push(tp);
  touchpoints.set(customerId, existing);
  return tp;
}

/**
 * Create a handoff token so in-store staff can pick up where the
 * customer left off online.
 */
export function createHandoff(
  customerId: string,
  fromChannel: TouchpointType,
  toChannel: TouchpointType,
  dealerId: string,
): HandoffData {
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

  // Record the handoff as a touchpoint
  recordTouchpoint(customerId, fromChannel, `Handoff created: ${fromChannel} -> ${toChannel}`, {
    handoff_id: handoffId,
    to_channel: toChannel,
  });

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
export function getOmnichannelTimeline(customerId: string): Touchpoint[] {
  const tps = touchpoints.get(customerId) ?? [];
  return [...tps].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

/**
 * Build a full omnichannel profile for a customer.
 */
export function getOmnichannelProfile(
  customerId: string,
  dealerId: string,
): OmnichannelProfile {
  const timeline = getOmnichannelTimeline(customerId);
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
export function mergeOnlineAndStoreActivity(
  customerId: string,
): { online: Touchpoint[]; inStore: Touchpoint[]; merged: Touchpoint[] } {
  const timeline = getOmnichannelTimeline(customerId);
  return {
    online: timeline.filter((t) => t.channel === "online"),
    inStore: timeline.filter((t) => t.channel === "in_store"),
    merged: timeline,
  };
}

/**
 * Look up a handoff by ID.
 */
export function getHandoff(handoffId: string): HandoffData | null {
  return handoffs.get(handoffId) ?? null;
}

/**
 * Mark a handoff as scanned / redeemed.
 */
export function scanHandoff(handoffId: string, token: string): HandoffData | null {
  const handoff = handoffs.get(handoffId);
  if (!handoff || handoff.token !== token) return null;
  if (new Date(handoff.expiresAt) < new Date()) return null;
  handoff.scanned = true;
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
