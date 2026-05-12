/**
 * Generate the public sample F&I Audit PDF.
 *
 * Writes `public/sample-fi-audit.pdf` from the ACME Motors fixture under
 * `src/lib/fi-audit/__tests__/fixtures/acme-motors-sample.ts`.
 *
 * Invocation:
 *   npm run generate:sample-fi-audit
 *
 * Re-run after any change to the PDF generator or fixture. The output is
 * committed to the repo so it's reachable at build time without depending
 * on a runtime generation step.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { generateAuditPDF } from "../src/lib/fi-audit/pdf-generator";
import { ACME_SAMPLE_INPUT } from "../src/lib/fi-audit/__tests__/fixtures/acme-motors-sample";

async function main(): Promise<void> {
  const result = await generateAuditPDF(ACME_SAMPLE_INPUT);
  const outDir = path.resolve(__dirname, "..", "public");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "sample-fi-audit.pdf");
  await fs.writeFile(outPath, result.buffer);
  console.log(
    `[generate-sample-fi-audit] Wrote ${outPath} (${result.buffer.length} bytes, ${result.page_count} pages)`,
  );
}

main().catch((err) => {
  console.error("[generate-sample-fi-audit] Failed:", err);
  process.exit(1);
});
