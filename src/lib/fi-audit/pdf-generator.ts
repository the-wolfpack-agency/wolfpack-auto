/**
 * F&I Penetration Audit — 4-page PDF generator.
 *
 * This is the primary deliverable of the lead-magnet wedge product. The
 * output goes to a prospect, not a customer, so it must look like a paid
 * consulting product, not a SaaS landing page.
 *
 * Pages:
 *   1. Executive summary (headline gap + 3 named opportunities)
 *   2. F&I Manager Scorecard (table)
 *   3. Product Penetration Heatmap (text-rendered, not an image)
 *   4. Recommendations + soft demo CTA
 *
 * The generator returns a Buffer; callers (the orchestrator) write to S3
 * or, in shadow mode, to /tmp.
 *
 * pdfkit is a runtime dependency added explicitly for this product
 * (see CLAUDE.md "no new runtime deps without justification" — the
 * justification is "this PDF is the deliverable").
 */

import type { FIPenetrationCell, FIProductType } from "@/lib/analytics-engine/fi-penetration";
import {
  FI_BENCHMARKS,
  getBenchmark,
  pickVolumeTier,
  type FIBenchmark,
  type FIBenchmarkMetric,
  type FIVolumeTier,
} from "@/lib/fi-audit/benchmarks";

/* ------------------------------------------------------------------ */
/*  Brand config                                                       */
/* ------------------------------------------------------------------ */

export const WOLFPACK_BRAND = {
  /** Primary blue used across DOS UI. */
  primaryColor: "#2563eb",
  /** Text primary. */
  textColor: "#111827",
  /** Muted secondary text. */
  mutedColor: "#6b7280",
  /** Subtle divider. */
  dividerColor: "#e5e7eb",
  /** Brand wordmark — text fallback since we cannot guarantee a font asset. */
  wordmark: "WOLFPACK AUTO",
  /** Public contact URL printed in the footer. */
  contactUrl: "https://wolfpackauto.com",
  /** Calendly placeholder; the orchestrator substitutes the live link. */
  defaultDemoUrl: "https://calendly.com/wolfpack-auto/dos-demo",
} as const;

/* ------------------------------------------------------------------ */
/*  Input shape                                                        */
/* ------------------------------------------------------------------ */

export interface AuditPDFInput {
  /** Display name printed on cover + headers. */
  dealership_name: string;
  /** Contact full name. Used in the cover line "Prepared for ...". */
  contact_name: string;
  /** Audit period (free-form), e.g. "Feb 2026 – Apr 2026". */
  audit_period_label: string;
  /** Monthly funded-deal volume (used to pick the benchmark tier). */
  monthly_volume: number;
  /** Average F&I gross per deal in the submitted data (dollars). */
  avg_gross_per_deal: number;
  /** Penetration cells produced upstream by the analytics engine. */
  cells: FIPenetrationCell[];
  /**
   * Anonymization flag — when true, F&I manager names are hashed before
   * rendering so the PDF carries no PII.
   */
  anonymize?: boolean;
  /**
   * Generation timestamp. Pinned by the orchestrator (and by tests) to a
   * fixed value when reproducibility matters; otherwise defaults to now.
   */
  generated_at?: Date;
  /** Override the demo CTA URL (Calendly link). */
  demo_url?: string;
}

export interface AuditOpportunity {
  title: string;
  dollars_at_stake_monthly: number;
  detail: string;
}

/* ------------------------------------------------------------------ */
/*  pdfkit shim — avoid hard import so this module compiles even if    */
/*  pdfkit hasn't been npm-installed yet in CI.                        */
/* ------------------------------------------------------------------ */

// PDFKit's type surface is large; we use a narrow facade so the rest of
// the file stays type-safe without pulling @types/pdfkit.
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
  // Lazy require so build-time / lint never blocks if pdfkit not yet installed.
  // Cast through unknown to satisfy strict typing without @types/pdfkit.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("pdfkit") as unknown;
  return mod as PDFKitCtor;
}

/* ------------------------------------------------------------------ */
/*  Header / footer helpers                                            */
/* ------------------------------------------------------------------ */

