import { Resend } from "resend";
import {
  newLeadHTML,
  contactSubmissionHTML,
  genericCustomerConfirmationHTML,
  leadAssignedHTML,
  inventoryAlertHTML,
} from "@/lib/email-templates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NewLeadPayload {
  name: string;
  email: string;
  phone?: string;
  vehicle_interest?: string;
  source: string;
}

interface ContactPayload {
  first_name: string;
  last_name: string;
  email: string;
  subject: string;
  message: string;
}

interface InventoryAlertPayload {
  type: "slow_mover" | "price_opportunity" | "inventory_gap";
  details: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch dealer staff emails from PostgreSQL where role is admin or manager
 * and notifications are enabled. Falls back to an empty array on error.
 */
async function getDealerStaffEmails(
  dealerId: string,
  roles: string[] = ["admin", "manager"],
): Promise<string[]> {
  try {
    if (!process.env.DATABASE_URL) return [];

    const { query } = await import("@/lib/db");
    const result = await query<{ email: string }>(
      `SELECT email FROM dealer_users
       WHERE dealer_id = $1
         AND role = ANY($2)
         AND notifications_enabled = true`,
      [dealerId, roles],
    );

    return result.rows.map((r) => r.email);
  } catch (err) {
    console.error("[notifications] Failed to fetch staff emails:", err);
    return [];
  }
}

/**
 * Fetch dealer name for use in customer-facing emails.
 */
async function getDealerName(dealerId: string): Promise<string> {
  try {
    if (!process.env.DATABASE_URL) return "Our Dealership";

    const { query } = await import("@/lib/db");
    const result = await query<{ name: string }>(
      `SELECT name FROM dealers WHERE id = $1 LIMIT 1`,
      [dealerId],
    );

    return result.rows[0]?.name ?? "Our Dealership";
  } catch {
    return "Our Dealership";
  }
}

// Lazily-initialised Resend client shared across all notification dispatches.
const _notifResendKey = process.env.RESEND_API_KEY ?? "";
const _notifResendFrom =
  process.env.RESEND_FROM_EMAIL ?? "Wolfpack Motors <leads@wolfpackauto.com>";
const _notifResendClient: Resend | null = _notifResendKey
  ? new Resend(_notifResendKey)
  : null;

/**
 * Send an email via the Resend SDK.
 * Logs to console when RESEND_API_KEY is absent (safe for dev/CI).
 */
async function dispatchEmail(
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
): Promise<void> {
  if (!_notifResendClient) {
    console.log(
      `[notifications] No RESEND_API_KEY — logging email:\n` +
        `  To: ${to}\n` +
        `  Subject: ${subject}\n` +
        `  Body length: ${html.length} chars`,
    );
    return;
  }

  const { error } = await _notifResendClient.emails.send({
    from: _notifResendFrom,
    to: [to],
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
  });

  if (error) {
    console.error(`[notifications] Resend SDK error:`, error);
  }
}

/**
 * Send an email to every recipient in the list (fire-and-forget each).
 */
function broadcastEmail(
  recipients: string[],
  subject: string,
  html: string,
  replyTo?: string,
): void {
  for (const to of recipients) {
    void dispatchEmail(to, subject, html, replyTo).catch((err) => {
      console.error(`[notifications] Failed to email ${to}:`, err);
    });
  }
}

// ---------------------------------------------------------------------------
// Public API — all functions are non-blocking (fire-and-forget safe)
// ---------------------------------------------------------------------------

/**
 * Notify dealer staff that a new lead has arrived.
 */
export async function notifyNewLead(
  lead: NewLeadPayload,
  dealerId: string,
): Promise<void> {
  try {
    const recipients = await getDealerStaffEmails(dealerId);
    if (recipients.length === 0) {
      console.log("[notifications] No staff recipients for new lead");
      return;
    }

    const timestamp = new Date().toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
    });

