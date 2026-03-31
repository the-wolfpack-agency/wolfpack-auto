/**
 * Resend Webhook Handler — Email delivery/open/click/bounce tracking.
 *
 * Resend uses Svix for webhook delivery. Each event is mapped to an analytics
 * signal via trackSystem() so the learning system can correlate email
 * engagement with lead/deal outcomes.
 *
 * Signature verification uses the standard Svix headers:
 *   - svix-id
 *   - svix-timestamp
 *   - svix-signature
 *
 * If RESEND_WEBHOOK_SECRET is not set, all events are accepted (dev mode)
 * with a console warning.
 *
 * Always returns 200 immediately — Resend retries on non-2xx responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { trackSystem } from "@/lib/analytics-hooks";
import type { SystemEvent } from "@/lib/analytics-hooks";

/* ------------------------------------------------------------------ */
/*  Svix signature verification                                        */
/* ------------------------------------------------------------------ */

async function verifyWebhookSignature(
  req: NextRequest,
  body: string,
): Promise<boolean> {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.warn(
      "[resend-webhook] RESEND_WEBHOOK_SECRET not set — accepting all events (dev mode)",
    );
    return true;
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.error("[resend-webhook] Missing svix headers");
    return false;
  }

  // Verify timestamp is within 5 minutes to prevent replay attacks
  const timestampSec = parseInt(svixTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampSec) > 300) {
    console.error("[resend-webhook] Timestamp too old or too far in the future");
    return false;
  }

  // Compute expected signature: base64(hmac-sha256(secret, "msg_id.timestamp.body"))
  try {
    // Svix secret is base64-encoded with a "whsec_" prefix
    const secretBytes = Uint8Array.from(
      atob(secret.startsWith("whsec_") ? secret.slice(6) : secret),
      (c) => c.charCodeAt(0),
    );

    const signedContent = `${svixId}.${svixTimestamp}.${body}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedContent),
    );

    const expectedSig =
      "v1," +
      btoa(String.fromCharCode(...new Uint8Array(signature)));

    // Svix sends multiple signatures separated by spaces — any match is valid
    const signatures = svixSignature.split(" ");
    return signatures.some((sig) => sig === expectedSig);
  } catch (err) {
    console.error("[resend-webhook] Signature verification error:", err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Event type mapping                                                  */
/* ------------------------------------------------------------------ */

const RESEND_EVENT_MAP: Record<string, SystemEvent> = {
  "email.delivered": "system.email_delivered",
  "email.opened": "system.email_opened",
  "email.clicked": "system.email_clicked",
  "email.bounced": "system.email_bounced",
  "email.complained": "system.email_complained",
};

/* ------------------------------------------------------------------ */
/*  POST handler                                                       */
/* ------------------------------------------------------------------ */

interface ResendWebhookPayload {
  type: string;
  data: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    click?: {
      link?: string;
    };
    [key: string]: unknown;
  };
  created_at?: string;
}

export async function POST(req: NextRequest) {
  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Verify signature
  const valid = await verifyWebhookSignature(req, body);
  if (!valid) {
    // Return 200 anyway to prevent Resend retries on auth config issues,
    // but log the failure for debugging
    console.error("[resend-webhook] Invalid signature — event dropped");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Parse payload
  let payload: ResendWebhookPayload;
  try {
    payload = JSON.parse(body) as ResendWebhookPayload;
  } catch {
    console.error("[resend-webhook] Invalid JSON payload");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const eventType = RESEND_EVENT_MAP[payload.type];
  if (!eventType) {
    // Unknown event type — log and acknowledge
    console.warn(`[resend-webhook] Unknown event type: ${payload.type}`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Extract metadata
  const data = payload.data ?? {};
  const recipient = Array.isArray(data.to) ? data.to[0] ?? "" : "";

  const metadata: Record<string, string | number | boolean> = {
    email_id: String(data.email_id ?? ""),
    recipient,
    subject: String(data.subject ?? ""),
    source: "resend_webhook",
  };

  // Add link_clicked for click events
  if (payload.type === "email.clicked" && data.click?.link) {
    metadata.link_clicked = data.click.link;
  }

  // Add bounce/complaint flag for those event types
  if (payload.type === "email.bounced") {
    metadata.is_bounce = true;
  }
  if (payload.type === "email.complained") {
    metadata.is_complaint = true;
  }

  // Fire analytics — uses "server" as dealer_id; the learning system
  // correlates via email_id to the originating dealer context
  trackSystem(eventType, "server", metadata);

  // Also persist directly to analytics_events for the DB-backed learning path
  try {
    if (process.env.DATABASE_URL) {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO analytics_events (event_type, action, page, session_id, user_fingerprint, metadata, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          "system",
          eventType,
          "webhook/resend",
          "server",
          "server",
          JSON.stringify(metadata),
        ],
      );
    }
  } catch (err) {
    console.error("[resend-webhook] Failed to persist event:", err);
    // Never throw — webhook must always return 200
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