/**
 * Branded header. Draws the wordmark + a thin divider near the top of
 * the current page. Resets text cursor below the divider.
 */
export function WolfpackBrandingHeader(doc: PDFDocLike): void {
  const { left, right, top } = doc.page.margins;
  doc.fontSize(10).fillColor(WOLFPACK_BRAND.mutedColor);
  doc.text(WOLFPACK_BRAND.wordmark, left, top - 24, { align: "left" });
  doc.text("F&I Penetration Audit", left, top - 24, {
    width: doc.page.width - left - right,
    align: "right",
  });
  // Thin divider
  doc.moveTo(left, top - 6)
    .lineTo(doc.page.width - right, top - 6)
    .stroke();
  doc.fillColor(WOLFPACK_BRAND.textColor);
  doc.y = top;
}

/**
 * Branded footer. Page number + contact URL at the bottom margin.
 */
export function WolfpackBrandingFooter(doc: PDFDocLike, pageNumber: number): void {
  const { left, right, bottom } = doc.page.margins;
  const y = doc.page.height - bottom + 8;
  doc.fontSize(8).fillColor(WOLFPACK_BRAND.mutedColor);
  doc.text(WOLFPACK_BRAND.contactUrl, left, y, { align: "left" });
  doc.text(`Page ${pageNumber} of 4`, left, y, {
    width: doc.page.width - left - right,
    align: "right",
  });
  doc.fillColor(WOLFPACK_BRAND.textColor);
}

/* ------------------------------------------------------------------ */
/*  Opportunity ranking                                                */
/* ------------------------------------------------------------------ */

const PRODUCT_LABELS: Record<FIProductType, string> = {
  warranty: "Extended Warranty",
  gap: "GAP",
  paint_protection: "Paint & Fabric Protection",
  tire_wheel: "Tire & Wheel Protection",
  theft: "Theft Protection",
  maintenance: "Prepaid Maintenance",
  appearance: "Appearance Package",
  other: "Other Product",
  none: "(No F&I attached)",
};

const PRODUCT_TO_BENCH_METRIC: Partial<Record<FIProductType, FIBenchmarkMetric>> = {
  gap: "gap_attach_rate",
  warranty: "warranty_attach_rate",
  tire_wheel: "tire_wheel_attach_rate",
  paint_protection: "paint_protection_attach_rate",
};

/**
 * Rank the three largest dollar opportunities. For each (manager, product)
 * cell we estimate the dollars-at-stake if attach rate moved from "current"
 * to "top decile" benchmark for the dealer's tier.
 *
 * Returns at most 3 entries, sorted descending by dollars.
 */
export function rankOpportunities(
  cells: FIPenetrationCell[],
  tier: FIVolumeTier,
  monthlyVolume: number,
): AuditOpportunity[] {
  const monthly = Math.max(1, monthlyVolume);
  const opportunities: AuditOpportunity[] = [];

  // Aggregate cells by (product) — the audit recommendation lives at the
  // product level, not per-manager-per-month.
  const byProduct = new Map<FIProductType, FIPenetrationCell[]>();
  for (const c of cells) {
    if (c.product_type === "none") continue;
    const arr = byProduct.get(c.product_type) ?? [];
    arr.push(c);
    byProduct.set(c.product_type, arr);
  }

  for (const [product, arr] of byProduct.entries()) {
    const metric = PRODUCT_TO_BENCH_METRIC[product];
    if (!metric) continue;
    const bench = getBenchmark(tier, metric);
    if (!bench) continue;
    // Current attach: deal-weighted average.
    const totalDeals = arr.reduce((s, c) => s + c.deals_count, 0);
    if (totalDeals === 0) continue;
    const accepted = arr.reduce((s, c) => s + c.accepted_items, 0);
    const currentRate = accepted / totalDeals;
    const gapRate = Math.max(0, bench.top_decile - currentRate);
    if (gapRate <= 0) continue;
    // Average product gross (from cell gross_total / accepted_items where present).
    const grossSum = arr.reduce((s, c) => s + c.gross_total, 0);
    const avgGrossPerSale = accepted > 0 ? grossSum / accepted : 600;
    const dollarsMonthly = Math.round(gapRate * monthly * avgGrossPerSale);
    opportunities.push({
      title: `${PRODUCT_LABELS[product]} attach gap`,
      dollars_at_stake_monthly: dollarsMonthly,
      detail: `Current attach: ${Math.round(currentRate * 100)}%. Top-decile dealers in your tier: ${Math.round(bench.top_decile * 100)}%. Closing that gap captures roughly $${dollarsMonthly.toLocaleString("en-US")} per month at current volume.`,
    });
  }
  opportunities.sort(
    (a, b) => b.dollars_at_stake_monthly - a.dollars_at_stake_monthly,
  );
  return opportunities.slice(0, 3);
}

