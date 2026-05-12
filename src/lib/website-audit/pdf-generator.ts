/**
 * Website Audit — 4-page PDF generator.
 *
 * Mirrors the F&I Audit shape so that visual quality is consistent across
 * both engagement-opener artifacts. The output goes to a prospect, not a
 * customer, so it must look like a paid consulting product.
 *
 * Pages:
 *   1. Executive summary (overall score + top 3 issues)
 *   2. Performance + mobile scorecard (Lighthouse-style metrics)
 *   3. Conversion funnel + inventory presentation
 *   4. Recommendations + Dealer Excellence Program CTA
 *
 * Deterministic: same input + pinned generated_at -> byte-identical buffer.
 *
 * pdfkit is already a runtime dep (added for the F&I Audit). We re-use it.
 */

import type { ScanResult } from "@/lib/website-audit/scanner";
import type { LighthouseResult } from "@/lib/website-audit/lighthouse-runner";
import type { TriggeredRule } from "@/lib/website-audit/patterns";

/* ------------------------------------------------------------------ */
/*  Brand                                                              */
/* ------------------------------------------------------------------ */

export const WOLFPACK_BRAND_WA = {
  primaryColor: "#2563eb",
  textColor: "#111827",
  mutedColor: "#6b7280",
  dividerColor: "#e5e7eb",
  wordmark: "WOLFPACK AUTO",
  contactUrl: "https://wolfpackauto.com",
  defaultDemoUrl: "https://calendly.com/wolfpack-auto/dealer-excellence",
} as const;

/* ------------------------------------------------------------------ */
/*  Input                                                              */
/* ------------------------------------------------------------------ */

export interface WebsiteAuditPDFInput {
  dealership_name: string;
  contact_name: string;
  website_url: string;
  audit_label: string; // e.g., "May 2026"
  overall_score: number;
  triggered: TriggeredRule[];
  scan: ScanResult;
  lighthouse: LighthouseResult;
  generated_at?: Date;
  demo_url?: string;
}

export interface GenerateWebsiteAuditPDFResult {
  buffer: Buffer;
  page_count: number;
  overall_score: number;
}

/* ------------------------------------------------------------------ */
/*  pdfkit shim                                                        */
/* ------------------------------------------------------------------ */

interface PDFDocLike {
  on: (event: "data" | "end", cb: (chunk?: Buffer) => void) => void;
  fontSize: (n: number) => PDFDocLike;
  fillColor: (color: string) => PDFDocLike;
  text: (
    s: string,
    xOrOptions?: number | Record<string, unknown>,
    y?: number,
    options?: Record<string, unknown>,
  ) => PDFDocLike;
  moveDown: (lines?: number) => PDFDocLike;
  moveTo: (x: number, y: number) => PDFDocLike;
  lineTo: (x: number, y: number) => PDFDocLike;
  stroke: () => PDFDocLike;
  rect: (x: number, y: number, w: number, h: number) => PDFDocLike;
  fill: () => PDFDocLike;
  addPage: () => PDFDocLike;
  end: () => void;
  page: { width: number; height: number; margins: { top: number; bottom: number; left: number; right: number } };
  y: number;
}

interface PDFKitCtor {
  new (opts?: Record<string, unknown>): PDFDocLike;
}

function loadPDFKit(): PDFKitCtor {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("pdfkit") as unknown;
  return mod as PDFKitCtor;
}

/* ------------------------------------------------------------------ */
/*  Header / footer                                                    */
/* ------------------------------------------------------------------ */

function header(doc: PDFDocLike): void {
  const { left, right, top } = doc.page.margins;
  doc.fontSize(10).fillColor(WOLFPACK_BRAND_WA.mutedColor);
  doc.text(WOLFPACK_BRAND_WA.wordmark, left, top - 24, { align: "left" });
  doc.text("Website Audit", left, top - 24, {
    width: doc.page.width - left - right,
    align: "right",
  });
  doc.moveTo(left, top - 6).lineTo(doc.page.width - right, top - 6).stroke();
  doc.fillColor(WOLFPACK_BRAND_WA.textColor);
  doc.y = top;
}

