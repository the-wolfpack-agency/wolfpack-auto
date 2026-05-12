/**
 * Website Audit — outbound email templates.
 *
 * Audit-specific copy. Deliberately separate from `src/lib/email-templates.ts`
 * (which serves dealer-customer notifications) so naming never collides.
 *
 * The audit email goes to a PROSPECT, not a customer. Tone is professional
 * but warm, no jargon, no claims we can't back up.
 */

import type { TriggeredRule } from "@/lib/website-audit/patterns";

export interface WebsiteAuditEmailContext {
  contact_name: string;
  dealership_name: string;
  website_url: string;
  /** Overall score 0-100. */
  overall_score: number;
  /** Top issues sorted by severity. */
  top_issues: TriggeredRule[];
  pdf_url: string;
  /** Calendly placeholder. Production env substitutes the real link. */
  demo_booking_url: string;
}

export const WEBSITE_AUDIT_EMAIL_SUBJECT =
  "Your Website Audit is ready";

export function renderWebsiteHeadline(
  ctx: Pick<WebsiteAuditEmailContext, "overall_score" | "top_issues">,
): string {
  const top = ctx.top_issues[0];
  if (!top) {
    return `Your site scored ${ctx.overall_score}/100. No critical issues found.`;
  }
  return `Your site scored ${ctx.overall_score}/100. The biggest issue: ${top.rule.title}.`;
}

export function websiteAuditDeliveryHTML(ctx: WebsiteAuditEmailContext): string {
  const headline = renderWebsiteHeadline(ctx);
  const topList = ctx.top_issues
    .slice(0, 3)
    .map(
      (t) =>
        `<li style="margin: 6px 0; color: #1f2937;"><strong>${escapeHtml(t.rule.title)}</strong> &mdash; ${escapeHtml(t.rule.recommendation)}</li>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 24px;">
    <h1 style="color: #111827; font-size: 22px; margin-bottom: 16px;">Your Website Audit, ${escapeHtml(ctx.dealership_name)}</h1>
    <p>Hi ${escapeHtml(ctx.contact_name)},</p>
    <p>Your 4-page Website Audit is attached. Here is the headline:</p>
    <p style="background-color: #f3f4f6; padding: 16px; border-left: 4px solid #2563eb; margin: 16px 0; color: #111827;"><strong>${escapeHtml(headline)}</strong></p>
    ${topList ? `<p style="margin: 16px 0;">Top issues to address:</p><ul style="padding-left: 20px;">${topList}</ul>` : ""}
    <p style="margin: 24px 0;">
      <a href="${escapeAttr(ctx.pdf_url)}" style="background-color: #2563eb; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Open the audit PDF</a>
    </p>
    <p>When you are ready, we will walk through what a full Wolfpack Dealer Excellence Program engagement looks like:</p>
    <p style="margin: 16px 0;">
      <a href="${escapeAttr(ctx.demo_booking_url)}" style="color: #2563eb; text-decoration: underline;">${escapeAttr(ctx.demo_booking_url)}</a>
    </p>
    <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">Audit prepared from ${escapeHtml(ctx.website_url)}. No data was pooled with any other dealer.</p>
  </body>
</html>`;
}

export function websiteAuditDeliveryText(ctx: WebsiteAuditEmailContext): string {
  const headline = renderWebsiteHeadline(ctx);
  const topList = ctx.top_issues
    .slice(0, 3)
    .map((t, i) => `${i + 1}. ${t.rule.title}: ${t.rule.recommendation}`)
    .join("\n");
  return [
    `Your Website Audit, ${ctx.dealership_name}`,
    "",
    `Hi ${ctx.contact_name},`,
    "",
    "Your 4-page Website Audit is attached.",
    "",
    headline,
    "",
    topList ? `Top issues:\n${topList}\n` : "",
    `Open the audit PDF: ${ctx.pdf_url}`,
    "",
    `Book a Dealer Excellence Program conversation: ${ctx.demo_booking_url}`,
    "",
    `Audit prepared from ${ctx.website_url}. No data pooled.`,
  ].join("\n");
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