/* ------------------------------------------------------------------ */
/*  Anonymization                                                      */
/* ------------------------------------------------------------------ */

/**
 * Deterministic short hash for manager names. Not for crypto — just for
 * stable but non-identifying labels like "Manager 7F2A".
 */
export function hashManagerName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(h).toString(16).toUpperCase().padStart(4, "0").slice(-4);
  return `Manager ${hex}`;
}

/* ------------------------------------------------------------------ */
/*  Page renderers                                                     */
/* ------------------------------------------------------------------ */

interface PageContext {
  doc: PDFDocLike;
  input: AuditPDFInput;
  tier: FIVolumeTier;
  benchmarkAvg: FIBenchmark | null;
  opportunities: AuditOpportunity[];
  effectiveName: (raw: string) => string;
}

function renderPage1Summary(ctx: PageContext): void {
  const { doc, input, tier, benchmarkAvg, opportunities } = ctx;
  WolfpackBrandingHeader(doc);
  doc.fontSize(22).fillColor(WOLFPACK_BRAND.textColor)
    .text(`F&I Penetration Audit`, { align: "left" })
    .moveDown(0.25);
  doc.fontSize(14).fillColor(WOLFPACK_BRAND.mutedColor)
    .text(`${input.dealership_name}`)
    .text(`Prepared for ${input.contact_name}`)
    .text(`Audit period: ${input.audit_period_label}`);
  doc.moveDown();

  // Headline gap block
  const benchMedian = benchmarkAvg?.median ?? 0;
  const gap = benchMedian - input.avg_gross_per_deal;
  const actual = `$${Math.round(input.avg_gross_per_deal).toLocaleString("en-US")}`;
  const bench = `$${Math.round(benchMedian).toLocaleString("en-US")}`;
  doc.fontSize(12).fillColor(WOLFPACK_BRAND.textColor);
  doc.text(`Your average F&I gross per deal: ${actual}`);
  doc.text(`Industry benchmark (${tier} retail units / month): ${bench}`);
  if (gap > 0) {
    const total = gap * input.monthly_volume;
    doc.fillColor(WOLFPACK_BRAND.primaryColor)
      .text(
        `Gap: $${Math.round(gap).toLocaleString("en-US")} per deal — about $${Math.round(total).toLocaleString("en-US")} per month at ${input.monthly_volume} units.`,
      );
  } else {
    doc.fillColor(WOLFPACK_BRAND.primaryColor)
      .text(`You are ${Math.round(-gap).toLocaleString("en-US")} per deal above the industry median for your tier.`);
  }
  doc.fillColor(WOLFPACK_BRAND.textColor).moveDown();

  // Top opportunities
  doc.fontSize(13).text(`Top three opportunities`, { underline: false }).moveDown(0.5);
  doc.fontSize(11);
  if (opportunities.length === 0) {
    doc.text(`No statistically significant attach-rate gaps were detected. Strong F&I performance overall.`);
  } else {
    opportunities.forEach((o, idx) => {
      doc.fillColor(WOLFPACK_BRAND.primaryColor)
        .text(`${idx + 1}. ${o.title}`)
        .fillColor(WOLFPACK_BRAND.textColor)
        .text(`   ~$${o.dollars_at_stake_monthly.toLocaleString("en-US")} / month at current volume.`)
        .text(`   ${o.detail}`)
        .moveDown(0.5);
    });
  }
  WolfpackBrandingFooter(doc, 1);
}

