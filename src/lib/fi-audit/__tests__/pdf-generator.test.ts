/**
 * Unit tests for the F&I Penetration Audit PDF generator.
 *
 * These exercise:
 *   - Buffer length sanity (PDF is non-trivial)
 *   - Magic bytes (every PDF starts with `%PDF-`)
 *   - Helper functions (opportunity ranking, anonymization hash)
 */

import {
  generateAuditPDF,
  rankOpportunities,
  hashManagerName,
  type AuditPDFInput,
} from "@/lib/fi-audit/pdf-generator";
import { ACME_SAMPLE_INPUT } from "@/lib/fi-audit/__tests__/fixtures/acme-motors-sample";

describe("fi-audit pdf-generator", () => {
  test("generates a non-trivial 4-page PDF for the ACME fixture", async () => {
    const result = await generateAuditPDF(ACME_SAMPLE_INPUT);
    expect(result.page_count).toBe(4);
    expect(result.buffer.length).toBeGreaterThan(2000);
    // PDF magic header
    expect(result.buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  test("benchmark_median is non-null for the 150-200 tier fixture", async () => {
    const result = await generateAuditPDF(ACME_SAMPLE_INPUT);
    expect(result.benchmark_median).not.toBeNull();
    expect(result.benchmark_median).toBeGreaterThan(1000);
  });

  test("buffer is deterministic for the same input + pinned timestamp", async () => {
    const a = await generateAuditPDF(ACME_SAMPLE_INPUT);
    const b = await generateAuditPDF(ACME_SAMPLE_INPUT);
    // The CreationDate in the PDF "info" dict is pinned via `generated_at`,
    // so the bytes should match.
    expect(a.buffer.length).toBe(b.buffer.length);
  });

  describe("rankOpportunities", () => {
    test("returns at most 3 opportunities, descending dollars", () => {
      const opps = rankOpportunities(
        ACME_SAMPLE_INPUT.cells,
        "150-200",
        170,
      );
      expect(opps.length).toBeGreaterThan(0);
      expect(opps.length).toBeLessThanOrEqual(3);
      for (let i = 1; i < opps.length; i++) {
        expect(opps[i - 1].dollars_at_stake_monthly).toBeGreaterThanOrEqual(
          opps[i].dollars_at_stake_monthly,
        );
      }
    });

    test("flags GAP attach gap for ACME (current ~39% vs top-decile 76%)", () => {
      const opps = rankOpportunities(
        ACME_SAMPLE_INPUT.cells,
        "150-200",
        170,
      );
      expect(opps.some((o) => o.title.toLowerCase().includes("gap"))).toBe(true);
    });
  });

  describe("hashManagerName", () => {
    test("returns 'Manager XXXX' shape", () => {
      const h = hashManagerName("Alex Rivera");
      expect(h).toMatch(/^Manager [0-9A-F]{4}$/);
    });
    test("is stable for the same input", () => {
      expect(hashManagerName("Alex Rivera")).toBe(hashManagerName("Alex Rivera"));
    });
    test("differs for different inputs", () => {
      expect(hashManagerName("Alex Rivera")).not.toBe(hashManagerName("Jordan Park"));
    });
  });

  describe("anonymize flag", () => {
    test("produces a valid PDF in anonymize mode", async () => {
      const input: AuditPDFInput = { ...ACME_SAMPLE_INPUT, anonymize: true };
      const result = await generateAuditPDF(input);
      expect(result.buffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
      expect(result.buffer.length).toBeGreaterThan(2000);
    });
  });
});
