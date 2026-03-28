import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

const DEALER_ID = process.env.DEALER_ID ?? "default";

/* -------------------------------------------------------------------------- */
/* POST /api/admin/comms/send                                                  */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const { user } = authResult;

  let body: {
    channel: "email" | "sms";
    recipient: string;
    template_id?: string;
    subject?: string;
    body?: string;
    lead_id?: string;
    variables?: Record<string, string>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.channel || !body.recipient) {
    return NextResponse.json(
      { error: "channel and recipient are required" },
      { status: 400 },
    );
  }

  if (!["email", "sms"].includes(body.channel)) {
    return NextResponse.json({ error: "channel must be email or sms" }, { status: 400 });
  }

  if (!body.template_id && !body.body) {
    return NextResponse.json(
      { error: "Either template_id or body is required" },
      { status: 400 },
    );
  }

  const messageId = `msg-${Date.now()}`;
  const now = new Date().toISOString();

  // Attempt real send with external providers
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      // Resolve template if template_id is provided
      let messageBody = body.body ?? "";
      let messageSubject = body.subject ?? "";

      if (body.template_id) {
        const tplResult = await query(
          `SELECT subject, body FROM message_templates WHERE id = $1 AND dealer_id = $2`,
          [body.template_id, DEALER_ID],
        );
        const tpl = (tplResult.rows as { subject: string | null; body: string }[])[0];
        if (tpl) {
          messageBody = tpl.body;
          messageSubject = tpl.subject ?? "";
        }
      }

      // Apply variable substitution
      if (body.variables) {
        for (const [key, value] of Object.entries(body.variables)) {
          const placeholder = `{${key}}`;
          messageBody = messageBody.replaceAll(placeholder, value);
          messageSubject = messageSubject.replaceAll(placeholder, value);
        }
      }

      let externalId: string | null = null;
      let status = "sent";

      // Email via Resend
      if (body.channel === "email" && process.env.RESEND_API_KEY) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: process.env.RESEND_FROM_EMAIL ?? `noreply@${DEALER_ID}.wolfpackauto.com`,
              to: body.recipient,
              subject: messageSubject,
              text: messageBody,
            }),
          });
          const data = await res.json();
          externalId = data.id ?? null;
        } catch (sendErr) {
          console.error("[comms/send] Resend error:", sendErr);
          status = "failed";
        }
      }

      // SMS via Twilio
      if (body.channel === "sms" && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        try {
          const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
          const params = new URLSearchParams({
            From: process.env.TWILIO_FROM_NUMBER ?? "",
            To: body.recipient,
            Body: messageBody,
          });
          const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${auth}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: params.toString(),
            },
          );
          const data = await res.json();
          externalId = data.sid ?? null;
        } catch (sendErr) {
          console.error("[comms/send] Twilio error:", sendErr);
          status = "failed";
        }
      }

      // Log to DB
      await query(
        `INSERT INTO message_log (id, dealer_id, channel, recipient, subject, body, template_id, lead_id, status, external_id, sent_by, sent_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [messageId, DEALER_ID, body.channel, body.recipient, messageSubject, messageBody, body.template_id ?? null, body.lead_id ?? null, status, externalId, user.id, now],
      );

      return NextResponse.json({ success: true, id: messageId, status, external_id: externalId });
    } catch (err) {
      console.error("[api/admin/comms/send] DB error:", err);
    }
  }

  // Shadow mode — log and return success
  console.info(`[comms/send][shadow] ${body.channel} to ${body.recipient} from ${user.email} at ${now}`);
  return NextResponse.json({
    success: true,
    id: messageId,
    status: "sent",
    mode: "shadow",
    channel: body.channel,
    recipient: body.recipient,
    sent_at: now,
  });
}
