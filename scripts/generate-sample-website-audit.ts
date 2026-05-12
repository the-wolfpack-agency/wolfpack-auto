/**
 * Generate the public sample Website Audit PDF.
 *
 * Writes `public/sample-website-audit.pdf` from the ACME Motors fixture at
 * `src/lib/website-audit/__tests__/fixtures/acme-website-sample.ts`.
 *
 * Invocation:
 *   npx tsx scripts/generate-sample-website-audit.ts
 *
 * Re-run after any change to the PDF generator or fixture. The output is
 * committed to the repo so it's reachable at build time.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { generateWebsiteAuditPDF } from "../src/lib/website-audit/pdf-generator";
import { ACME_WEBSITE_SAMPLE_INPUT } from "../src/lib/website-audit/__tests__/fixtures/acme-website-sample";

async function main(): Promise<void> {
  const result = await generateWebsiteAuditPDF(ACME_WEBSITE_SAMPLE_INPUT);
  const outDir = path.resolve(__dirname, "..", "public");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "sample-website-audit.pdf");
  await fs.writeFile(outPath, result.buffer);
  console.log(
    `[generate-sample-website-audit] Wrote ${outPath} (${result.buffer.length} bytes, ${result.page_count} pages, overall_score ${result.overall_score})`,
  );
}

main().catch((err) => {
  console.error("[generate-sample-website-audit] Failed:", err);
  process.exit(1);
});