    const html = newLeadHTML({
      name: lead.name,
      email: lead.email,
      phone: lead.phone ?? null,
      vehicle: lead.vehicle_interest ?? "General Inquiry",
      source: lead.source,
      timestamp,
    });

    broadcastEmail(
      recipients,
      `New Lead: ${lead.name} — ${lead.vehicle_interest ?? "General Inquiry"}`,
      html,
      lead.email,
    );
  } catch (err) {
    console.error("[notifications] notifyNewLead failed:", err);
  }
}

/**
 * Notify a specific staff member that a lead has been assigned to them.
 */
export async function notifyLeadAssigned(
  lead: { name?: string; first_name?: string; last_name?: string; vehicle_interest?: string },
  assignedTo: string,
  dealerId: string,
): Promise<void> {
  try {
    const leadName =
      lead.name ?? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();

    const html = leadAssignedHTML({
      leadName,
      assignedTo,
      vehicle: lead.vehicle_interest ?? "General Inquiry",
    });

    void dispatchEmail(
      assignedTo,
      `Lead Assigned: ${leadName}`,
      html,
    ).catch((err) => {
      console.error("[notifications] notifyLeadAssigned email failed:", err);
    });
  } catch (err) {
    console.error("[notifications] notifyLeadAssigned failed:", err);
  }
}

/**
 * Notify dealer staff of a new contact form submission.
 */
export async function notifyContactFormSubmission(
  contact: ContactPayload,
  dealerId: string,
): Promise<void> {
  try {
    const recipients = await getDealerStaffEmails(dealerId);
    if (recipients.length === 0) {
      console.log("[notifications] No staff recipients for contact form");
      return;
    }

    const html = contactSubmissionHTML({
      name: `${contact.first_name} ${contact.last_name}`,
      email: contact.email,
      subject: contact.subject,
      message: contact.message,
    });

    broadcastEmail(
      recipients,
      `New Contact: ${contact.first_name} ${contact.last_name} — ${contact.subject}`,
      html,
      contact.email,
    );
  } catch (err) {
    console.error("[notifications] notifyContactFormSubmission failed:", err);
  }
}

/**
 * Send a confirmation email to the customer after they submit a lead or contact form.
 */
export async function sendCustomerConfirmation(
  customerEmail: string,
  type: "lead" | "contact",
  dealerName: string,
): Promise<void> {
  try {
    const html = genericCustomerConfirmationHTML({
      customerName: "",
      dealerName,
      type,
    });

    void dispatchEmail(
      customerEmail,
      type === "lead"
        ? `Thanks for your inquiry — ${dealerName}`
        : `We received your message — ${dealerName}`,
      html,
    ).catch((err) => {
      console.error("[notifications] sendCustomerConfirmation email failed:", err);
    });
  } catch (err) {
    console.error("[notifications] sendCustomerConfirmation failed:", err);
  }
}

/**
 * Notify managers of an inventory alert (slow movers, price opportunities, gaps).
 */
export async function notifyInventoryAlert(
  alert: InventoryAlertPayload,
  dealerId: string,
): Promise<void> {
  try {
    const recipients = await getDealerStaffEmails(dealerId, ["admin", "manager"]);
    if (recipients.length === 0) {
      console.log("[notifications] No recipients for inventory alert");
      return;
    }

    const alertLabels: Record<InventoryAlertPayload["type"], string> = {
      slow_mover: "Slow Mover Detected",
      price_opportunity: "Price Opportunity",
      inventory_gap: "Inventory Gap",
    };

    const dealerName = await getDealerName(dealerId);
    const adminUrl = `https://${dealerId}.wolfpackauto.com/admin/inventory`;

    const html = inventoryAlertHTML({
      alertType: alertLabels[alert.type],
      details: alert.details,
      actionUrl: adminUrl,
    });

    broadcastEmail(
      recipients,
      `Inventory Alert: ${alertLabels[alert.type]}`,
      html,
    );
  } catch (err) {
    console.error("[notifications] notifyInventoryAlert failed:", err);
  }
}
