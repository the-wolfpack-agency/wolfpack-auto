import { Resend } from "resend";
import {
  newLeadHTML,
  contactSubmissionHTML,
  genericCustomerConfirmationHTML,
  leadAssignedHTML,
  inventoryAlertHTML,
  teamInviteHTML,
  passwordResetHTML,
  dealStatusUpdateHTML,
  serviceReminderHTML,
} from "@/lib/email-templates";
import { sanitizeForLog } from "@/lib/log-sanitize";
import { sendViaGraph, isGraphMailConfigured } from "@/lib/mail/send-via-graph";

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
  // Prefer Microsoft Graph (the same M365 transport as team invites) so every
  // notification uses one working mailbox instead of the misconfigured Resend
  // sandbox. Fall back to Resend if a key is set, else log (dev/CI).
  if (isGraphMailConfigured()) {
    const graph = await sendViaGraph({ to, subject, text: "", html });
    if (graph.delivered) return;
    console.warn(
      `[notifications] graph send failed (${graph.reason})${graph.detail ? ` ${graph.detail}` : ""}, falling back`,
    );
  }

  if (_notifResendClient) {
    const { error } = await _notifResendClient.emails.send({
      from: _notifResendFrom,
      to: [to],
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) console.error(`[notifications] Resend SDK error:`, error);
    return;
  }

  console.log(
    `[notifications] no mail transport configured, logging email:\n` +
      `  To: ${sanitizeForLog(to)}\n` +
      `  Subject: ${sanitizeForLog(subject)}\n` +
      `  Body length: ${html.length} chars`,
  );
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
      console.error(`[notifications] Failed to email ${sanitizeForLog(to)}:`, err);
    });
  }
}

// ---------------------------------------------------------------------------
// Public API, all functions are non-blocking (fire-and-forget safe)
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
      `New Lead: ${lead.name}, ${lead.vehicle_interest ?? "General Inquiry"}`,
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
      `New Contact: ${contact.first_name} ${contact.last_name}, ${contact.subject}`,
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
        ? `Thanks for your inquiry, ${dealerName}`
        : `We received your message, ${dealerName}`,
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

export interface TeamInviteResult {
  /** True only when Microsoft Graph accepted the message (HTTP 202). */
  delivered: boolean;
  /** Machine-readable outcome, mirrors GraphSendReason plus "not_configured". */
  reason: string;
  /** Always returned so the admin UI can hand-deliver the link when email
   *  delivery is unavailable or degrades. */
  acceptUrl: string;
  /** Which provider attempted delivery, when one did. */
  provider?: "graph";
}

/**
 * Send a team invite email to a new dealer user via Microsoft Graph
 * (app-only Mail.Send) - the same M365 transport beyond-sku and Instinct
 * use, so there is no Resend/DNS dependency. NEVER throws: the dealer_users
 * row has already been written by the caller, so a mail misconfig must not
 * fail the request. Returns { delivered, reason, acceptUrl } so the caller
 * and UI can surface a copyable accept link when delivery is unavailable
 * instead of falsely claiming the email was sent.
 *
 * Analytics events emitted:
 *   - system.team_invite_sent on delivery
 *   - system.notification_send_failed on a Graph error (non-blocking)
 */
export async function sendTeamInvite(params: {
  inviteeEmail: string;
  inviteeName: string;
  role: string;
  inviterName: string;
  dealerName: string;
  inviteToken: string;
  dealerId?: string;
  inviterId?: string;
}): Promise<TeamInviteResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL
    : process.env.NEXTAUTH_URL
      ? process.env.NEXTAUTH_URL
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";
  const acceptUrl = `${baseUrl.replace(/\/$/, "")}/admin/accept-invite?token=${params.inviteToken}`;

  try {
    const html = teamInviteHTML({
      inviteeName: params.inviteeName,
      dealerName: params.dealerName,
      role: params.role,
      inviterName: params.inviterName,
      acceptUrl,
    });
    const subject = `You're invited to join ${params.dealerName} on Wolfpack Auto`;
    const text =
      `${params.inviterName} has invited you to join ${params.dealerName} on Wolfpack Auto ` +
      `with ${params.role} access.\n\nSet up your account:\n${acceptUrl}`;

    // No mailbox configured: skip the send and let the caller hand the admin
    // the copyable accept link. Don't emit a "sent" event: nothing was sent.
    if (!isGraphMailConfigured()) {
      console.warn(
        `[notifications] MS_MAIL_FROM unset, invite email skipped for ` +
          `${sanitizeForLog(params.inviteeEmail)}; accept link returned to admin`,
      );
      return { delivered: false, reason: "not_configured", acceptUrl };
    }

    // Brand the From display name with the dealer so the invite reads right.
    const graph = await sendViaGraph({
      to: params.inviteeEmail,
      subject,
      text,
      html,
      fromName: params.dealerName || "Wolfpack Auto",
    });

    if (graph.delivered) {
      void _emitInviteAnalytics("sent", params).catch(() => {});
      return { delivered: true, reason: "ok", acceptUrl, provider: "graph" };
    }

    console.warn(
      "[notifications] sendTeamInvite graph send failed:",
      graph.reason,
      graph.detail ?? "",
    );
    void _emitNotificationFailedAnalytics(
      params.inviteeEmail,
      `graph:${graph.reason}${graph.detail ? ` ${graph.detail}` : ""}`,
      params.dealerId,
    ).catch(() => {});
    return { delivered: false, reason: graph.reason, acceptUrl, provider: "graph" };
  } catch (err) {
    console.error("[notifications] sendTeamInvite failed:", err);
    void _emitNotificationFailedAnalytics(
      params.inviteeEmail,
      err instanceof Error ? err.message : String(err),
      params.dealerId,
    ).catch(() => {});
    return { delivered: false, reason: "provider_error", acceptUrl };
  }
}

