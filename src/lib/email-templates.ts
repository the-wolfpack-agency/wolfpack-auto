import type { Dealer } from "@/types/dealer";
import type { Lead } from "@/types/lead";

/**
 * HTML email sent to the dealer when a new lead arrives.
 */
export function dealerLeadNotificationHTML(dealer: Dealer, lead: Lead): string {
  const primaryColor = dealer.branding?.primary_color ?? "#1a1a2e";
  const accentColor = dealer.branding?.accent_color ?? "#e94560";
  const logoUrl = dealer.branding?.logo_url ?? "";
  const timestamp = new Date(lead.created_at).toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const utmRows =
    lead.utm_source || lead.utm_medium || lead.utm_campaign
      ? `
        <tr><td colspan="2" style="padding:12px 16px 4px;font-weight:600;color:${primaryColor};font-size:14px;">Attribution</td></tr>
        ${lead.utm_source ? `<tr><td style="padding:4px 16px;color:#666;font-size:13px;width:140px;">UTM Source</td><td style="padding:4px 16px;font-size:13px;">${escapeHtml(lead.utm_source)}</td></tr>` : ""}
        ${lead.utm_medium ? `<tr><td style="padding:4px 16px;color:#666;font-size:13px;">UTM Medium</td><td style="padding:4px 16px;font-size:13px;">${escapeHtml(lead.utm_medium)}</td></tr>` : ""}
        ${lead.utm_campaign ? `<tr><td style="padding:4px 16px;color:#666;font-size:13px;">UTM Campaign</td><td style="padding:4px 16px;font-size:13px;">${escapeHtml(lead.utm_campaign)}</td></tr>` : ""}
        ${lead.referrer_url ? `<tr><td style="padding:4px 16px;color:#666;font-size:13px;">Referrer</td><td style="padding:4px 16px;font-size:13px;word-break:break-all;">${escapeHtml(lead.referrer_url)}</td></tr>` : ""}
      `
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr><td style="background:${primaryColor};padding:24px 32px;text-align:center;">
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(dealer.name)}" height="40" style="max-height:40px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;">` : ""}
          <div style="color:#fff;font-size:20px;font-weight:700;">New Lead Received</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#333;">A new inquiry has been submitted on your website.</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
            <tr><td style="padding:12px 16px 4px;font-weight:600;color:${primaryColor};font-size:14px;">Contact Information</td></tr>
            <tr>
              <td style="padding:4px 16px;color:#666;font-size:13px;width:140px;">Name</td>
              <td style="padding:4px 16px;font-size:13px;font-weight:600;">${escapeHtml(lead.first_name)} ${escapeHtml(lead.last_name)}</td>
            </tr>
            <tr>
              <td style="padding:4px 16px;color:#666;font-size:13px;">Email</td>
              <td style="padding:4px 16px;font-size:13px;"><a href="mailto:${escapeHtml(lead.email)}" style="color:${accentColor};">${escapeHtml(lead.email)}</a></td>
            </tr>
            ${lead.phone ? `<tr><td style="padding:4px 16px;color:#666;font-size:13px;">Phone</td><td style="padding:4px 16px;font-size:13px;"><a href="tel:${escapeHtml(lead.phone)}" style="color:${accentColor};">${escapeHtml(lead.phone)}</a></td></tr>` : ""}

            <tr><td colspan="2" style="padding:12px 16px 4px;font-weight:600;color:${primaryColor};font-size:14px;">Inquiry Details</td></tr>
            <tr>
              <td style="padding:4px 16px;color:#666;font-size:13px;">Vehicle Interest</td>
              <td style="padding:4px 16px;font-size:13px;">${escapeHtml(lead.vehicle_interest || "General Inquiry")}</td>
            </tr>
            <tr>
              <td style="padding:4px 16px;color:#666;font-size:13px;">Source</td>
              <td style="padding:4px 16px;font-size:13px;">${escapeHtml(formatSource(lead.source))}</td>
            </tr>
            ${lead.notes ? `<tr><td style="padding:4px 16px;color:#666;font-size:13px;vertical-align:top;">Message</td><td style="padding:4px 16px;font-size:13px;">${escapeHtml(lead.notes)}</td></tr>` : ""}

            ${utmRows}
          </table>

          <!-- CTA -->
          <div style="text-align:center;margin:24px 0 8px;">
            <a href="mailto:${escapeHtml(lead.email)}?subject=${encodeURIComponent(`Re: Your inquiry at ${dealer.name}`)}"
               style="display:inline-block;padding:12px 32px;background:${accentColor};color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
              Reply to This Lead
            </a>
          </div>

          <p style="margin:16px 0 0;font-size:12px;color:#999;text-align:center;">
            Received ${escapeHtml(timestamp)}
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee;text-align:center;font-size:11px;color:#aaa;">
          ${escapeHtml(dealer.name)} · Wolfpack Auto Platform
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * HTML email sent to the customer confirming their inquiry.
 */
