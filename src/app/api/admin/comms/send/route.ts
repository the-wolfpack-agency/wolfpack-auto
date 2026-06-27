import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackComms, trackSecurity } from "@/lib/analytics-hooks";
import { getDealerId } from "@/lib/get-dealer-id";
import { checkIdempotency, recordIdempotency, idempotencyKey } from "@/lib/idempotency";
import { sanitizeForLog } from "@/lib/log-sanitize";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/* POST /api/admin/comms/send                                                  */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);
  const { user } = authResult;

  const rl = await checkRateLimit(`comms-send:${authResult.user.dealer_id}`, 30, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", authResult.user.dealer_id, { route: "comms-send", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

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

  // Idempotency — prevent duplicate message sends from retries
  const iKey = idempotencyKey("/api/admin/comms/send", body);
  const cached = checkIdempotency(iKey);
  if (cached) return NextResponse.json(cached);

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
          [body.template_id, dealerId],
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
          const data = await fetchJson<{ id?: string }>("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: process.env.RESEND_FROM_EMAIL ?? `noreply@${dealerId}.wolfpackauto.com`,
              to: body.recipient,
              subject: messageSubject,
              text: messageBody,
            }),
          });
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
          const data = await fetchJson<{ sid?: string }>(
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
        [messageId, dealerId, body.channel, body.recipient, messageSubject, messageBody, body.template_id ?? null, body.lead_id ?? null, status, externalId, user.id, now],
      );

      try { trackComms("comms.message_sent", dealerId, { channel: body.channel, template_id: body.template_id ?? "custom" }); } catch {}

      const resp = { success: true, id: messageId, status, external_id: externalId };
      recordIdempotency(iKey, resp);
      return NextResponse.json(resp);
    } catch (err) {
      console.error("[api/admin/comms/send] DB error:", err);
    }
  }

  try { trackComms("comms.message_sent", dealerId, { channel: body.channel, template_id: body.template_id ?? "custom" }); } catch {}

  // Shadow mode — log and return success
  console.info(`[comms/send][shadow] ${sanitizeForLog(body.channel)} to ${sanitizeForLog(body.recipient)} from ${sanitizeForLog(user.email)} at ${now}`);
  const resp = {
    success: true,
    id: messageId,
    status: "sent",
    mode: "shadow",
    channel: body.channel,
    recipient: body.recipient,
    sent_at: now,
  };
  recordIdempotency(iKey, resp);
  return NextResponse.json(resp);
}
