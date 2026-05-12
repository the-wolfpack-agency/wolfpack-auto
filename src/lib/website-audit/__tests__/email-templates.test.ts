/**
 * Unit tests for the Website Audit email templates.
 */

import {
  renderWebsiteHeadline,
  websiteAuditDeliveryHTML,
  websiteAuditDeliveryText,
  WEBSITE_AUDIT_EMAIL_SUBJECT,
} from "@/lib/website-audit/email-templates";
import type { TriggeredRule } from "@/lib/website-audit/patterns";

const fakeRule: TriggeredRule = {
  rule: {
    slug: "perf.lcp_too_slow",
    title: "Slow page load (LCP > 4s)",
    severity: "high",
    category: "perf",
    check: () => true,
    recommendation: "Compress photos and load them lazily.",
    expected_outcome: "VDPs load faster.",
  },
  slug: "perf.lcp_too_slow",
  severity: "high",
  category: "perf",
};

const baseCtx = {
  contact_name: "Sample Manager",
  dealership_name: "ACME Motors",
  website_url: "https://acme.example",
  overall_score: 62,
  top_issues: [fakeRule],
  pdf_url: "https://media.example/audit.pdf",
  demo_booking_url: "https://calendly.com/wolfpack-auto/dealer-excellence",
};

describe("email templates", () => {
  test("subject is non-empty", () => {
    expect(WEBSITE_AUDIT_EMAIL_SUBJECT.length).toBeGreaterThan(5);
  });

  test("headline mentions score + top issue title", () => {
    const h = renderWebsiteHeadline({ overall_score: 62, top_issues: [fakeRule] });
    expect(h).toContain("62");
    expect(h).toContain("Slow page load");
  });

  test("headline tone flips when no triggered issues", () => {
    const h = renderWebsiteHeadline({ overall_score: 95, top_issues: [] });
    expect(h).toContain("95");
    expect(h.toLowerCase()).toContain("no critical");
  });

  test("HTML contains escaped dealership and the PDF link", () => {
    const html = websiteAuditDeliveryHTML(baseCtx);
    expect(html).toContain("ACME Motors");
    expect(html).toContain("https://media.example/audit.pdf");
    expect(html.toLowerCase()).toContain("<html>");
  });

  test("text version contains the rule title + outcome action", () => {
    const text = websiteAuditDeliveryText(baseCtx);
    expect(text).toContain("ACME Motors");
    expect(text).toContain("Slow page load");
    expect(text).toContain("https://media.example/audit.pdf");
  });

  test("HTML escapes HTML metacharacters in dealership name", () => {
    const html = websiteAuditDeliveryHTML({
      ...baseCtx,
      dealership_name: "<script>",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
