/**
 * Website Audit — orchestrator.
 *
 * Drives one audit run from "URL submitted" to "PDF emailed". Mirrors the
 * F&I Audit orchestrator pattern from `src/lib/fi-audit/audit-orchestrator.ts`
 * — same state machine, same triple-write fan-out, same fail-soft behavior.
 *
 * State machine:
 *   pending  -> scanning -> generating_report -> delivered
 *                                            \-> failed
 *   delivered -> demo_booked -> converted   (handled by separate routes)
 */

import { trackWebsiteAudit } from "@/lib/analytics-hooks";
import { auditLog } from "@/lib/audit-log";
import {
  applyRules,
  computeOverallScore,
  type TriggeredRule,
} from "@/lib/website-audit/patterns";
import { scanWebsite, type ScanResult } from "@/lib/website-audit/scanner";
import {
  runLighthouse,
  type LighthouseResult,
} from "@/lib/website-audit/lighthouse-runner";
import {
  generateWebsiteAuditPDF,
  type WebsiteAuditPDFInput,
} from "@/lib/website-audit/pdf-generator";
import {
  WEBSITE_AUDIT_EMAIL_SUBJECT,
  websiteAuditDeliveryHTML,
  websiteAuditDeliveryText,
  renderWebsiteHeadline,
  type WebsiteAuditEmailContext,
} from "@/lib/website-audit/email-templates";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface WebsiteAuditRunRow {
  id: string;
  dealership_name: string;
  website_url: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  contact_role: string | null;
  oem_affiliation: string | null;
  status: string;
  pdf_storage_url: string | null;
  summary_metrics: Record<string, unknown> | null;
  failure_reason: string | null;
}

export interface GenerateWebsiteAuditOptions {
  now?: Date;
  demo_url?: string;
  /** Test seam: pre-supplied scan, skips Playwright. */
  __scanOverride?: ScanResult;
  /** Test seam: pre-supplied Lighthouse, skips invocation. */
  __lighthouseOverride?: LighthouseResult;
}

export interface GenerateWebsiteAuditResult {
  status: "delivered" | "failed";
  reason?: string;
  pdf_url?: string;
  summary_metrics?: Record<string, unknown>;
  triggered?: TriggeredRule[];
}

/* ------------------------------------------------------------------ */
/*  Public entrypoint                                                  */
/* ------------------------------------------------------------------ */

/**
 * End-to-end Website Audit generation for a single run id.
 *
 * Production flow:
 *   1) Load website_audit_runs row.
 *   2) Mark `scanning`. Run scanner + Lighthouse in parallel.
 *   3) Apply rules -> triggered + overall score.
 *   4) Mark `generating_report`. Render PDF.
 *   5) Upload PDF to S3 / R2 (fallback /tmp).
 *   6) Email via Resend (graceful when no key).
 *   7) Mark `delivered` + write summary_metrics + audit_log + analytics.
 */