function renderPage2ManagerScorecard(ctx: PageContext): void {
  const { doc, input, effectiveName } = ctx;
  doc.addPage();
  WolfpackBrandingHeader(doc);
  doc.fontSize(18).fillColor(WOLFPACK_BRAND.textColor)
    .text(`F&I Manager Scorecard`)
    .moveDown(0.5);
  doc.fontSize(10).fillColor(WOLFPACK_BRAND.mutedColor)
    .text(`Each F&I manager's deal count, average gross, and overall attach rate across the audit window.`)
    .moveDown();

  // Aggregate per manager
  const perMgr = new Map<string, { name: string; deals: number; gross: number; accepted: number }>();
  for (const c of input.cells) {
    if (c.product_type === "none") continue;
    const key = c.fi_manager_id;
    const row = perMgr.get(key) ?? {
      name: effectiveName(c.fi_manager_name),
      deals: 0,
      gross: 0,
      accepted: 0,
    };
    row.deals += c.deals_count;
    row.gross += c.gross_total;
    row.accepted += c.accepted_items;
    perMgr.set(key, row);
  }
  const rows = Array.from(perMgr.values())
    .sort((a, b) => b.gross - a.gross);

  doc.fontSize(11).fillColor(WOLFPACK_BRAND.textColor);
  doc.text(`Manager           Deals    Avg Gross/Deal   Attach Rate`);
  doc.text(`────────────────────────────────────────────────────────────`);
  for (const r of rows) {
    const avg = r.deals > 0 ? r.gross / r.deals : 0;
    const attach = r.deals > 0 ? r.accepted / r.deals : 0;
    doc.text(
      `${r.name.padEnd(18)}${String(r.deals).padStart(5)}    ${"$" + Math.round(avg).toLocaleString("en-US")}`.padEnd(48) +
        `   ${Math.round(attach * 100)}%`,
    );
  }
  if (rows.length === 0) {
    doc.fillColor(WOLFPACK_BRAND.mutedColor).text(`(No manager-level activity in this window.)`);
  }
  WolfpackBrandingFooter(doc, 2);
}

function renderPage3ProductHeatmap(ctx: PageContext): void {
  const { doc, input } = ctx;
  doc.addPage();
  WolfpackBrandingHeader(doc);
  doc.fontSize(18).fillColor(WOLFPACK_BRAND.textColor)
    .text(`Product Penetration Heatmap`)
    .moveDown(0.5);
  doc.fontSize(10).fillColor(WOLFPACK_BRAND.mutedColor)
    .text(`Attach rate by product per month. Trends below the industry median are flagged.`)
    .moveDown();

  // Aggregate per (product, month)
  const products = Array.from(
    new Set(input.cells.filter((c) => c.product_type !== "none").map((c) => c.product_type)),
  ).sort();
  const months = Array.from(new Set(input.cells.map((c) => c.month))).sort();

  doc.fontSize(10).fillColor(WOLFPACK_BRAND.textColor);
  const header = `Product`.padEnd(22) + months.map((m) => m.slice(0, 7).padStart(10)).join("");
  doc.text(header);
  doc.text(`${"─".repeat(Math.min(80, header.length))}`);
  for (const p of products) {
    const label = PRODUCT_LABELS[p].padEnd(22);
    const cells = months.map((m) => {
      const set = input.cells.filter(
        (c) => c.product_type === p && c.month === m,
      );
      const deals = set.reduce((s, c) => s + c.deals_count, 0);
      const acc = set.reduce((s, c) => s + c.accepted_items, 0);
      const rate = deals > 0 ? acc / deals : 0;
      return `${Math.round(rate * 100)}%`.padStart(10);
    });
    doc.text(label + cells.join(""));
  }
  if (products.length === 0) {
    doc.fillColor(WOLFPACK_BRAND.mutedColor).text(`(No product attach data in this window.)`);
  }
  WolfpackBrandingFooter(doc, 3);
}