export function customerConfirmationHTML(dealer: Dealer, lead: Lead): string {
  const primaryColor = dealer.branding?.primary_color ?? "#1a1a2e";
  const accentColor = dealer.branding?.accent_color ?? "#e94560";
  const logoUrl = dealer.branding?.logo_url ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr><td style="background:${primaryColor};padding:24px 32px;text-align:center;">
          ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(dealer.name)}" height="40" style="max-height:40px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;">` : ""}
          <div style="color:#fff;font-size:20px;font-weight:700;">${escapeHtml(dealer.name)}</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;font-size:18px;color:${primaryColor};">
            Thanks for reaching out, ${escapeHtml(lead.first_name)}!
          </h2>

          <p style="margin:0 0 12px;font-size:15px;color:#333;line-height:1.6;">
            We received your inquiry${lead.vehicle_interest ? ` about the <strong>${escapeHtml(lead.vehicle_interest)}</strong>` : ""} and a member of our team will get back to you <strong>within 1 business hour</strong>.
          </p>

          <p style="margin:0 0 24px;font-size:15px;color:#333;line-height:1.6;">
            In the meantime, feel free to contact us directly:
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;margin-bottom:24px;">
            ${dealer.phone ? `<tr><td style="padding:8px 16px;color:#666;font-size:13px;width:100px;">Phone</td><td style="padding:8px 16px;font-size:13px;"><a href="tel:${escapeHtml(dealer.phone)}" style="color:${accentColor};font-weight:600;">${escapeHtml(dealer.phone)}</a></td></tr>` : ""}
            ${dealer.email ? `<tr><td style="padding:8px 16px;color:#666;font-size:13px;">Email</td><td style="padding:8px 16px;font-size:13px;"><a href="mailto:${escapeHtml(dealer.email)}" style="color:${accentColor};">${escapeHtml(dealer.email)}</a></td></tr>` : ""}
            ${dealer.website_url ? `<tr><td style="padding:8px 16px;color:#666;font-size:13px;">Website</td><td style="padding:8px 16px;font-size:13px;"><a href="${escapeHtml(dealer.website_url)}" style="color:${accentColor};">${escapeHtml(dealer.website_url)}</a></td></tr>` : ""}
            ${dealer.address?.street ? `<tr><td style="padding:8px 16px;color:#666;font-size:13px;vertical-align:top;">Address</td><td style="padding:8px 16px;font-size:13px;">${escapeHtml(dealer.address.street)}<br>${escapeHtml(dealer.address.city)}, ${escapeHtml(dealer.address.state)} ${escapeHtml(dealer.address.zip)}</td></tr>` : ""}
          </table>

          <p style="margin:0;font-size:13px;color:#999;text-align:center;">
            You are receiving this email because you submitted an inquiry at ${escapeHtml(dealer.name)}.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee;text-align:center;font-size:11px;color:#aaa;">
          ${escapeHtml(dealer.name)} · Wolfpack Auto Platform
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// New Lead Alert (for dealer staff via notification dispatcher)
// ---------------------------------------------------------------------------