function footer(doc: PDFDocLike, pageNumber: number): void {
  const { left, right, bottom } = doc.page.margins;
  const y = doc.page.height - bottom + 8;
  doc.fontSize(8).fillColor(WOLFPACK_BRAND_WA.mutedColor);
  doc.text(WOLFPACK_BRAND_WA.contactUrl, left, y, { align: "left" });
  doc.text(`Page ${pageNumber} of 4`, left, y, {
    width: doc.page.width - left - right,
    align: "right",
  });
  doc.fillColor(WOLFPACK_BRAND_WA.textColor);
}

/* ------------------------------------------------------------------ */
/*  Pages                                                              */
/* ------------------------------------------------------------------ */

function renderPage1Summary(doc: PDFDocLike, input: WebsiteAuditPDFInput): void {
  header(doc);
  doc.fontSize(22).fillColor(WOLFPACK_BRAND_WA.textColor)
    .text("Website Audit", { align: "left" })
    .moveDown(0.25);
  doc.fontSize(14).fillColor(WOLFPACK_BRAND_WA.mutedColor)
    .text(input.dealership_name)
    .text(`Prepared for ${input.contact_name}`)
    .text(`Audit period: ${input.audit_label}`)
    .text(`Site scanned: ${input.website_url}`);
  doc.moveDown();

  doc.fontSize(28).fillColor(WOLFPACK_BRAND_WA.primaryColor)
    .text(`${input.overall_score}/100`, { align: "left" });
  doc.fontSize(12).fillColor(WOLFPACK_BRAND_WA.mutedColor)
    .text("Overall Website Score")
    .moveDown();

  doc.fillColor(WOLFPACK_BRAND_WA.textColor);
  doc.fontSize(13).text("Top three issues to address", { underline: false }).moveDown(0.5);
  doc.fontSize(11);
  const top = input.triggered.slice(0, 3);
  if (top.length === 0) {
    doc.text(
      "No critical issues were detected by our deterministic rule set. Strong baseline; consider continuous-monitoring options.",
    );
  } else {
    top.forEach((t, idx) => {
      doc.fillColor(WOLFPACK_BRAND_WA.primaryColor)
        .text(`${idx + 1}. ${t.rule.title} (${t.severity})`)
        .fillColor(WOLFPACK_BRAND_WA.textColor)
        .text(`   ${t.rule.recommendation}`)
        .moveDown(0.5);
    });
  }
  footer(doc, 1);
}