/** Fire-and-forget analytics helper for team invite sent. */
async function _emitInviteAnalytics(
  _outcome: "sent",
  params: {
    inviteeEmail: string;
    role: string;
    dealerId?: string;
    inviterId?: string;
  },
): Promise<void> {
  try {
    const { trackSystem } = await import("@/lib/analytics-hooks");
    trackSystem("system.team_invite_sent", params.dealerId ?? "system", {
      invited_email: params.inviteeEmail,
      invited_role: params.role,
      inviter_id: params.inviterId ?? "unknown",
    });
  } catch { /* analytics never blocks */ }
}

/** Fire-and-forget analytics helper for notification send failure. */
async function _emitNotificationFailedAnalytics(
  recipient: string,
  error: string,
  dealerId?: string,
): Promise<void> {
  try {
    const { trackSystem } = await import("@/lib/analytics-hooks");
    trackSystem("system.notification_send_failed", dealerId ?? "system", {
      notification_type: "team_invite",
      recipient,
      error: error.slice(0, 200),
    });
  } catch { /* analytics never blocks */ }
}

/**
 * Send a password reset email.
 */
export async function sendPasswordReset(params: {
  email: string;
  name: string;
  resetToken: string;
  dealerName: string;
}): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      ? process.env.NEXT_PUBLIC_APP_URL
      : process.env.NEXTAUTH_URL
        ? process.env.NEXTAUTH_URL
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000";
    const resetUrl = `${baseUrl.replace(/\/$/, "")}/admin/reset-password?token=${params.resetToken}`;

    const html = passwordResetHTML({
      name: params.name,
      resetUrl,
      dealerName: params.dealerName,
    });

    void dispatchEmail(
      params.email,
      `Reset your password: ${params.dealerName}`,
      html,
    ).catch((err) => {
      console.error("[notifications] sendPasswordReset email failed:", err);
    });
  } catch (err) {
    console.error("[notifications] sendPasswordReset failed:", err);
  }
}

/**
 * Notify a customer that their deal status has changed.
 */
export async function notifyDealStatusChange(params: {
  customerEmail: string;
  customerName: string;
  dealerName: string;
  dealerPhone: string;
  vehicleLabel: string;
  oldStatus: string;
  newStatus: string;
  message?: string;
}): Promise<void> {
  try {
    const html = dealStatusUpdateHTML({
      customerName: params.customerName,
      dealerName: params.dealerName,
      vehicleLabel: params.vehicleLabel,
      oldStatus: params.oldStatus,
      newStatus: params.newStatus,
      message: params.message ?? "",
      dealerPhone: params.dealerPhone,
    });

    void dispatchEmail(
      params.customerEmail,
      `Your deal has been updated, ${params.dealerName}`,
      html,
    ).catch((err) => {
      console.error("[notifications] notifyDealStatusChange email failed:", err);
    });
  } catch (err) {
    console.error("[notifications] notifyDealStatusChange failed:", err);
  }
}

/**
 * Send a service appointment reminder to a customer.
 */
export async function sendServiceReminder(params: {
  customerEmail: string;
  customerName: string;
  dealerName: string;
  dealerPhone: string;
  dealerAddress: string;
  serviceType: string;
  scheduledAt: string;
  vehicleLabel: string;
}): Promise<void> {
  try {
    const html = serviceReminderHTML({
      customerName: params.customerName,
      dealerName: params.dealerName,
      dealerPhone: params.dealerPhone,
      dealerAddress: params.dealerAddress,
      serviceType: params.serviceType,
      scheduledAt: params.scheduledAt,
      vehicleLabel: params.vehicleLabel,
    });

    void dispatchEmail(
      params.customerEmail,
      `Service reminder: ${params.serviceType}, ${params.dealerName}`,
      html,
    ).catch((err) => {
      console.error("[notifications] sendServiceReminder email failed:", err);
    });
  } catch (err) {
    console.error("[notifications] sendServiceReminder failed:", err);
  }
}
