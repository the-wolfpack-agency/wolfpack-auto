/**
 * F&I Penetration Audit — orchestrator.
 *
 * Drives one audit run from "uploaded CSV" to "PDF emailed". Reads + writes
 * the `fi_audit_runs` table (migration 074), produces the PDF buffer via
 * `pdf-generator`, uploads to S3 (with /tmp fallback for shadow mode),
 * sends the delivery email via Resend, and emits typed analytics events
 * on every state transition.
 *
 * State machine:
 *   pending  -> processing  -> delivered
 *                          \-> failed
 *   delivered -> demo_booked -> converted   (handled by separate routes)
 */

import { trackFIAudit } from "@/lib/analytics-hooks";
import { auditLog } from "@/lib/audit-log";
import {
  generateAuditPDF,
  type AuditPDFInput,
} from "@/lib/fi-audit/pdf-generator";
import {
  AUDIT_EMAIL_SUBJECT,
  auditDeliveryHTML,
  auditDeliveryText,
  renderHeadline,
  type AuditEmailContext,
} from "@/lib/fi-audit/email-templates";
import {
  pickVolumeTier,
  getBenchmark,
} from "@/lib/fi-audit/benchmarks";
import type { FIPenetrationCell, FIProductType } from "@/lib/analytics-engine/fi-penetration";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/**
 * Minimum number of deal rows in the uploaded CSV for the audit to be
 * statistically meaningful. Below this the orchestrator marks the run
 * failed with a clear reason — we don't ship "your sample is too small,
 * here is a guess" PDFs.
 */
export const MIN_CSV_ROWS = 30;

/* ------------------------------------------------------------------ */
/*  CSV parsing                                                        */
/* ------------------------------------------------------------------ */

export interface ParsedAuditCSV {
  /** Total parsed rows (after the header). */
  row_count: number;
  /** Column headers found in the CSV (lower-cased). */
  headers: string[];
  /** Per-row product attach data — one entry per deal. */
  rows: AuditDealRow[];
}

export interface AuditDealRow {
  deal_id: string;
  fi_manager: string;
  funded_at: string; // ISO date string or empty
  /** Map of detected product columns -> 0/1 attached. */
  products: Partial<Record<FIProductType, number>>;
  /** Optional gross-profit dollars for the deal (if a column was found). */
  gross?: number;
}

/**
 * Minimal CSV parser tolerant to flexible column layouts. Required headers:
 *   - deal_id
 *   - fi_manager
 *   - funded_at or created_at
 * At least one product attach column must exist. Product column names are
 * mapped via heuristic match.
 */
export function parseAuditCSV(csv: string): ParsedAuditCSV {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { row_count: 0, headers: [], rows: [] };
  }
  const headers = splitCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const rows: AuditDealRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const get = (name: string): string => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (cols[idx] ?? "").trim() : "";
    };
    const dealId = get("deal_id") || get("deal") || `row-${i}`;
    const fiManager = get("fi_manager") || get("manager") || "Unknown";
    const funded = get("funded_at") || get("created_at") || "";
    const products: AuditDealRow["products"] = {};
    for (const [productKey, headerMatchers] of PRODUCT_HEADER_HEURISTICS) {
      for (const h of headers) {
        if (headerMatchers.some((m) => h.includes(m))) {
          const v = cols[headers.indexOf(h)] ?? "";
          if (v && v !== "0" && v.toLowerCase() !== "false" && v.toLowerCase() !== "no") {
            products[productKey] = 1;
          }
        }
      }
    }
    const grossStr = get("gross") || get("fi_gross") || get("backend_gross") || "";
    const gross = grossStr ? Number(grossStr.replace(/[$,]/g, "")) : undefined;
    rows.push({
      deal_id: dealId,
      fi_manager: fiManager,
      funded_at: funded,
      products,
      gross: Number.isFinite(gross) ? gross : undefined,
    });
  }
  return { row_count: rows.length, headers, rows };
}

/**
 * Header-pattern heuristics mapping product columns to canonical product
 * keys. Tolerant of common DMS export variants ("gap_attached", "GAP",
 * "warranty_sold", etc.).
 */
const PRODUCT_HEADER_HEURISTICS: Array<[FIProductType, string[]]> = [
  ["gap", ["gap"]],
  ["warranty", ["warranty", "vsc", "service_contract"]],
  ["tire_wheel", ["tire", "wheel"]],
  ["paint_protection", ["paint", "fabric"]],
  ["theft", ["theft", "etch"]],
  ["maintenance", ["maintenance", "ppm"]],
  ["appearance", ["appearance"]],
];

/** Split a single CSV line, honoring double-quoted fields. */
function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Basic structural validation — does the header row look like a deal CSV?
 * Used by the public POST route to reject malformed uploads BEFORE queuing.
 */