function renderPage2PerfMobile(doc: PDFDocLike, input: WebsiteAuditPDFInput): void {
  doc.addPage();
  header(doc);
  doc.fontSize(18).fillColor(WOLFPACK_BRAND_WA.textColor)
    .text("Performance + Mobile Scorecard")
    .moveDown(0.5);
  doc.fontSize(10).fillColor(WOLFPACK_BRAND_WA.mutedColor)
    .text("What your visitor experiences in the first three seconds.")
    .moveDown();

  doc.fontSize(11).fillColor(WOLFPACK_BRAND_WA.textColor);
  if (input.lighthouse.available) {
    const l = input.lighthouse;
    doc.text(`Lighthouse performance score:  ${l.performance_score} / 100`);
    doc.text(`Largest Contentful Paint:      ${l.lcp_seconds.toFixed(2)} s`);
    doc.text(`Cumulative Layout Shift:       ${l.cls.toFixed(3)}`);
    doc.text(`Total Blocking Time:           ${Math.round(l.tbt_ms)} ms`);
    doc.text(`First Contentful Paint:        ${l.fcp_seconds.toFixed(2)} s`);
    doc.text(`Accessibility score:           ${l.accessibility_score} / 100`);
    doc.text(`SEO score:                     ${l.seo_score} / 100`);
  } else {
    doc.fillColor(WOLFPACK_BRAND_WA.mutedColor)
      .text(`Lighthouse scoring unavailable for this run (${input.lighthouse.reason}).`)
      .text(`Mobile + DOM probes still ran. See below.`);
    doc.fillColor(WOLFPACK_BRAND_WA.textColor);
  }
  doc.moveDown();

  // Mobile probe
  doc.fontSize(13).text("Mobile readiness").moveDown(0.3);
  doc.fontSize(11);
  doc.text(`Viewport meta present:         ${yn(input.scan.homepage.viewport_meta_present)}`);
  doc.text(`Horizontal scroll at 390 px:   ${yn(input.scan.homepage.mobile_has_horizontal_scroll)}`);
  doc.text(`Small tap targets count:       ${input.scan.homepage.small_tap_targets_count ?? "n/a"}`);
  doc.moveDown();

  doc.fontSize(13).text("Network footprint").moveDown(0.3);
  doc.fontSize(11);
  const n = input.scan.network;
  doc.text(`Requests on homepage:          ${n.request_count ?? "n/a"}`);
  doc.text(`Total bytes downloaded:        ${formatBytes(n.total_bytes)}`);
  doc.text(`Largest single resource:       ${formatBytes(n.largest_resource_bytes)}`);

  footer(doc, 2);
}

function renderPage3Conversion(doc: PDFDocLike, input: WebsiteAuditPDFInput): void {
  doc.addPage();
  header(doc);
  doc.fontSize(18).fillColor(WOLFPACK_BRAND_WA.textColor)
    .text("Conversion + Inventory Presentation")
    .moveDown(0.5);
  doc.fontSize(10).fillColor(WOLFPACK_BRAND_WA.mutedColor)
    .text("Where shoppers fall out of the funnel.")
    .moveDown();

  doc.fontSize(13).fillColor(WOLFPACK_BRAND_WA.textColor)
    .text("Homepage funnel readiness")
    .moveDown(0.3);
  doc.fontSize(11);
  const h = input.scan.homepage;
  doc.text(`Phone number visible:          ${yn(h.phone_visible)}`);
  doc.text(`Inventory link in nav:         ${yn(h.has_inventory_link)}`);
  doc.text(`Trade-in tool link:            ${yn(h.has_trade_in_link)}`);
  doc.text(`Financing / pre-qual link:     ${yn(h.has_financing_link)}`);
  doc.text(`Above-the-fold lead form:      ${yn(h.has_above_fold_cta)}`);
  doc.text(`Primary form field count:      ${h.primary_form_field_count}`);
  doc.text(`Third-party review widget:     ${yn(h.has_review_widget)}`);
  doc.moveDown();

  doc.fontSize(13).text("Inventory presentation (sampled VDPs)").moveDown(0.3);
  doc.fontSize(11);
  const samples = input.scan.vdp_samples;
  if (samples.length === 0) {
    doc.fillColor(WOLFPACK_BRAND_WA.mutedColor)
      .text("No VDP samples could be collected. The audit could not auto-discover inventory pages from the homepage navigation.")
      .fillColor(WOLFPACK_BRAND_WA.textColor);
  } else {
    const avgPhotos =
      samples.reduce((s, v) => s + (v.photo_count ?? 0), 0) / samples.length;
    const withSchema = samples.filter((v) => v.has_vehicle_schema).length;
    const withVideo = samples.filter((v) => v.has_video).length;
    const withHistory = samples.filter((v) => v.has_history_link).length;
    const withPrice = samples.filter((v) => v.price_visible).length;
    const withLazy = samples.filter((v) => v.photos_lazy_loaded).length;
    doc.text(`Samples taken:                 ${samples.length}`);
    doc.text(`Average photo count per VDP:   ${avgPhotos.toFixed(1)}`);
    doc.text(`VDPs with Vehicle schema:      ${withSchema}/${samples.length}`);
    doc.text(`VDPs with walkaround video:    ${withVideo}/${samples.length}`);
    doc.text(`VDPs with history link:        ${withHistory}/${samples.length}`);
    doc.text(`VDPs showing price clearly:    ${withPrice}/${samples.length}`);
    doc.text(`VDPs lazy-loading photos:      ${withLazy}/${samples.length}`);
  }

  footer(doc, 3);
}

