/**
 * PDF-generator smoke tests for the Website Audit.
 *
 * Asserts that the buffer is non-empty, that the PDF header magic bytes are
 * present, and that the 4-page artifact size is plausible.
 */

import { generateWebsiteAuditPDF } from "@/lib/website-audit/pdf-generator";
import { ACME_WEBSITE_SAMPLE_INPUT } from "@/lib/website-audit/__tests__/fixtures/acme-website-sample";

describe("generateWebsiteAuditPDF", () => {
  test("returns a non-empty PDF buffer with valid magic bytes", async () => {
    const r = await generateWebsiteAuditPDF(ACME_WEBSITE_SAMPLE_INPUT);
    expect(Buffer.isBuffer(r.buffer)).toBe(true);
    expect(r.buffer.length).toBeGreaterThan(2000);
    // PDF files start with "%PDF-"
    expect(r.buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
    expect(r.page_count).toBe(4);
    expect(typeof r.overall_score).toBe("number");
    expect(r.overall_score).toBeGreaterThanOrEqual(0);
    expect(r.overall_score).toBeLessThanOrEqual(100);
  });

  test("output has multiple compressed streams (one per page) and an %%EOF marker", async () => {
    const r = await generateWebsiteAuditPDF(ACME_WEBSITE_SAMPLE_INPUT);
    const ascii = r.buffer.toString("latin1");
    // pdfkit FlateDecode-compresses all content streams; we check the structure
    // and trailing marker, not raw text. One stream per page = 4.
    const streamMatches = ascii.match(/\/Filter\s+\/FlateDecode/g) ?? [];
    expect(streamMatches.length).toBeGreaterThanOrEqual(4);
    expect(ascii).toContain("%%EOF");
  });

  test("handles missing Lighthouse gracefully", async () => {
    const r = await generateWebsiteAuditPDF({
      ...ACME_WEBSITE_SAMPLE_INPUT,
      lighthouse: { available: false, reason: "lighthouse_not_installed", fetched_at: new Date().toISOString() },
    });
    expect(r.buffer.length).toBeGreaterThan(2000);
    expect(r.page_count).toBe(4);
  });
});