export function validateCSVHeaders(csv: string): {
  ok: boolean;
  reason?: string;
} {
  const head = csv.split(/\r?\n/, 1)[0] ?? "";
  const headers = splitCSVLine(head).map((h) => h.toLowerCase().trim());
  if (headers.length < 2) {
    return { ok: false, reason: "CSV header row missing or only one column" };
  }
  if (!headers.includes("deal_id") && !headers.includes("deal")) {
    return { ok: false, reason: "Required column missing: deal_id" };
  }
  if (!headers.includes("fi_manager") && !headers.includes("manager")) {
    return { ok: false, reason: "Required column missing: fi_manager" };
  }
  if (!headers.includes("funded_at") && !headers.includes("created_at")) {
    return { ok: false, reason: "Required column missing: funded_at or created_at" };
  }
  const hasProduct = PRODUCT_HEADER_HEURISTICS.some(([, m]) =>
    headers.some((h) => m.some((needle) => h.includes(needle))),
  );
  if (!hasProduct) {
    return { ok: false, reason: "No F&I product attach column detected" };
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  Cell synthesis                                                     */
/* ------------------------------------------------------------------ */

/**
 * Translate the parsed deal rows into the same FIPenetrationCell shape
 * the dashboard analytics engine produces. Single aggregated month if no
 * funded_at parses; otherwise month-bucketed.
 */
export function rowsToCells(rows: AuditDealRow[]): FIPenetrationCell[] {
  const byKey = new Map<
    string,
    { name: string; product: FIProductType; month: string; deals: Set<string>; accepted: number; gross: number }
  >();
  const allMonths = new Set<string>();
  for (const r of rows) {
    const month = monthBucket(r.funded_at);
    allMonths.add(month);
    const products = Object.keys(r.products) as FIProductType[];
    if (products.length === 0) {
      products.push("none");
    }
    for (const product of products) {
      const key = `${r.fi_manager}::${product}::${month}`;
      const slot = byKey.get(key) ?? {
        name: r.fi_manager,
        product,
        month,
        deals: new Set<string>(),
        accepted: 0,
        gross: 0,
      };
      slot.deals.add(r.deal_id);
      if (product !== "none") {
        slot.accepted += 1;
        // Distribute per-deal gross equally across attached products.
        const productCount = Math.max(1, products.length);
        slot.gross += (r.gross ?? 0) / productCount;
      }
      byKey.set(key, slot);
    }
  }
  const cells: FIPenetrationCell[] = [];
  // Total deals per (manager, month) for attach-rate denominator.
  const totalsByMgrMonth = new Map<string, number>();
  for (const [, slot] of byKey) {
    const k = `${slot.name}::${slot.month}`;
    totalsByMgrMonth.set(k, (totalsByMgrMonth.get(k) ?? 0) + slot.deals.size);
  }
  for (const [, slot] of byKey) {
    const denom = totalsByMgrMonth.get(`${slot.name}::${slot.month}`) ?? slot.deals.size;
    const attachRate = denom > 0 ? slot.deals.size / denom : 0;
    cells.push({
      fi_manager_id: slugId(slot.name),
      fi_manager_name: slot.name,
      product_type: slot.product,
      month: slot.month,
      attach_rate: attachRate,
      gross_total: Math.round(slot.gross),
      deals_count: slot.deals.size,
      accepted_items: slot.accepted,
    });
  }
  return cells;
}

function monthBucket(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (m) return `${m[1]}-${m[2]}-01`;
  // Fallback bucket — single "current month" placeholder.
  const d = new Date();
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${yr}-${mo}-01`;
}

function slugId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

/* ------------------------------------------------------------------ */
/*  Orchestrator entrypoint                                            */
/* ------------------------------------------------------------------ */

export interface GenerateAuditOptions {
  /** Override clock for deterministic generation in tests. */
  now?: Date;
  /** Override the demo URL placed on page 4 of the PDF. */
  demo_url?: string;
}

export interface AuditRunRow {
  id: string;
  dealership_name: string;
  contact_name: string;
  contact_email: string;
  rooftops_count: number | null;
  source_csv_storage_url: string | null;
  source_csv_row_count: number | null;
  status: string;
  pdf_storage_url: string | null;
  summary_metrics: Record<string, unknown> | null;
  failure_reason: string | null;
  /** Optional anonymization flag (carried via summary_metrics.anonymize). */
}

export interface GenerateAuditResult {
  status: "delivered" | "failed";
  reason?: string;
  pdf_url?: string;
  summary_metrics?: Record<string, unknown>;
}

/**
 * End-to-end audit generation for a single run id.
 *
 * Production flow:
 *   1) Load fi_audit_runs row + the raw CSV from S3.
 *   2) Mark `processing`.
 *   3) Parse the CSV; reject if under MIN_CSV_ROWS.
 *   4) Build penetration cells -> generate PDF buffer.
 *   5) Upload PDF to S3 (or /tmp in shadow mode).
 *   6) Email the PDF to the contact.
 *   7) Mark `delivered` + write summary_metrics + audit_log + analytics.
 *
 * Shadow mode (no DATABASE_URL): returns a synthesized success result so
 * unit tests can exercise the happy path without infrastructure.
 */
export async function generateAudit(
  runId: string,
  rawCSV: string,
  opts: GenerateAuditOptions = {},
): Promise<GenerateAuditResult> {
  const now = opts.now ?? new Date();

  // Mark processing
  await updateRunStatus(runId, "processing");
  trackFIAudit("fi_audit.csv_uploaded", runId, { run_id: runId });

  const parsed = parseAuditCSV(rawCSV);
  if (parsed.row_count < MIN_CSV_ROWS) {
    const reason = `Insufficient deals: need at least ${MIN_CSV_ROWS}, received ${parsed.row_count}`;
    await markFailed(runId, reason);
    trackFIAudit("fi_audit.delivery_failed", runId, { reason });
    return { status: "failed", reason };
  }

  // Load the run row to know dealership name / contact / anonymize flag.
  const run = await loadRun(runId);
  if (!run) {
    const reason = `audit run ${runId} not found`;
    return { status: "failed", reason };
  }
  const anonymize =
    Boolean(run.summary_metrics?.anonymize) ||
    Boolean((run.summary_metrics as Record<string, unknown> | null)?.["anonymize"]);

  const cells = rowsToCells(parsed.rows);
  const monthlyVolume = Math.max(1, Math.round(parsed.row_count / 3)); // 3-month window default
  const tier = pickVolumeTier(monthlyVolume);
  const benchmarkAvg = getBenchmark(tier, "avg_gross_per_deal");
  const avgGross =
    parsed.rows.reduce((s, r) => s + (r.gross ?? 0), 0) / parsed.rows.length || 0;

  const pdfInput: AuditPDFInput = {
    dealership_name: run.dealership_name,
    contact_name: run.contact_name,
    audit_period_label: derivePeriodLabel(parsed.rows),
    monthly_volume: monthlyVolume,
    avg_gross_per_deal: avgGross,
    cells,
    anonymize,
    generated_at: now,
    demo_url: opts.demo_url,
  };
  const pdf = await generateAuditPDF(pdfInput);
  trackFIAudit("fi_audit.generated", runId, {
    page_count: pdf.page_count,
    cells: cells.length,
  });

  const pdfUrl = await uploadPDF(runId, pdf.buffer);

  const benchmarkMedian = benchmarkAvg?.median ?? 0;
  const gapPerDeal = benchmarkMedian - avgGross;
  const summary = {
    avg_gross_per_deal: Math.round(avgGross),
    benchmark_median: benchmarkMedian,
    gap_per_deal: Math.round(gapPerDeal),
    monthly_volume: monthlyVolume,
    tier,
    deal_count: parsed.row_count,
    headline: renderHeadline({
      avg_gross_per_deal: avgGross,
      benchmark_median: benchmarkMedian,
      gap_per_deal: gapPerDeal,
    }),
  };

  const emailCtx: AuditEmailContext = {
    contact_name: run.contact_name,
    dealership_name: run.dealership_name,
    avg_gross_per_deal: avgGross,
    benchmark_median: benchmarkMedian,
    gap_per_deal: gapPerDeal,
    monthly_volume: monthlyVolume,
    pdf_url: pdfUrl,
    demo_booking_url: opts.demo_url ?? "https://calendly.com/wolfpack-auto/dos-demo",
  };

  try {
    await sendAuditEmail(run.contact_email, emailCtx);
    await markDelivered(runId, pdfUrl, summary);
    trackFIAudit("fi_audit.delivered", runId, {
      gap_per_deal: summary.gap_per_deal,
      tier,
    });
    void auditLog(
      "fi_audit.delivered",
      { run_id: runId, dealership: run.dealership_name, gap_per_deal: summary.gap_per_deal },
      undefined,
      undefined,
      undefined,
    );
    return { status: "delivered", pdf_url: pdfUrl, summary_metrics: summary };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await markFailed(runId, `Email delivery failed: ${reason}`);
    trackFIAudit("fi_audit.delivery_failed", runId, { reason });
    return { status: "failed", reason, pdf_url: pdfUrl };
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers (DB + storage + email)                                     */
/* ------------------------------------------------------------------ */

function derivePeriodLabel(rows: AuditDealRow[]): string {
  const months = Array.from(
    new Set(
      rows.map((r) => monthBucket(r.funded_at).slice(0, 7)),
    ),
  ).sort();
  if (months.length === 0) return "Recent activity";
  const first = months[0];
  const last = months[months.length - 1];
  return first === last ? labelMonth(first) : `${labelMonth(first)} – ${labelMonth(last)}`;
}

function labelMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  if (!m || m < 1 || m > 12) return yyyymm;
  return `${names[m - 1]} ${y}`;
}

async function updateRunStatus(runId: string, status: string): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { query } = await import("@/lib/db");
    await query(
      `UPDATE fi_audit_runs SET status = $1 WHERE id = $2`,
      [status, runId],
    );
  } catch (err) {
    console.error("[fi-audit] updateRunStatus failed:", err);
  }
}

async function loadRun(runId: string): Promise<AuditRunRow | null> {
  if (!process.env.DATABASE_URL) {
    // Shadow mode — synthesize a minimal row so generation can be exercised.
    return {
      id: runId,
      dealership_name: "ACME Motors",
      contact_name: "Shadow Tester",
      contact_email: "shadow@example.com",
      rooftops_count: 1,
      source_csv_storage_url: null,
      source_csv_row_count: null,
      status: "processing",
      pdf_storage_url: null,
      summary_metrics: null,
      failure_reason: null,
    };
  }
  try {
    const { query } = await import("@/lib/db");
    const r = await query<AuditRunRow>(
      `SELECT id::text, dealership_name, contact_name, contact_email,
              rooftops_count, source_csv_storage_url, source_csv_row_count,
              status, pdf_storage_url, summary_metrics, failure_reason
       FROM fi_audit_runs WHERE id = $1`,
      [runId],
    );
    return r.rows?.[0] ?? null;
  } catch (err) {
    console.error("[fi-audit] loadRun failed:", err);
    return null;
  }
}

async function markFailed(runId: string, reason: string): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { query } = await import("@/lib/db");
    await query(
      `UPDATE fi_audit_runs
         SET status = 'failed', failure_reason = $1
       WHERE id = $2`,
      [reason, runId],
    );
  } catch (err) {
    console.error("[fi-audit] markFailed failed:", err);
  }
}

async function markDelivered(
  runId: string,
  pdfUrl: string,
  summary: Record<string, unknown>,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { query } = await import("@/lib/db");
    await query(
      `UPDATE fi_audit_runs
         SET status = 'delivered',
             pdf_storage_url = $1,
             summary_metrics = $2,
             delivered_at = NOW()
       WHERE id = $3`,
      [pdfUrl, JSON.stringify(summary), runId],
    );
  } catch (err) {
    console.error("[fi-audit] markDelivered failed:", err);
  }
}

/**
 * Upload the PDF buffer. S3 if configured; otherwise /tmp fallback. The
 * fallback is documented for shadow mode + local dev only.
 */
async function uploadPDF(runId: string, buffer: Buffer): Promise<string> {
  const hasR2 = process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET_NAME;
  if (hasR2) {
    try {
      // Reuse the S3-compatible client from the shared storage wrapper.
      const { getS3 } = await import("@/lib/storage");
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const bucket = process.env.R2_BUCKET_NAME!;
      const key = `fi-audits/${runId}.pdf`;
      await getS3().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: "application/pdf",
        }),
      );
      const base = process.env.R2_PUBLIC_URL ?? "https://media.wolfpackauto.com";
      return `${base}/${key}`;
    } catch (err) {
      console.error("[fi-audit] S3 upload failed, falling back to /tmp:", err);
    }
  }
  // /tmp fallback
  const fs = await import("fs/promises");
  const tmpPath = `/tmp/fi-audit-${runId}.pdf`;
  await fs.writeFile(tmpPath, buffer);
  return `file://${tmpPath}`;
}

/**
 * Send the audit-delivery email. Uses Resend when RESEND_API_KEY is set;
 * otherwise logs the email body for the demo path.
 */
async function sendAuditEmail(
  to: string,
  ctx: AuditEmailContext,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Wolfpack Auto <audits@wolfpackauto.com>";
  const html = auditDeliveryHTML(ctx);
  const text = auditDeliveryText(ctx);
  if (!apiKey) {
    console.log(
      `[fi-audit] No RESEND_API_KEY — logging audit email for ${to}:\n${text}`,
    );
    return;
  }
  const { Resend } = await import("resend");
  const client = new Resend(apiKey);
  const { error } = await client.emails.send({
    from,
    to: [to],
    subject: AUDIT_EMAIL_SUBJECT,
    html,
    text,
  });
  if (error) {
    throw new Error(`Resend error: ${error.message ?? "unknown"}`);
  }
}