export async function generateWebsiteAudit(
  runId: string,
  opts: GenerateWebsiteAuditOptions = {},
): Promise<GenerateWebsiteAuditResult> {
  const now = opts.now ?? new Date();

  const run = await loadRun(runId);
  if (!run) {
    return { status: "failed", reason: `website audit run ${runId} not found` };
  }

  await updateStatus(runId, "scanning", { scan_started_at: now });
  trackWebsiteAudit("website_audit.scan_started", runId, {
    website_url: run.website_url,
  });

  let scan: ScanResult;
  let lighthouse: LighthouseResult;
  try {
    [scan, lighthouse] = await Promise.all([
      opts.__scanOverride ? Promise.resolve(opts.__scanOverride) : scanWebsite(run.website_url),
      opts.__lighthouseOverride ? Promise.resolve(opts.__lighthouseOverride) : runLighthouse(run.website_url),
    ]);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await markFailed(runId, `Scan failed: ${reason}`);
    trackWebsiteAudit("website_audit.scan_failed", runId, { reason });
    return { status: "failed", reason };
  }

  trackWebsiteAudit("website_audit.scan_completed", runId, {
    warning_count: scan.warnings.length,
    vdp_samples: scan.vdp_samples.length,
    lighthouse_available: lighthouse.available,
  });

  const triggered = applyRules({ scan, lighthouse });
  const overall_score = computeOverallScore(triggered);

  await updateStatus(runId, "generating_report", { scan_completed_at: new Date() });

  const pdfInput: WebsiteAuditPDFInput = {
    dealership_name: run.dealership_name,
    contact_name: run.contact_name,
    website_url: run.website_url,
    audit_label: now.toISOString().slice(0, 7),
    overall_score,
    triggered,
    scan,
    lighthouse,
    generated_at: now,
    demo_url: opts.demo_url,
  };

  let pdfResult: Awaited<ReturnType<typeof generateWebsiteAuditPDF>>;
  try {
    pdfResult = await generateWebsiteAuditPDF(pdfInput);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await markFailed(runId, `PDF generation failed: ${reason}`);
    trackWebsiteAudit("website_audit.scan_failed", runId, { reason: `pdf_${reason}` });
    return { status: "failed", reason };
  }

  trackWebsiteAudit("website_audit.pdf_generated", runId, {
    page_count: pdfResult.page_count,
    overall_score,
    triggered_count: triggered.length,
  });

  const pdfUrl = await uploadPDF(runId, pdfResult.buffer);

  const summary: Record<string, unknown> = {
    overall_score,
    triggered_count: triggered.length,
    top_3_issues: triggered.slice(0, 3).map((t) => ({
      slug: t.slug,
      severity: t.severity,
      title: t.rule.title,
    })),
    perf_score: lighthouse.available ? lighthouse.performance_score : null,
    accessibility_score: lighthouse.available ? lighthouse.accessibility_score : null,
    seo_score: lighthouse.available ? lighthouse.seo_score : null,
    lighthouse_available: lighthouse.available,
    vdp_samples: scan.vdp_samples.length,
    warnings: scan.warnings.length,
    headline: renderWebsiteHeadline({ overall_score, top_issues: triggered }),
  };

  const emailCtx: WebsiteAuditEmailContext = {
    contact_name: run.contact_name,
    dealership_name: run.dealership_name,
    website_url: run.website_url,
    overall_score,
    top_issues: triggered,
    pdf_url: pdfUrl,
    demo_booking_url: opts.demo_url ?? "https://calendly.com/wolfpack-auto/dealer-excellence",
  };

  try {
    await sendAuditEmail(run.contact_email, emailCtx);
    await markDelivered(runId, pdfUrl, summary, scan);
    trackWebsiteAudit("website_audit.delivered", runId, {
      overall_score,
      triggered_count: triggered.length,
    });
    void auditLog(
      "website_audit.delivered",
      {
        run_id: runId,
        dealership: run.dealership_name,
        website_url: run.website_url,
        overall_score,
      },
      undefined,
      undefined,
      undefined,
    );
    return { status: "delivered", pdf_url: pdfUrl, summary_metrics: summary, triggered };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await markFailed(runId, `Email delivery failed: ${reason}`);
    trackWebsiteAudit("website_audit.scan_failed", runId, { reason });
    return { status: "failed", reason, pdf_url: pdfUrl };
  }
}

/* ------------------------------------------------------------------ */
/*  DB helpers                                                         */
/* ------------------------------------------------------------------ */