export function newLeadHTML(params: {
  name: string;
  email: string;
  phone: string | null;
  vehicle: string;
  source: string;
  timestamp: string;
}): string {
  const { name, email, phone, vehicle, source, timestamp } = params;

  return wrapInLayout({
    headerBg: "#1a1a2e",
    headerTitle: "New Lead Alert",
    body: `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">A new lead has been submitted on your website.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
        <tr><td style="padding:12px 16px 4px;font-weight:600;color:#1a1a2e;font-size:14px;">Contact Information</td></tr>
        <tr>
          <td style="padding:4px 16px;color:#666;font-size:13px;width:140px;">Name</td>
          <td style="padding:4px 16px;font-size:13px;font-weight:600;">${escapeHtml(name)}</td>
        </tr>
        <tr>
          <td style="padding:4px 16px;color:#666;font-size:13px;">Email</td>
          <td style="padding:4px 16px;font-size:13px;"><a href="mailto:${escapeHtml(email)}" style="color:#e94560;">${escapeHtml(email)}</a></td>
        </tr>
        ${phone ? `<tr><td style="padding:4px 16px;color:#666;font-size:13px;">Phone</td><td style="padding:4px 16px;font-size:13px;"><a href="tel:${escapeHtml(phone)}" style="color:#e94560;">${escapeHtml(phone)}</a></td></tr>` : ""}
        <tr><td colspan="2" style="padding:12px 16px 4px;font-weight:600;color:#1a1a2e;font-size:14px;">Inquiry</td></tr>
        <tr>
          <td style="padding:4px 16px;color:#666;font-size:13px;">Vehicle</td>
          <td style="padding:4px 16px;font-size:13px;">${escapeHtml(vehicle)}</td>
        </tr>
        <tr>
          <td style="padding:4px 16px;color:#666;font-size:13px;">Source</td>
          <td style="padding:4px 16px;font-size:13px;">${escapeHtml(formatSource(source))}</td>
        </tr>
      </table>
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="mailto:${escapeHtml(email)}?subject=${encodeURIComponent("Re: Your vehicle inquiry")}"
           style="display:inline-block;padding:12px 32px;background:#e94560;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          Reply to This Lead
        </a>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#999;text-align:center;">Received ${escapeHtml(timestamp)}</p>
    `,
    footerText: "Wolfpack Auto Platform",
  });
}

// ---------------------------------------------------------------------------
// Contact Form Submission (for dealer staff)
// ---------------------------------------------------------------------------

export function contactSubmissionHTML(params: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): string {
  const { name, email, subject, message } = params;

  return wrapInLayout({
    headerBg: "#1a1a2e",
    headerTitle: "New Contact Form Submission",
    body: `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">A visitor submitted a message through your contact form.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
        <tr>
          <td style="padding:8px 16px;color:#666;font-size:13px;width:140px;">Name</td>
          <td style="padding:8px 16px;font-size:13px;font-weight:600;">${escapeHtml(name)}</td>
        </tr>
        <tr>
          <td style="padding:8px 16px;color:#666;font-size:13px;">Email</td>
          <td style="padding:8px 16px;font-size:13px;"><a href="mailto:${escapeHtml(email)}" style="color:#e94560;">${escapeHtml(email)}</a></td>
        </tr>
        <tr>
          <td style="padding:8px 16px;color:#666;font-size:13px;">Subject</td>
          <td style="padding:8px 16px;font-size:13px;">${escapeHtml(subject)}</td>
        </tr>
        <tr>
          <td style="padding:8px 16px;color:#666;font-size:13px;vertical-align:top;">Message</td>
          <td style="padding:8px 16px;font-size:13px;line-height:1.5;">${escapeHtml(message)}</td>
        </tr>
      </table>
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="mailto:${escapeHtml(email)}?subject=${encodeURIComponent(`Re: ${subject}`)}"
           style="display:inline-block;padding:12px 32px;background:#e94560;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          Reply to Message
        </a>
      </div>
    `,
    footerText: "Wolfpack Auto Platform",
  });
}

// ---------------------------------------------------------------------------
// Customer Confirmation (sent to customer after lead/contact submission)
// ---------------------------------------------------------------------------

