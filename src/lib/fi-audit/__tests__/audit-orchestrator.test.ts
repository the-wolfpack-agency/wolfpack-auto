/**
 * Unit tests for the audit-orchestrator (shadow-mode happy path + edge
 * cases). Production DB writes are skipped because DATABASE_URL is unset
 * in this test environment.
 */

import {
  MIN_CSV_ROWS,
  generateAudit,
  parseAuditCSV,
  rowsToCells,
  validateCSVHeaders,
} from "@/lib/fi-audit/audit-orchestrator";

function buildCSV(rows: number, opts: { withGross?: boolean } = {}): string {
  const headers = opts.withGross
    ? "deal_id,fi_manager,funded_at,gap_attached,warranty_attached,gross"
    : "deal_id,fi_manager,funded_at,gap_attached,warranty_attached";
  const lines = [headers];
  for (let i = 0; i < rows; i++) {
    const manager = i % 2 === 0 ? "Alex" : "Jordan";
    const month = `2026-0${(i % 3) + 2}-15`;
    const gap = i % 3 === 0 ? "1" : "0";
    const warranty = i % 2 === 0 ? "1" : "0";
    if (opts.withGross) {
      lines.push(`D${i},${manager},${month},${gap},${warranty},${600 + i}`);
    } else {
      lines.push(`D${i},${manager},${month},${gap},${warranty}`);
    }
  }
  return lines.join("\n");
}

describe("fi-audit orchestrator — CSV parsing", () => {
  test("parses headers + row count", () => {
    const csv = buildCSV(40);
    const r = parseAuditCSV(csv);
    expect(r.row_count).toBe(40);
    expect(r.headers).toContain("deal_id");
    expect(r.headers).toContain("gap_attached");
  });

  test("detects gap + warranty product columns", () => {
    const csv = buildCSV(35);
    const r = parseAuditCSV(csv);
    const someAttached = r.rows.filter((row) => row.products.gap === 1);
    expect(someAttached.length).toBeGreaterThan(0);
  });

  test("parses gross dollars when present", () => {
    const csv = buildCSV(35, { withGross: true });
    const r = parseAuditCSV(csv);
    expect(r.rows[0].gross).toBeDefined();
    expect(typeof r.rows[0].gross).toBe("number");
  });
});

describe("fi-audit orchestrator — validateCSVHeaders", () => {
  test("accepts a well-formed header", () => {
    const out = validateCSVHeaders("deal_id,fi_manager,funded_at,gap_attached\nD1,A,2026-02-01,1");
    expect(out.ok).toBe(true);
  });
  test("rejects empty header", () => {
    expect(validateCSVHeaders("").ok).toBe(false);
  });
  test("rejects missing deal_id", () => {
    const out = validateCSVHeaders("manager,funded_at,gap\nA,2026-02-01,1");
    expect(out.ok).toBe(false);
    expect(out.reason).toContain("deal_id");
  });
  test("rejects missing fi_manager", () => {
    const out = validateCSVHeaders("deal_id,funded_at,gap\nD1,2026-02-01,1");
    expect(out.ok).toBe(false);
    expect(out.reason).toContain("fi_manager");
  });
  test("rejects missing date column", () => {
    const out = validateCSVHeaders("deal_id,fi_manager,gap\nD1,A,1");
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/funded_at|created_at/);
  });
  test("rejects when no product column found", () => {
    const out = validateCSVHeaders("deal_id,fi_manager,funded_at\nD1,A,2026-02-01");
    expect(out.ok).toBe(false);
    expect(out.reason).toContain("product");
  });
});

describe("fi-audit orchestrator — rowsToCells", () => {
  test("aggregates per (manager, product, month) with attach rates", () => {
    const r = parseAuditCSV(buildCSV(40));
    const cells = rowsToCells(r.rows);
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(c.attach_rate).toBeGreaterThanOrEqual(0);
      expect(c.attach_rate).toBeLessThanOrEqual(1);
      expect(c.deals_count).toBeGreaterThan(0);
    }
  });
});

describe("fi-audit orchestrator — generateAudit (shadow mode)", () => {
  const originalDbUrl = process.env.DATABASE_URL;
  beforeAll(() => {
    delete process.env.DATABASE_URL;
  });
  afterAll(() => {
    if (originalDbUrl) process.env.DATABASE_URL = originalDbUrl;
  });

  test("rejects CSVs with fewer than MIN_CSV_ROWS", async () => {
    const csv = buildCSV(MIN_CSV_ROWS - 5, { withGross: true });
    const result = await generateAudit("shadow-test-1", csv);
    expect(result.status).toBe("failed");
    expect(result.reason).toMatch(/Insufficient deals/);
  });

  test("happy path: delivers in shadow mode with sufficient CSV rows", async () => {
    const csv = buildCSV(45, { withGross: true });
    const result = await generateAudit("shadow-test-2", csv);
    expect(result.status).toBe("delivered");
    expect(result.pdf_url).toBeDefined();
    expect(result.summary_metrics).toBeDefined();
    expect(typeof result.summary_metrics?.avg_gross_per_deal).toBe("number");
  });
});
