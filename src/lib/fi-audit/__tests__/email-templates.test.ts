/**
 * Unit tests for fi-audit email-templates.
 */

import {
  AUDIT_EMAIL_SUBJECT,
  auditDeliveryHTML,
  auditDeliveryText,
  renderHeadline,
  type AuditEmailContext,
} from "@/lib/fi-audit/email-templates";

const BASE_CTX: AuditEmailContext = {
  contact_name: "Alex Rivera",
  dealership_name: "ACME Motors",
  avg_gross_per_deal: 1420,
  benchmark_median: 1820,
  gap_per_deal: 400,
  monthly_volume: 170,
  pdf_url: "https://example.com/audit.pdf",
  demo_booking_url: "https://calendly.com/wolfpack-auto/dos-demo",
};

describe("fi-audit email-templates", () => {
  test("subject matches the spec wording", () => {
    expect(AUDIT_EMAIL_SUBJECT).toBe("Your F&I Penetration Audit is ready");
  });

  describe("renderHeadline", () => {
    test("gap > 0 surfaces the gap number", () => {
      const out = renderHeadline(BASE_CTX);
      expect(out).toContain("$1,420");
      expect(out).toContain("$1,820");
      expect(out).toContain("Gap: $400");
    });

    test("gap <= 0 flips to 'above benchmark' phrasing", () => {
      const out = renderHeadline({
        ...BASE_CTX,
        avg_gross_per_deal: 2100,
        benchmark_median: 1820,
        gap_per_deal: -280,
      });
      expect(out).toContain("above benchmark");
      expect(out).toContain("$280");
    });
  });

  describe("auditDeliveryHTML", () => {
    test("includes dealership name + contact name escaped", () => {
      const html = auditDeliveryHTML(BASE_CTX);
      expect(html).toContain("ACME Motors");
      expect(html).toContain("Alex Rivera");
      expect(html).toContain("Open the audit PDF");
      expect(html).toContain("calendly.com/wolfpack-auto/dos-demo");
    });

    test("escapes HTML in dealership name", () => {
      const html = auditDeliveryHTML({
        ...BASE_CTX,
        dealership_name: "<script>alert(1)</script> Motors",
      });
      expect(html).not.toContain("<script>alert(1)");
      expect(html).toContain("&lt;script&gt;");
    });
  });

  describe("auditDeliveryText", () => {
    test("plain text contains headline + URLs", () => {
      const text = auditDeliveryText(BASE_CTX);
      expect(text).toContain("Your F&I Penetration Audit");
      expect(text).toContain("https://example.com/audit.pdf");
      expect(text).toContain("calendly.com/wolfpack-auto/dos-demo");
    });
  });
});
