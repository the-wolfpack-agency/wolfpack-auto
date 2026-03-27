import { Resend } from "resend";
import type { Dealer } from "@/types/dealer";
import type { Lead } from "@/types/lead";
import {
  dealerLeadNotificationHTML,
  customerConfirmationHTML,
} from "@/lib/email-templates";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "Wolfpack Motors <leads@wolfpackauto.com>";

/**
 * Lazily-initialised Resend client. Null when API key is absent so the
 * module can be imported safely in all environments (CI, local dev, tests).
 */
const resendClient: Resend | null = RESEND_API_KEY
  ? new Resend(RESEND_API_KEY)
  : null;

// ---------------------------------------------------------------------------
// Core send function
// ---------------------------------------------------------------------------

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

async function sendEmail(params: SendEmailParams): Promise<void> {
  if (!resendClient) {
    console.log(
      `[email] No RESEND_API_KEY — logging email instead:\n` +
        `  To: ${params.to}\n` +
        `  Subject: ${params.subject}\n` +
        `  ReplyTo: ${params.replyTo ?? "(none)"}\n` +
        `  Body length: ${params.html.length} chars`,
    );
    return;
  }

  const { error } = await resendClient.emails.send({
    from: RESEND_FROM_EMAIL,
    to: [params.to],
    subject: params.subject,
    html: params.html,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
  });

  if (error) {
    console.error(`[email] Resend SDK error:`, error);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send an HTML notification to the dealer when a new lead arrives.
 *
 * This should be called fire-and-forget (don't await in the request path).
 */
export async function sendLeadNotification(
  dealer: Dealer,
  lead: Lead,
): Promise<void> {
  try {
    const vehicleLabel = lead.vehicle_interest || "General Inquiry";
    const subject = `New Lead: ${lead.first_name} ${lead.last_name} — ${vehicleLabel}`;

    await sendEmail({
      to: dealer.email,
      subject,
      html: dealerLeadNotificationHTML(dealer, lead),
      replyTo: lead.email,
    });
  } catch (err) {
    console.error("[email] Failed to send dealer notification:", err);
  }
}

/**
 * Send a confirmation email to the customer who submitted the lead.
 *
 * This should be called fire-and-forget (don't await in the request path).
 */
export async function sendLeadConfirmation(
  dealer: Dealer,
  lead: Lead,
): Promise<void> {
  try {
    await sendEmail({
      to: lead.email,
      subject: "Thanks for contacting Wolfpack Motors!",
      html: customerConfirmationHTML(dealer, lead),
      replyTo: dealer.email,
    });
  } catch (err) {
    console.error("[email] Failed to send customer confirmation:", err);
  }
}
