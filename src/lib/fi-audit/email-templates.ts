/**
 * F&I Penetration Audit — outbound email templates.
 *
 * Audit-specific copy. Deliberately separate from `src/lib/email-templates.ts`
 * (which serves dealer-customer lead notifications) so naming never collides.
 *
 * The audit email goes to a PROSPECT, not a customer — tone is professional
 * but warm, no jargon, no claims we can't back up.
 */

export interface AuditEmailContext {
  contact_name: string;
  dealership_name: string;
  /** Average F&I gross per deal — dollars, no decimals. */
  avg_gross_per_deal: number;
  /** Industry median for the dealer's volume tier — dollars. */
  benchmark_median: number;
  /** Gap = (benchmark - actual), positive = below benchmark. Dollars. */
  gap_per_deal: number;
  /** Monthly deal count for projection. */
  monthly_volume: number;
  /** Public URL (signed S3 link or local fallback). */
  pdf_url: string;
  /** Calendly placeholder; replaced with real link in prod env. */
  demo_booking_url: string;
}

export const AUDIT_EMAIL_SUBJECT = "Your F&I Penetration Audit is ready";

/**
 * Render the headline gap sentence in plain English. Used in both the
 * email body and the page-1 PDF executive summary.
 *
 * If `gap_per_deal <= 0` (dealer is at or above benchmark) we flip the
 * tone — no manufactured urgency.
 */
export function renderHeadline(
  ctx: Pick<
    AuditEmailContext,
    "avg_gross_per_deal" | "benchmark_median" | "gap_per_deal"
  >,
): string {
  const actual = `$${Math.round(ctx.avg_gross_per_deal).toLocaleString("en-US")}`;
  const bench = `$${Math.round(ctx.benchmark_median).toLocaleString("en-US")}`;
  if (ctx.gap_per_deal <= 0) {
    const lead = `$${Math.round(-ctx.gap_per_deal).toLocaleString("en-US")}`;
    return `Your average F&I gross is ${actual}. Industry median for your volume tier is ${bench}. You are ${lead} per deal above benchmark.`;
  }
  const gap = `$${Math.round(ctx.gap_per_deal).toLocaleString("en-US")}`;
  return `Your average F&I gross is ${actual}. Industry median for your volume tier is ${bench}. Gap: ${gap} per deal.`;
}

/**
 * HTML body for the audit-delivery email.
 *
 * Inline styles only — Resend renders inline-style HTML reliably across
 * dealer mail systems (Outlook, Google Workspace, Apple).
 */
export function auditDeliveryHTML(ctx: AuditEmailContext): string {
  const headline = renderHeadline(ctx);
  const monthlyProjection =
    ctx.gap_per_deal > 0
      ? `<p style="margin: 16px 0; color: #1f2937;">Across your ~${ctx.monthly_volume} retail units a month, that gap totals ${"$" + Math.round(ctx.gap_per_deal * ctx.monthly_volume).toLocaleString("en-US")} per month.</p>`
      : "";

  return `<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 24px;">
    <h1 style="color: #111827; font-size: 22px; margin-bottom: 16px;">Your F&amp;I Penetration Audit, ${escapeHtml(ctx.dealership_name)}</h1>
    <p>Hi ${escapeHtml(ctx.contact_name)},</p>
    <p>Your 4-page F&amp;I Penetration Audit is attached. Here is the headline:</p>
    <p style="background-color: #f3f4f6; padding: 16px; border-left: 4px solid #2563eb; margin: 16px 0; color: #111827;"><strong>${escapeHtml(headline)}</strong></p>
    ${monthlyProjection}
    <p>The PDF breaks down where the gap lives by F&amp;I manager and by product, with three concrete actions you can take this month.</p>
    <p style="margin: 24px 0;">
      <a href="${escapeAttr(ctx.pdf_url)}" style="background-color: #2563eb; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Open the audit PDF</a>
    </p>
    <p>When you want to see how Wolfpack Auto closes the gap in real time, book a 30-minute demo:</p>
    <p style="margin: 16px 0;">
      <a href="${escapeAttr(ctx.demo_booking_url)}" style="color: #2563eb; text-decoration: underline;">${escapeAttr(ctx.demo_booking_url)}</a>
    </p>
    <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">We don't share your data. The audit was generated from your data alone; it was not pooled with any other dealer's.</p>
  </body>
</html>`;
}

/** Plain-text fallback for clients that strip HTML. */
export function auditDeliveryText(ctx: AuditEmailContext): string {
  const headline = renderHeadline(ctx);
  const monthly =
    ctx.gap_per_deal > 0
      ? `\nAcross ~${ctx.monthly_volume} retail units a month, that gap totals $${Math.round(ctx.gap_per_deal * ctx.monthly_volume).toLocaleString("en-US")} per month.\n`
      : "";
  return [
    `Your F&I Penetration Audit, ${ctx.dealership_name}`,
    "",
    `Hi ${ctx.contact_name},`,
    "",
    "Your 4-page F&I Penetration Audit is attached.",
    "",
    headline,
    monthly,
    `Open the audit PDF: ${ctx.pdf_url}`,
    "",
    `Book a 30-minute demo: ${ctx.demo_booking_url}`,
    "",
    "We don't share your data. The audit was generated from your data alone.",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
