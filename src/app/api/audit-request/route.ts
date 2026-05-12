/**
 * POST /api/audit-request — public lead intake for the F&I Penetration Audit.
 *
 * Accepts multipart form:
 *   dealership_name   text, required
 *   contact_name      text, required
 *   contact_email     text, required (email)
 *   contact_phone     text, optional
 *   contact_role      text, optional, enum
 *   rooftops_count    int,  optional, default 1
 *   anonymize         "1" | "true" optional — hash manager names in PDF
 *   csv_file          file, required (UTF-8 text CSV)
 *   hcaptcha_token    text, optional — verified when HCAPTCHA_SECRET set
 *
 * Rate limited per IP: 5 per hour, 1 per minute. Triple-write the run
 * row (Postgres + Qdrant + Neo4j) so the BDC follow-up tooling can do
 * "show me similar prospects" later.
 *
 * Returns 200 with `{ id, status: 'pending' }` on success.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit-log";
import { trackFIAudit } from "@/lib/analytics-hooks";
import { validateCSVHeaders } from "@/lib/fi-audit/audit-orchestrator";

export const dynamic = "force-dynamic";

const contactRoleSchema = z
  .enum(["fi_director", "gm", "gsm", "controller", "other"])
  .optional();

const fieldsSchema = z.object({
  dealership_name: z.string().min(2).max(200),
  contact_name: z.string().min(2).max(200),
  contact_email: z.string().email().max(255),
  contact_phone: z.string().max(40).optional(),
  contact_role: contactRoleSchema,
  rooftops_count: z.number().int().min(1).max(500).default(1),
  anonymize: z.boolean().optional(),
});

function extractIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Verify the hCaptcha token if HCAPTCHA_SECRET is set. Returns true on
 * success OR when no secret is configured (stubbed local/dev mode). The
 * stub logs a warning so tests + canary surface the misconfiguration.
 */