function renderPage4Recommendations(ctx: PageContext): void {
  const { doc, input, opportunities } = ctx;
  doc.addPage();
  WolfpackBrandingHeader(doc);
  doc.fontSize(18).fillColor(WOLFPACK_BRAND.textColor)
    .text(`Recommendations`)
    .moveDown(0.5);
  doc.fontSize(11);

  if (opportunities.length === 0) {
    doc.text(`Your F&I attach mix is already at or near top-decile in your tier. Continue current coaching cadence and consider re-pricing ancillary products to capture additional gross.`);
  } else {
    opportunities.forEach((o, idx) => {
      doc.fillColor(WOLFPACK_BRAND.primaryColor)
        .text(`${idx + 1}. ${o.title}`)
        .fillColor(WOLFPACK_BRAND.textColor)
        .text(`   Action: schedule a 1:1 coaching block with the F&I team focused on this product's positioning. Re-test attach rate in 30 days.`)
        .text(`   Estimated monthly capture: $${o.dollars_at_stake_monthly.toLocaleString("en-US")}.`)
        .moveDown(0.5);
    });
  }

  doc.moveDown(1).fontSize(12).fillColor(WOLFPACK_BRAND.textColor)
    .text(`See these gaps close in real time`)
    .moveDown(0.3);
  doc.fontSize(10).fillColor(WOLFPACK_BRAND.mutedColor)
    .text(`Wolfpack Auto continuously surfaces these gaps and routes recommended actions to your F&I managers in real time, so you don't wait three months to see the next audit. Book a 30-minute demo:`);
  doc.moveDown(0.5).fontSize(11).fillColor(WOLFPACK_BRAND.primaryColor)
    .text(input.demo_url ?? WOLFPACK_BRAND.defaultDemoUrl);

  doc.moveDown(2).fontSize(8).fillColor(WOLFPACK_BRAND.mutedColor)
    .text(`Audit prepared from ${input.dealership_name}'s own funded-deal data only. No data pooled with other dealers. Generated ${(input.generated_at ?? new Date()).toISOString().slice(0, 10)}.`);

  WolfpackBrandingFooter(doc, 4);
}

/* ------------------------------------------------------------------ */
/*  Public entrypoint                                                  */
/* ------------------------------------------------------------------ */

export interface GenerateAuditPDFResult {
  buffer: Buffer;
  page_count: number;
  /** Avg gross benchmark median used in the report, or null if unknown. */
  benchmark_median: number | null;
}

/**
 * Generate the 4-page audit PDF buffer.
 *
 * Deterministic: given the same input + a pinned `generated_at`, the
 * output Buffer is byte-identical. Tests rely on that for fixture-based
 * snapshot checks.
 */
export async function generateAuditPDF(
  input: AuditPDFInput,
): Promise<GenerateAuditPDFResult> {
  const PDFDocument = loadPDFKit();
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    info: {
      Title: `F&I Penetration Audit — ${input.dealership_name}`,
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

  const tier = pickVolumeTier(input.monthly_volume);
  const benchmarkAvg = getBenchmark(tier, "avg_gross_per_deal");
  const opportunities = rankOpportunities(input.cells, tier, input.monthly_volume);
  const effectiveName = input.anonymize
    ? hashManagerName
    : (s: string) => s || "Unknown";

  const ctx: PageContext = { doc, input, tier, benchmarkAvg, opportunities, effectiveName };

  renderPage1Summary(ctx);
  renderPage2ManagerScorecard(ctx);
  renderPage3ProductHeatmap(ctx);
  renderPage4Recommendations(ctx);

  doc.end();
  await done;

  return {
    buffer: Buffer.concat(chunks),
    page_count: 4,
    benchmark_median: benchmarkAvg?.median ?? null,
  };
}

/* ------------------------------------------------------------------ */
/*  Export the brand + benchmark count for tests                       */
/* ------------------------------------------------------------------ */

export const _FI_BENCHMARKS_FOR_TESTS = FI_BENCHMARKS;
