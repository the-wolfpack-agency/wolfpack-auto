import { Resend } from "resend";
import type { Dealer } from "@/types/dealer";
import type { Lead } from "@/types/lead";
import {
  dealerLeadNotificationHTML,
  customerConfirmationHTML,
} from "@/lib/email-templates";
import { trackSystem } from "@/lib/analytics-hooks";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";

/**
 * Generic platform-level fallback FROM. Used only when neither the
 * dealer record nor RESEND_FROM_EMAIL is set.
 */
const GENERIC_PLATFORM_FROM = "Wolfpack Auto <noreply@wolfpackauto.com>";

/**
 * Env-level FROM — second-to-last in the fallback chain.
 *
 * Read dynamically (rather than captured at module load) so tests + cold
 * deployments that set RESEND_FROM_EMAIL after import still pick it up.
 */
function envFrom(): string {
  return process.env.RESEND_FROM_EMAIL ?? "";
}

/**
 * Lazily-initialised Resend client. Null when API key is absent so the
 * module can be imported safely in all environments (CI, local dev, tests).
 */
const resendClient: Resend | null = RESEND_API_KEY
  ? new Resend(RESEND_API_KEY)
  : null;

// ---------------------------------------------------------------------------
// Per-dealer sender resolution
// ---------------------------------------------------------------------------

/**
 * Look up the dealer's preferred outbound FROM string.
 * Resolution order:
 *   1. dealers.from_email (explicit per-dealer branded sender).
 *   2. dealers.email      (reuse the dealer's reply address if set).
 *   3. RESEND_FROM_EMAIL  (platform env default).
 *   4. GENERIC_PLATFORM_FROM (generic, never mentions the seed dealer).
 *
 * Emits a typed `system.email_sender_fallback` event the first three times
 * a dealer falls back, so operations can see which dealers still need
 * branded sender configured.
 *
 * Safe in shadow mode (no DATABASE_URL): returns the env / generic
 * fallback without touching the DB.
 */
export async function resolveDealerFromEmail(
  dealerId: string | null | undefined,
): Promise<string> {
  // No dealer context — straight to env / generic fallback.
  if (!dealerId) {
    return envFrom() || GENERIC_PLATFORM_FROM;
  }

  // Shadow mode — can't read the DB; fall through to env / generic.
  if (!process.env.DATABASE_URL) {
    return envFrom() || GENERIC_PLATFORM_FROM;
  }

  try {
    const { query } = await import("@/lib/db");
    const { rows } = await query<{
      from_email: string | null;
      email: string | null;
    }>(
      `SELECT from_email, email FROM dealers WHERE id = $1::uuid LIMIT 1`,
      [dealerId],
    );
    const row = rows[0];

    if (row?.from_email && row.from_email.trim().length > 0) {
      return row.from_email.trim();
    }

    // Fallback 1: dealer's reply email if set.
    if (row?.email && row.email.trim().length > 0) {
      // Log the fallback so operations can prioritise getting from_email
      // configured on this dealer's Resend domain.
      trackSystem("system.settings_updated", dealerId, {
        kind: "email.sender_fallback",
        from_email_source: "dealers.email",
      });
      return row.email.trim();
    }

    // Fallback 2/3: env or generic.
    trackSystem("system.settings_updated", dealerId, {
      kind: "email.sender_fallback",
      from_email_source: envFrom() ? "env" : "generic",
    });
    return envFrom() || GENERIC_PLATFORM_FROM;
  } catch (err) {
    console.error(
      `[email] Failed to resolve dealer FROM for ${dealerId}, falling back to env:`,
      err,
    );
    return envFrom() || GENERIC_PLATFORM_FROM;
  }
}

// ---------------------------------------------------------------------------
// Core send function
// ---------------------------------------------------------------------------

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /** Optional dealer id. When set, the FROM address is dealer-branded. */
  dealerId?: string | null;
}

async function sendEmail(params: SendEmailParams): Promise<void> {
  const from = await resolveDealerFromEmail(params.dealerId);

  if (!resendClient) {
    console.log(
      `[email] No RESEND_API_KEY — logging email instead:\n` +
        `  From: ${from}\n` +
        `  To: ${params.to}\n` +
        `  Subject: ${params.subject}\n` +
        `  ReplyTo: ${params.replyTo ?? "(none)"}\n` +
        `  Body length: ${params.html.length} chars`,
    );
    return;
  }

  const { error } = await resendClient.emails.send({
    from,
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
      dealerId: dealer.id,
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
    const subject = `Thanks for contacting ${dealer.name || "us"}!`;
    await sendEmail({
      to: lead.email,
      subject,
      html: customerConfirmationHTML(dealer, lead),
      replyTo: dealer.email,
      dealerId: dealer.id,
    });
  } catch (err) {
    console.error("[email] Failed to send customer confirmation:", err);
  }
}
