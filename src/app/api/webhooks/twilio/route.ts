import { NextRequest, NextResponse } from "next/server";
import { processInboundSMS, validateTwilioSignature } from "@/lib/sms";
import { trackSystem } from "@/lib/analytics-hooks";

/**
 * POST /api/webhooks/twilio — Public webhook for Twilio inbound SMS.
 *
 * No session auth — uses Twilio signature validation instead.
 */

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const from = formData.get("From")?.toString() ?? "";
  const body = formData.get("Body")?.toString() ?? "";
  const signature = request.headers.get("x-twilio-signature");

  // Validate Twilio signature
  const url = request.nextUrl.toString();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = value.toString();
  });

  if (!validateTwilioSignature(signature, url, params)) {
    try {
      trackSystem("system.webhook_signature_failed", "system", {
        source: "twilio",
        event_type: "sms_inbound",
        quantum_safe: false,
      });
    } catch { /* analytics must never block */ }
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }
  try {
    trackSystem("system.webhook_signature_verified", "system", {
      source: "twilio",
      event_type: "sms_inbound",
      quantum_safe: false,
    });
  } catch { /* analytics must never block */ }

  if (!from || !body) {
    return NextResponse.json({ error: "Missing From or Body" }, { status: 400 });
  }

  const dealerId = process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

  // Fetch existing leads for phone matching
  let existingLeads: Array<{ id: string; phone: string | null }> = [];
  if (process.env.DATABASE_URL) {
    const { query } = await import("@/lib/db");
    const rows = await query(
      `SELECT id, phone FROM leads WHERE dealer_id = $1 AND phone IS NOT NULL`,
      [dealerId],
    );
    existingLeads = rows.rows as Array<{ id: string; phone: string | null }>;
  }

  const result = processInboundSMS(from, body, dealerId, existingLeads);

  // Persist message
  if (process.env.DATABASE_URL) {
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO sms_messages (id, lead_id, dealer_id, direction, "from", "to", body, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        result.message.id,
        result.matched_lead_id,
        dealerId,
        "inbound",
        from,
        result.message.to,
        body,
        "received",
      ],
    );
  }

  // Track analytics (fire-and-forget)
  import("@/lib/analytics-hooks")
    .then(({ trackSystem }) =>
      trackSystem("system.email_delivered", dealerId, {
        type: "sms_inbound",
        matched_lead: result.matched_lead_id ? "true" : "false",
      }),
    )
    .catch(() => {});

  // Twilio expects TwiML response
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    },
  );
}
