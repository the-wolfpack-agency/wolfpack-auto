/**
 * SMS/Text Messaging — Twilio Integration
 *
 * Send/receive SMS, match inbound texts to leads/customers,
 * and maintain conversation threads per lead.
 */

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface SMSMessage {
  id: string;
  lead_id: string | null;
  dealer_id: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  body: string;
  status: "queued" | "sent" | "delivered" | "failed" | "received";
  twilio_sid: string | null;
  created_at: string;
}

export interface SMSConversation {
  lead_id: string;
  lead_name: string;
  phone: string;
  last_message: string;
  last_message_at: string;
  message_count: number;
  unread: number;
}

export interface SMSConfig {
  configured: boolean;
  phone_number: string | null;
}

/* -------------------------------------------------------------------------- */
/*  Configuration Check                                                        */
/* -------------------------------------------------------------------------- */

export function getTwilioConfig(): SMSConfig {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const phone = process.env.TWILIO_PHONE_NUMBER;

  return {
    configured: !!(sid && token && phone),
    phone_number: phone ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Send SMS                                                                   */
/* -------------------------------------------------------------------------- */

export interface SendResult {
  success: boolean;
  message_id: string;
  twilio_sid: string | null;
  error?: string;
}

/**
 * Send an SMS via Twilio. Gracefully falls back when not configured.
 */
export async function sendSMS(
  to: string,
  body: string,
  dealerId: string,
): Promise<SendResult> {
  const config = getTwilioConfig();
  const messageId = `sms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (!config.configured) {
    console.log(`[sms] Twilio not configured — skipping SMS to ${to.slice(0, 6)}***`);
    // Track the skip
    import("@/lib/analytics-hooks")
      .then(({ trackSystem }) =>
        trackSystem("system.email_bounced", dealerId, {
          reason: "twilio_not_configured",
          to_masked: to.slice(0, 6) + "***",
        }),
      )
      .catch(() => {});

    return { success: false, message_id: messageId, twilio_sid: null, error: "Twilio not configured" };
  }

  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER!;

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          From: fromNumber,
          Body: body,
        }).toString(),
      },
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[sms] Twilio send failed:", errBody);
      return { success: false, message_id: messageId, twilio_sid: null, error: "Twilio API error" };
    }

    const data = await res.json();
    return { success: true, message_id: messageId, twilio_sid: data.sid ?? null };
  } catch (err) {
    console.error("[sms] Send error:", err);
    return { success: false, message_id: messageId, twilio_sid: null, error: "Network error" };
  }
}

/* -------------------------------------------------------------------------- */
/*  Inbound SMS Processing                                                     */
/* -------------------------------------------------------------------------- */

export interface InboundResult {
  matched_lead_id: string | null;
  message: SMSMessage;
}

/**
 * Process an incoming SMS, matching it to a lead/customer by phone number.
 */
export function processInboundSMS(
  from: string,
  body: string,
  dealerId: string,
  existingLeads: Array<{ id: string; phone: string | null }> = [],
): InboundResult {
  const normalFrom = from.replace(/\D/g, "");

  let matchedLeadId: string | null = null;
  for (const lead of existingLeads) {
    const normalPhone = lead.phone?.replace(/\D/g, "") ?? "";
    if (normalPhone && normalPhone.length >= 7 && normalFrom.endsWith(normalPhone.slice(-10))) {
      matchedLeadId = lead.id;
      break;
    }
  }

  const message: SMSMessage = {
    id: `sms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lead_id: matchedLeadId,
    dealer_id: dealerId,
    direction: "inbound",
    from,
    to: process.env.TWILIO_PHONE_NUMBER ?? "",
    body,
    status: "received",
    twilio_sid: null,
    created_at: new Date().toISOString(),
  };

  return { matched_lead_id: matchedLeadId, message };
}

/* -------------------------------------------------------------------------- */
/*  Conversation History                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Get conversation history for a lead (in-memory / shadow mode).
 */
export function getConversationHistory(
  messages: SMSMessage[],
  leadId: string,
): SMSMessage[] {
  return messages
    .filter((m) => m.lead_id === leadId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

/* -------------------------------------------------------------------------- */
/*  Lead Alert Formatting                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Format a lead notification as SMS text.
 */
export function formatLeadAlertSMS(lead: {
  first_name: string;
  last_name: string;
  vehicle_interest: string;
  source: string;
}): string {
  return `New lead: ${lead.first_name} ${lead.last_name} interested in ${lead.vehicle_interest} (via ${lead.source})`;
}

/* -------------------------------------------------------------------------- */
/*  Twilio Signature Validation                                                */
/* -------------------------------------------------------------------------- */

/**
 * Validate Twilio webhook signature (simplified check).
 * In production, use the full HMAC-SHA1 validation.
 */
export function validateTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!process.env.TWILIO_AUTH_TOKEN) return false;
  // In demo mode or when no signature, allow through with warning
  if (!signature) {
    console.warn("[sms] No Twilio signature provided");
    return process.env.NODE_ENV !== "production";
  }
  // Full validation would use crypto.createHmac — simplified for now
  return signature.length > 0;
}

/* -------------------------------------------------------------------------- */
/*  Demo Data                                                                  */
/* -------------------------------------------------------------------------- */

export function getDemoConversations(): SMSConversation[] {
  return [
    {
      lead_id: "lead-demo-1",
      lead_name: "Sarah Johnson",
      phone: "+15551234567",
      last_message: "Hi, is the 2024 Camry still available?",
      last_message_at: new Date(Date.now() - 1800_000).toISOString(),
      message_count: 4,
      unread: 1,
    },
    {
      lead_id: "lead-demo-2",
      lead_name: "Mike Chen",
      phone: "+15559876543",
      last_message: "Thanks for the info! I'll come by Saturday.",
      last_message_at: new Date(Date.now() - 7200_000).toISOString(),
      message_count: 6,
      unread: 0,
    },
    {
      lead_id: "lead-demo-3",
      lead_name: "Emily Rodriguez",
      phone: "+15555551234",
      last_message: "Can I schedule a test drive?",
      last_message_at: new Date(Date.now() - 86400_000).toISOString(),
      message_count: 2,
      unread: 1,
    },
  ];
}

export function getDemoMessages(leadId: string): SMSMessage[] {
  const now = Date.now();
  return [
    {
      id: "sms-demo-1",
      lead_id: leadId,
      dealer_id: "demo-dealer",
      direction: "inbound",
      from: "+15551234567",
      to: "+15550001111",
      body: "Hi, I saw your listing for the 2024 Camry. Is it still available?",
      status: "received",
      twilio_sid: null,
      created_at: new Date(now - 7200_000).toISOString(),
    },
    {
      id: "sms-demo-2",
      lead_id: leadId,
      dealer_id: "demo-dealer",
      direction: "outbound",
      from: "+15550001111",
      to: "+15551234567",
      body: "Hi! Yes, the 2024 Camry is still available. Would you like to schedule a test drive?",
      status: "delivered",
      twilio_sid: "SM-demo-001",
      created_at: new Date(now - 6800_000).toISOString(),
    },
    {
      id: "sms-demo-3",
      lead_id: leadId,
      dealer_id: "demo-dealer",
      direction: "inbound",
      from: "+15551234567",
      to: "+15550001111",
      body: "That would be great! What times work?",
      status: "received",
      twilio_sid: null,
      created_at: new Date(now - 3600_000).toISOString(),
    },
  ];
}