export function genericCustomerConfirmationHTML(params: {
  customerName: string;
  dealerName: string;
  type: "lead" | "contact";
}): string {
  const { customerName, dealerName, type } = params;
  const greeting = customerName ? `Hi ${escapeHtml(customerName)},` : "Hi,";
  const typeLabel = type === "lead" ? "vehicle inquiry" : "message";

  return wrapInLayout({
    headerBg: "#1a1a2e",
    headerTitle: escapeHtml(dealerName),
    brandName: dealerName,
    body: `
      <h2 style="margin:0 0 16px;font-size:18px;color:#1a1a2e;">We Received Your Inquiry</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#333;line-height:1.6;">
        ${greeting}
      </p>
      <p style="margin:0 0 12px;font-size:15px;color:#333;line-height:1.6;">
        Thank you for your ${typeLabel}. A member of our team will get back to you <strong>within 1 business hour</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#333;line-height:1.6;">
        If you need immediate assistance, don't hesitate to call us directly.
      </p>
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="#"
           style="display:inline-block;padding:12px 32px;background:#e94560;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          Browse Our Inventory
        </a>
      </div>
      <p style="margin:16px 0 0;font-size:13px;color:#999;text-align:center;">
        You are receiving this email because you submitted a ${typeLabel} at ${escapeHtml(dealerName)}.
      </p>
    `,
    footerText: `${escapeHtml(dealerName)} · Wolfpack Auto Platform`,
  });
}

// ---------------------------------------------------------------------------
// Lead Assigned (sent to specific staff member)
// ---------------------------------------------------------------------------

export function leadAssignedHTML(params: {
  leadName: string;
  assignedTo: string;
  vehicle: string;
}): string {
  const { leadName, assignedTo, vehicle } = params;

  return wrapInLayout({
    headerBg: "#1a1a2e",
    headerTitle: "Lead Assigned to You",
    body: `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        A lead has been assigned to you. Please follow up promptly.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
        <tr>
          <td style="padding:8px 16px;color:#666;font-size:13px;width:140px;">Lead Name</td>
          <td style="padding:8px 16px;font-size:13px;font-weight:600;">${escapeHtml(leadName)}</td>
        </tr>
        <tr>
          <td style="padding:8px 16px;color:#666;font-size:13px;">Vehicle Interest</td>
          <td style="padding:8px 16px;font-size:13px;">${escapeHtml(vehicle)}</td>
        </tr>
        <tr>
          <td style="padding:8px 16px;color:#666;font-size:13px;">Assigned To</td>
          <td style="padding:8px 16px;font-size:13px;">${escapeHtml(assignedTo)}</td>
        </tr>
      </table>
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="#"
           style="display:inline-block;padding:12px 32px;background:#e94560;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          View Lead in Dashboard
        </a>
      </div>
    `,
    footerText: "Wolfpack Auto Platform",
  });
}

// ---------------------------------------------------------------------------
// Inventory Alert (for managers)
// ---------------------------------------------------------------------------

export function inventoryAlertHTML(params: {
  alertType: string;
  details: string;
  actionUrl: string;
}): string {
  const { alertType, details, actionUrl } = params;

  return wrapInLayout({
    headerBg: "#92400e",
    headerTitle: "Inventory Alert",
    body: `
      <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:16px;margin:0 0 16px;">
        <p style="margin:0;font-size:14px;font-weight:600;color:#92400e;">${escapeHtml(alertType)}</p>
      </div>
      <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6;">
        ${escapeHtml(details)}
      </p>
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${escapeHtml(actionUrl)}"
           style="display:inline-block;padding:12px 32px;background:#e94560;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          Review Inventory
        </a>
      </div>
    `,
    footerText: "Wolfpack Auto Platform",
  });
}

// ---------------------------------------------------------------------------
// Shared layout wrapper
// ---------------------------------------------------------------------------