async function loadRun(runId: string): Promise<WebsiteAuditRunRow | null> {
  if (!process.env.DATABASE_URL) {
    // Shadow mode — synthesize a minimal row.
    return {
      id: runId,
      dealership_name: "ACME Motors",
      website_url: "https://example.com",
      contact_name: "Shadow Tester",
      contact_email: "shadow@example.com",
      contact_phone: null,
      contact_role: null,
      oem_affiliation: null,
      status: "scanning",
      pdf_storage_url: null,
      summary_metrics: null,
      failure_reason: null,
    };
  }
  try {
    const { query } = await import("@/lib/db");
    const r = await query<WebsiteAuditRunRow>(
      `SELECT id::text, dealership_name, website_url, contact_name, contact_email,
              contact_phone, contact_role, oem_affiliation, status, pdf_storage_url,
              summary_metrics, failure_reason
       FROM website_audit_runs WHERE id = $1`,
      [runId],
    );
    return r.rows?.[0] ?? null;
  } catch (err) {
    console.error("[website-audit] loadRun failed:", err);
    return null;
  }
}

async function updateStatus(
  runId: string,
  status: string,
  fields: Record<string, unknown> = {},
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { query } = await import("@/lib/db");
    const extra: string[] = [];
    const args: unknown[] = [status];
    let idx = 2;
    for (const [k, v] of Object.entries(fields)) {
      extra.push(`${k} = $${idx}`);
      args.push(v);
      idx += 1;
    }
    args.push(runId);
    const setClause = ["status = $1", ...extra].join(", ");
    await query(
      `UPDATE website_audit_runs SET ${setClause} WHERE id = $${idx}`,
      args,
    );
  } catch (err) {
    console.error("[website-audit] updateStatus failed:", err);
  }
}

async function markFailed(runId: string, reason: string): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { query } = await import("@/lib/db");
    await query(
      `UPDATE website_audit_runs
         SET status = 'failed', failure_reason = $1
       WHERE id = $2`,
      [reason, runId],
    );
  } catch (err) {
    console.error("[website-audit] markFailed failed:", err);
  }
}

async function markDelivered(
  runId: string,
  pdfUrl: string,
  summary: Record<string, unknown>,
  scan: ScanResult,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    const { query } = await import("@/lib/db");
    await query(
      `UPDATE website_audit_runs
         SET status = 'delivered',
             pdf_storage_url = $1,
             summary_metrics = $2::jsonb,
             raw_findings = $3::jsonb,
             delivered_at = NOW(),
             scan_completed_at = NOW()
       WHERE id = $4`,
      [pdfUrl, JSON.stringify(summary), JSON.stringify(scan), runId],
    );
  } catch (err) {
    console.error("[website-audit] markDelivered failed:", err);
  }
}

/* ------------------------------------------------------------------ */
/*  PDF storage                                                        */
/* ------------------------------------------------------------------ */

async function uploadPDF(runId: string, buffer: Buffer): Promise<string> {
  const hasR2 = process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET_NAME;
  if (hasR2) {
    try {
      const { getS3 } = await import("@/lib/storage");
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const bucket = process.env.R2_BUCKET_NAME!;
      const key = `website-audits/${runId}.pdf`;
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
      console.error("[website-audit] S3 upload failed, falling back to /tmp:", err);
    }
  }
  const fs = await import("fs/promises");
  const tmpPath = `/tmp/website-audit-${runId}.pdf`;
  await fs.writeFile(tmpPath, buffer);
  return `file://${tmpPath}`;
}

/* ------------------------------------------------------------------ */
/*  Email                                                              */
/* ------------------------------------------------------------------ */

async function sendAuditEmail(
  to: string,
  ctx: WebsiteAuditEmailContext,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Wolfpack Auto <audits@wolfpackauto.com>";
  const html = websiteAuditDeliveryHTML(ctx);
  const text = websiteAuditDeliveryText(ctx);
  if (!apiKey) {
    console.log(
      `[website-audit] No RESEND_API_KEY — logging audit email for ${to}:\n${text}`,
    );
    return;
  }
  const { Resend } = await import("resend");
  const client = new Resend(apiKey);
  const { error } = await client.emails.send({
    from,
    to: [to],
    subject: WEBSITE_AUDIT_EMAIL_SUBJECT,
    html,
    text,
  });
  if (error) {
    throw new Error(`Resend error: ${error.message ?? "unknown"}`);
  }
}
