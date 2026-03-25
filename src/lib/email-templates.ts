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
          ${escapeHtml(dealer.name)} &mdash; Wolfpack Auto Platform
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
          ${escapeHtml(dealer.name)} &mdash; Wolfpack Auto Platform
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