function renderPage4Recommendations(doc: PDFDocLike, input: WebsiteAuditPDFInput): void {
  doc.addPage();
  header(doc);
  doc.fontSize(18).fillColor(WOLFPACK_BRAND_WA.textColor)
    .text("Recommendations")
    .moveDown(0.5);
  doc.fontSize(11);

  const triggered = input.triggered;
  if (triggered.length === 0) {
    doc.text(
      "No deterministic-rule issues fired. Strong baseline. Consider ongoing monitoring as your site is updated.",
    );
  } else {
    triggered.slice(0, 8).forEach((t, idx) => {
      doc.fillColor(WOLFPACK_BRAND_WA.primaryColor)
        .text(`${idx + 1}. ${t.rule.title} (${t.severity}, ${t.category})`)
        .fillColor(WOLFPACK_BRAND_WA.textColor)
        .text(`   Action: ${t.rule.recommendation}`)
        .text(`   Outcome: ${t.rule.expected_outcome}`)
        .moveDown(0.5);
    });
  }

  doc.moveDown(1).fontSize(12).fillColor(WOLFPACK_BRAND_WA.textColor)
    .text("The Wolfpack Dealer Excellence Program")
    .moveDown(0.3);
  doc.fontSize(10).fillColor(WOLFPACK_BRAND_WA.mutedColor)
    .text(
      "This audit is one of several engagement-opener artifacts in the Wolfpack Dealer Excellence Program. The full program closes the gaps surfaced here and ties measurable outcomes back to operations. Book a 30-minute conversation:",
    );
  doc.moveDown(0.5).fontSize(11).fillColor(WOLFPACK_BRAND_WA.primaryColor)
    .text(input.demo_url ?? WOLFPACK_BRAND_WA.defaultDemoUrl);

  doc.moveDown(2).fontSize(8).fillColor(WOLFPACK_BRAND_WA.mutedColor)
    .text(
      `Audit prepared from a deterministic scan of ${input.website_url}. Generated ${(input.generated_at ?? new Date()).toISOString().slice(0, 10)}.`,
    );

  footer(doc, 4);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function yn(b: boolean | undefined): string {
  return b === true ? "yes" : b === false ? "no" : "n/a";
}

function formatBytes(n: number | undefined): string {
  if (!n || !Number.isFinite(n)) return "n/a";
  if (n > 1_000_000) return `${(n / 1_000_000).toFixed(2)} MB`;
  if (n > 1_000) return `${(n / 1_000).toFixed(1)} KB`;
  return `${n} B`;
}

/* ------------------------------------------------------------------ */
/*  Public entrypoint                                                  */
/* ------------------------------------------------------------------ */

export async function generateWebsiteAuditPDF(
  input: WebsiteAuditPDFInput,
): Promise<GenerateWebsiteAuditPDFResult> {
  const PDFDocument = loadPDFKit();
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    info: {
      Title: `Website Audit — ${input.dealership_name}`,
      Author: "Wolfpack Auto",
      CreationDate: input.generated_at ?? new Date(),
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c) => {
    if (c) chunks.push(c);
  });
  const done = new Promise<void>((resolve) => {
    doc.on("end", () => resolve());
  });

  renderPage1Summary(doc, input);
  renderPage2PerfMobile(doc, input);
  renderPage3Conversion(doc, input);
  renderPage4Recommendations(doc, input);

  doc.end();
  await done;

  return {
    buffer: Buffer.concat(chunks),
    page_count: 4,
    overall_score: input.overall_score,
  };
}