function wrapInLayout(params: {
  headerBg: string;
  headerTitle: string;
  body: string;
  footerText: string;
  /** Dealer/brand name shown as the header wordmark, so recipients see the
   *  dealership, never a hardcoded platform name or a bare initial. */
  brandName?: string;
  /** Optional dealer logo URL; shown instead of the wordmark when present. */
  logoUrl?: string;
}): string {
  const { headerBg, headerTitle, body, footerText, brandName, logoUrl } = params;
  const brandEsc = escapeHtml((brandName ?? "").trim());
  // Brand identity: logo if we have one, otherwise the full dealer name.
  const brandBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${brandEsc}" height="44" style="height:44px;max-width:220px;margin:0 auto 10px;display:block;">`
    : brandEsc
      ? `<div style="color:#fff;font-size:19px;font-weight:700;letter-spacing:.01em;margin:0 0 6px;">${brandEsc}</div>`
      : "";
  const hasBrand = brandBlock !== "";
  // Email purpose line. Hidden when it would just repeat the brand name.
  const titleBlock =
    headerTitle && headerTitle !== brandEsc
      ? `<div style="color:#fff;font-size:${hasBrand ? "14px" : "20px"};font-weight:${hasBrand ? "500" : "700"};${hasBrand ? "opacity:.9;" : ""}">${headerTitle}</div>`
      : hasBrand
        ? ""
        : `<div style="color:#fff;font-size:20px;font-weight:700;">${headerTitle}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f8;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr><td style="background:${headerBg};padding:24px 32px;text-align:center;">
          ${brandBlock}${titleBlock}
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:24px 32px;">
          ${body}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #eee;text-align:center;font-size:11px;color:#aaa;">
          ${footerText}
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatSource(source: string): string {
  const map: Record<string, string> = {
    website_form: "Website Form",
    vdp_inquiry: "Vehicle Detail Page",
    chat: "Live Chat",
    phone: "Phone Call",
    third_party: "Third Party",
    walk_in: "Walk-in",
  };
  return map[source] ?? source;
}

// ---------------------------------------------------------------------------
// Team invite email
// ---------------------------------------------------------------------------

export function teamInviteHTML(params: {
  inviteeName: string;
  dealerName: string;
  role: string;
  inviterName: string;
  acceptUrl: string;
}): string {
  const { inviteeName, dealerName, role, inviterName, acceptUrl } = params;
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  return wrapInLayout({
    headerBg: "#1a1a2e",
    headerTitle: "You're Invited",
    brandName: dealerName,
    body: `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        Hi${inviteeName ? ` ${escapeHtml(inviteeName)}` : ""},
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6;">
        ${escapeHtml(inviterName)} has invited you to join
        <strong>${escapeHtml(dealerName)}</strong> on Wolfpack Auto
        as a <strong>${escapeHtml(roleLabel)}</strong>.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(acceptUrl)}"
           style="display:inline-block;padding:14px 40px;background:#0070c7;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          Accept Invitation
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#888;">
        This invitation expires in 7 days. If you didn't expect this, you can ignore this email.
      </p>
      <p style="margin:0;font-size:12px;color:#aaa;word-break:break-all;">
        ${escapeHtml(acceptUrl)}
      </p>
    `,
    footerText: `${escapeHtml(dealerName)} · Powered by Wolfpack Auto`,
  });
}

// ---------------------------------------------------------------------------
// Password reset email
// ---------------------------------------------------------------------------

export function passwordResetHTML(params: {
  name: string;
  resetUrl: string;
  dealerName: string;
}): string {
  const { name, resetUrl, dealerName } = params;

  return wrapInLayout({
    headerBg: "#1a1a2e",
    headerTitle: "Reset Your Password",
    brandName: dealerName,
    body: `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        Hi${name ? ` ${escapeHtml(name)}` : ""},
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6;">
        We received a request to reset your password for your
        <strong>${escapeHtml(dealerName)}</strong> account.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(resetUrl)}"
           style="display:inline-block;padding:14px 40px;background:#0070c7;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;">
          Reset Password
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#888;">
        This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
      </p>
      <p style="margin:0;font-size:12px;color:#aaa;word-break:break-all;">
        ${escapeHtml(resetUrl)}
      </p>
    `,
    footerText: `${escapeHtml(dealerName)} · Powered by Wolfpack Auto`,
  });
}

// ---------------------------------------------------------------------------
// Deal status update (customer-facing)
// ---------------------------------------------------------------------------

export function dealStatusUpdateHTML(params: {
  customerName: string;
  dealerName: string;
  vehicleLabel: string;
  oldStatus: string;
  newStatus: string;
  message: string;
  dealerPhone: string;
}): string {
  const { customerName, dealerName, vehicleLabel, oldStatus, newStatus, message, dealerPhone } = params;

  const statusColors: Record<string, string> = {
    approved: "#059669",
    presented: "#7c3aed",
    accepted: "#059669",
    funded: "#0d9488",
    delivered: "#374151",
  };
  const color = statusColors[newStatus] ?? "#0070c7";

  return wrapInLayout({
    headerBg: color,
    headerTitle: "Deal Update",
    brandName: dealerName,
    body: `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        Hi ${escapeHtml(customerName)},
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6;">
        Great news! Your deal for the <strong>${escapeHtml(vehicleLabel)}</strong>
        has been updated.
      </p>
      <div style="background:#f8f9fa;border:1px solid #e8e8e8;border-radius:6px;padding:16px;margin:0 0 16px;text-align:center;">
        <span style="color:#888;font-size:13px;text-decoration:line-through;">${escapeHtml(formatDealStatus(oldStatus))}</span>
        <span style="color:#888;margin:0 8px;">&rarr;</span>
        <span style="color:${color};font-size:16px;font-weight:700;">${escapeHtml(formatDealStatus(newStatus))}</span>
      </div>
      ${message ? `<p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.6;">${escapeHtml(message)}</p>` : ""}
      <p style="margin:0 0 4px;font-size:14px;color:#333;">
        Questions? Call us at <a href="tel:${escapeHtml(dealerPhone)}" style="color:#0070c7;font-weight:600;">${escapeHtml(dealerPhone)}</a>
      </p>
    `,
    footerText: `${escapeHtml(dealerName)} · Powered by Wolfpack Auto`,
  });
}

function formatDealStatus(status: string): string {
  const map: Record<string, string> = {
    working: "In Progress",
    pending_approval: "Pending Approval",
    approved: "Approved",
    presented: "Presented",
    accepted: "Accepted",
    funded: "Funded",
    delivered: "Delivered",
  };
  return map[status] ?? status;
}

// ---------------------------------------------------------------------------
// Service appointment reminder
// ---------------------------------------------------------------------------

export function serviceReminderHTML(params: {
  customerName: string;
  dealerName: string;
  dealerPhone: string;
  dealerAddress: string;
  serviceType: string;
  scheduledAt: string;
  vehicleLabel: string;
}): string {
  const { customerName, dealerName, dealerPhone, dealerAddress, serviceType, scheduledAt, vehicleLabel } = params;

  return wrapInLayout({
    headerBg: "#0070c7",
    headerTitle: "Service Reminder",
    brandName: dealerName,
    body: `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        Hi ${escapeHtml(customerName)},
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;line-height:1.6;">
        This is a reminder about your upcoming service appointment at
        <strong>${escapeHtml(dealerName)}</strong>.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;margin:0 0 16px;">
        <tr>
          <td style="padding:8px 16px;color:#666;font-size:13px;width:100px;">Vehicle</td>
          <td style="padding:8px 16px;font-size:13px;font-weight:600;">${escapeHtml(vehicleLabel)}</td>
        </tr>
        <tr style="background:#f8f9fa;">
          <td style="padding:8px 16px;color:#666;font-size:13px;">Service</td>
          <td style="padding:8px 16px;font-size:13px;">${escapeHtml(serviceType)}</td>
        </tr>
        <tr>
          <td style="padding:8px 16px;color:#666;font-size:13px;">Date &amp; Time</td>
          <td style="padding:8px 16px;font-size:13px;font-weight:600;">${escapeHtml(scheduledAt)}</td>
        </tr>
        <tr style="background:#f8f9fa;">
          <td style="padding:8px 16px;color:#666;font-size:13px;">Location</td>
          <td style="padding:8px 16px;font-size:13px;">${escapeHtml(dealerAddress)}</td>
        </tr>
      </table>
      <p style="margin:0;font-size:14px;color:#555;">
        Need to reschedule? Call us at
        <a href="tel:${escapeHtml(dealerPhone)}" style="color:#0070c7;font-weight:600;">${escapeHtml(dealerPhone)}</a>
      </p>
    `,
    footerText: `${escapeHtml(dealerName)} · Powered by Wolfpack Auto`,
  });
}
