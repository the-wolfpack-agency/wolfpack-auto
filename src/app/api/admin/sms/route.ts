import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import {
  getDemoConversations,
  getDemoMessages,
  sendSMS,
  getTwilioConfig,
} from "@/lib/sms";

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/sms — Conversation list                                     */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const leadId = request.nextUrl.searchParams.get("lead_id");

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    const config = getTwilioConfig();
    if (leadId) {
      return NextResponse.json({
        messages: getDemoMessages(leadId),
        config,
      });
    }
    return NextResponse.json({
      conversations: getDemoConversations(),
      config,
    });
  }

  // --- Live mode ---
  const dealerId = getDealerId(authResult);
  try {
    const { query } = await import("@/lib/db");
    const config = getTwilioConfig();

    if (leadId) {
      const messages = await query(
        `SELECT * FROM sms_messages WHERE lead_id = $1 AND dealer_id = $2 ORDER BY created_at ASC`,
        [leadId, dealerId],
      );
      return NextResponse.json({ messages: messages.rows, config });
    }

    const conversations = await query(
      `SELECT
         m.lead_id,
         l.first_name || ' ' || l.last_name AS lead_name,
         m.phone,
         m.last_message,
         m.last_message_at,
         m.message_count,
         COALESCE(m.unread, 0) AS unread
       FROM (
         SELECT
           lead_id,
           MAX(CASE WHEN direction = 'inbound' THEN "from" ELSE "to" END) AS phone,
           MAX(body) FILTER (WHERE created_at = sub.max_at) AS last_message,
           MAX(created_at) AS last_message_at,
           COUNT(*) AS message_count,
           COUNT(*) FILTER (WHERE direction = 'inbound' AND read_at IS NULL) AS unread
         FROM sms_messages,
         LATERAL (SELECT MAX(created_at) AS max_at FROM sms_messages sm2 WHERE sm2.lead_id = sms_messages.lead_id) sub
         WHERE dealer_id = $1 AND lead_id IS NOT NULL
         GROUP BY lead_id
       ) m
       LEFT JOIN leads l ON l.id = m.lead_id
       ORDER BY m.last_message_at DESC`,
      [dealerId],
    );

    return NextResponse.json({ conversations: conversations.rows, config });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      const config = getTwilioConfig();
      return NextResponse.json({ conversations: getDemoConversations(), config });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*  POST /api/admin/sms — Send an SMS                                          */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const dealerId = getDealerId(authResult);
  const body = await request.json();
  const { to, message, lead_id } = body;

  if (!to || !message) {
    return NextResponse.json(
      { error: "to and message are required" },
      { status: 400 },
    );
  }

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    const config = getTwilioConfig();
    if (!config.configured) {
      return NextResponse.json({
        sent: false,
        error: "Twilio not configured",
        mode: "shadow",
      });
    }
  }

  const result = await sendSMS(to, message, dealerId);

  // Persist if DB available
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `INSERT INTO sms_messages (id, lead_id, dealer_id, direction, "from", "to", body, status, twilio_sid, created_at)
         VALUES ($1, $2, $3, 'outbound', $4, $5, $6, $7, $8, NOW())`,
        [
          result.message_id,
          lead_id ?? null,
          dealerId,
          process.env.TWILIO_PHONE_NUMBER ?? "",
          to,
          message,
          result.success ? "sent" : "failed",
          result.twilio_sid,
        ],
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!msg.includes("does not exist")) {
        console.error("[sms] POST persist error:", err);
      }
      // Non-fatal — SMS was still sent, just not persisted
    }
  }

  return NextResponse.json(result);
}
