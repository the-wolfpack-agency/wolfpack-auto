/**
 * E2E — F&I Penetration Audit lead-magnet flow.
 *
 * 1) Landing page renders.
 * 2) Sample PDF is reachable at /sample-fi-audit.pdf.
 * 3) Form submit (multipart) hits /api/audit-request and gets 200 with
 *    `{ id, status: 'pending' }`.
 *
 * Per CLAUDE.md "200 not 500" — we assert the explicit success status.
 */

import { test, expect } from "@playwright/test";

const PAGE_PATH = "/audits/fi-penetration";

function buildValidCSV(rows = 45): string {
  const lines = ["deal_id,fi_manager,funded_at,gap_attached,warranty_attached,gross"];
  for (let i = 0; i < rows; i++) {
    lines.push(`D${i},${i % 2 === 0 ? "Alex" : "Jordan"},2026-03-15,${i % 3 === 0 ? "1" : "0"},${i % 2 === 0 ? "1" : "0"},${600 + i}`);
  }
  return lines.join("\n");
}

test.describe("F&I Penetration Audit landing", () => {
  test("landing page renders the pitch + form + sample CTA", async ({ page }) => {
    const res = await page.goto(PAGE_PATH);
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("audit-landing-headline")).toBeVisible();
    await expect(page.getByTestId("audit-request-form")).toBeVisible();
    await expect(page.getByTestId("sample-audit-embed")).toBeVisible();
    await expect(page.getByTestId("sample-audit-link")).toHaveAttribute(
      "href",
      "/sample-fi-audit.pdf",
    );
  });

  test("sample PDF is reachable + has the PDF magic header", async ({ request }) => {
    const res = await request.get("/sample-fi-audit.pdf");
    expect(res.status()).toBe(200);
    const buf = await res.body();
    // %PDF- magic header
    expect(buf.slice(0, 5).toString("utf-8")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(5000);
  });

  test("POST /api/audit-request queues a run from a valid multipart payload", async ({
    request,
  }) => {
    const form = new FormData();
    form.append("dealership_name", "E2E Motors");
    form.append("contact_name", "E2E Tester");
    form.append("contact_email", `e2e+${Date.now()}@example.com`);
    form.append("rooftops_count", "1");
    const csv = buildValidCSV();
    form.append("csv_file", new Blob([csv], { type: "text/csv" }), "deals.csv");
    const res = await request.post("/api/audit-request", { multipart: {
      dealership_name: "E2E Motors",
      contact_name: "E2E Tester",
      contact_email: `e2e+${Date.now()}@example.com`,
      rooftops_count: "1",
      csv_file: {
        name: "deals.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv, "utf-8"),
      },
    } });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBeTruthy();
    expect(body.status).toBe("pending");
  });
});