async function verifyHcaptcha(token: string | undefined): Promise<boolean> {
  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) {
    console.warn("[fi-audit] HCAPTCHA_SECRET not set — bypassing captcha (dev/test only)");
    return true;
  }
  if (!token) return false;
  try {
    const res = await fetch("https://hcaptcha.com/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }).toString(),
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch (err) {
    console.error("[fi-audit] hCaptcha verification error:", err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const ip = extractIp(request);

  // Per-IP rate limit — 1 per minute AND 5 per hour. We check the
  // tighter limit (per minute) first so we don't burn the hourly quota.
  const minute = await checkRateLimit(`fi-audit:minute:${ip}`, 1, 60);
  if (!minute.allowed) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const hour = await checkRateLimit(`fi-audit:hour:${ip}`, 5, 3600);
  if (!hour.allowed) {
    return NextResponse.json(
      { error: "Too many requests — try again later." },
      { status: 429 },
    );
  }

  // Parse multipart form
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form body" },
      { status: 400 },
    );
  }

  const fieldsRaw = {
    dealership_name: String(form.get("dealership_name") ?? ""),
    contact_name: String(form.get("contact_name") ?? ""),
    contact_email: String(form.get("contact_email") ?? ""),
    contact_phone: form.get("contact_phone")
      ? String(form.get("contact_phone"))
      : undefined,
    contact_role: form.get("contact_role")
      ? String(form.get("contact_role"))
      : undefined,
    rooftops_count: Number(form.get("rooftops_count") ?? 1),
    anonymize: form.get("anonymize") === "1" || form.get("anonymize") === "true",
  };

  const parsed = fieldsSchema.safeParse(fieldsRaw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  const fields = parsed.data;

  const captchaOk = await verifyHcaptcha(
    form.get("hcaptcha_token") ? String(form.get("hcaptcha_token")) : undefined,
  );
  if (!captchaOk) {
    return NextResponse.json(
      { error: "Captcha verification failed" },
      { status: 400 },
    );
  }

  // CSV file
  const csvFile = form.get("csv_file");
  if (!csvFile || typeof csvFile === "string") {
    return NextResponse.json(
      { error: "csv_file is required (multipart file)" },
      { status: 400 },
    );
  }
  const file = csvFile as File;
  if (file.size === 0) {
    return NextResponse.json(
      { error: "csv_file is empty" },
      { status: 400 },
    );
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "csv_file exceeds 5 MB limit" },
      { status: 400 },
    );
  }
  const csvText = await file.text();

  const headerCheck = validateCSVHeaders(csvText);
  if (!headerCheck.ok) {
    return NextResponse.json(
      { error: `CSV rejected: ${headerCheck.reason}` },
      { status: 400 },
    );
  }
  const rowCount = csvText
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0).length - 1; // minus header

  const userAgent = request.headers.get("user-agent") ?? "";

  // Insert audit run + persist CSV. In shadow mode (no DATABASE_URL),
  // return a synthetic id so the public form still flows for demos.
  let runId: string;
  let csvUrl: string | null = null;
  try {
    csvUrl = await persistCSV(csvText);
  } catch (err) {
    console.error("[fi-audit] CSV persist failed:", err);
  }

  if (!process.env.DATABASE_URL) {
    runId = `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  } else {
    try {
      const { query } = await import("@/lib/db");
      const summary = JSON.stringify({ anonymize: Boolean(fields.anonymize) });
      const r = await query<{ id: string }>(
        `INSERT INTO fi_audit_runs (
           dealership_name, contact_name, contact_email, contact_phone,
           contact_role, rooftops_count, source_csv_storage_url,
           source_csv_row_count, summary_metrics, ip_address, user_agent
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
         RETURNING id::text`,
        [
          fields.dealership_name,
          fields.contact_name,
          fields.contact_email,
          fields.contact_phone ?? null,
          fields.contact_role ?? null,
          fields.rooftops_count,
          csvUrl,
          rowCount,
          summary,
          ip === "unknown" ? null : ip,
          userAgent,
        ],
      );
      runId = r.rows?.[0]?.id ?? "";
      if (!runId) {
        return NextResponse.json(
          { error: "Failed to record audit request" },
          { status: 500 },
        );
      }
    } catch (err) {
      console.error("[fi-audit] DB insert failed:", err);
      return NextResponse.json(
        { error: "Failed to record audit request" },
        { status: 500 },
      );
    }
  }

  // Audit + analytics + triple-write (fire-and-forget).
  void auditLog(
    "fi_audit.request_submitted",
    {
      run_id: runId,
      dealership: fields.dealership_name,
      email: fields.contact_email,
      row_count: rowCount,
      anonymize: Boolean(fields.anonymize),
    },
    undefined,
    undefined,
    ip,
  );
  trackFIAudit("fi_audit.request_submitted", runId, {
    dealership: fields.dealership_name,
    contact_role: fields.contact_role ?? "unspecified",
    row_count: rowCount,
    rooftops: fields.rooftops_count,
  });
  void tripleWriteAuditRun({
    id: runId,
    dealership_name: fields.dealership_name,
    contact_email: fields.contact_email,
    row_count: rowCount,
  });

  return NextResponse.json({ id: runId, status: "pending" }, { status: 200 });
}

/**
 * Persist the raw CSV to S3 (or /tmp fallback in shadow mode). Returns a
 * storage URL so the orchestrator can fetch it again on its async pass.
 */
async function persistCSV(text: string): Promise<string | null> {
  const hasR2 = process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET_NAME;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (hasR2) {
    try {
      const { getS3 } = await import("@/lib/storage");
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const bucket = process.env.R2_BUCKET_NAME!;
      const key = `fi-audits/source/${stamp}.csv`;
      await getS3().send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.from(text, "utf-8"),
          ContentType: "text/csv",
        }),
      );
      const base = process.env.R2_PUBLIC_URL ?? "https://media.wolfpackauto.com";
      return `${base}/${key}`;
    } catch (err) {
      console.error("[fi-audit] CSV S3 upload failed; using /tmp:", err);
    }
  }
  const fs = await import("fs/promises");
  const path = `/tmp/fi-audit-source-${stamp}.csv`;
  await fs.writeFile(path, text, "utf-8");
  return `file://${path}`;
}

/**
 * Triple-write the audit run to Postgres + Qdrant + Neo4j. Postgres write
 * already happened in the handler; this fans out to the other two stores
 * fire-and-forget. Failures are logged, never thrown.
 */
async function tripleWriteAuditRun(run: {
  id: string;
  dealership_name: string;
  contact_email: string;
  row_count: number;
}): Promise<void> {
  if (process.env.QDRANT_URL) {
    try {
      const { upsertPoints, createCollection } = await import("@/lib/qdrant-client");
      await createCollection("wolfpack_fi_audit_leads", 4);
      const idNumber = Math.abs(
        run.id.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0),
      );
      await upsertPoints("wolfpack_fi_audit_leads", [
        {
          id: idNumber,
          vector: [0, 0, 0, 0],
          payload: {
            run_id: run.id,
            dealership_name: run.dealership_name,
            contact_email: run.contact_email,
            row_count: run.row_count,
            ts: new Date().toISOString(),
          },
        },
      ]);
    } catch (err) {
      console.error("[fi-audit] Qdrant write failed:", err);
    }
  }
  if (process.env.NEO4J_URI) {
    try {
      const neo4j = await import("@/lib/neo4j-client");
      const session = (neo4j as { getSession?: () => unknown }).getSession?.();
      if (session && typeof session === "object" && "run" in session) {
        await (session as { run: (q: string, p: Record<string, unknown>) => Promise<unknown> }).run(
          `MERGE (a:FIAuditLead { id: $id })
           SET a.dealership_name = $dealership, a.contact_email = $email, a.row_count = $row_count`,
          {
            id: run.id,
            dealership: run.dealership_name,
            email: run.contact_email,
            row_count: run.row_count,
          },
        );
      }
    } catch (err) {
      console.error("[fi-audit] Neo4j write failed:", err);
    }
  }
}
