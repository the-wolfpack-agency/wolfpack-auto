/**
 * POST /api/website-audit-request — public lead intake for the Website Audit.
 *
 * Accepts JSON:
 *   dealership_name   string, required
 *   website_url       string, required, must be HTTPS (or HTTP), must not
 *                     be localhost / private IP / loopback
 *   contact_name      string, required
 *   contact_email     string, required (email)
 *   contact_phone     string, optional
 *   contact_role      string, optional
 *   oem_affiliation   string, optional — 'porsche'|'audi'|'toyota'|'kia'|'independent'
 *   hcaptcha_token    string, optional — verified when HCAPTCHA_SECRET set
 *
 * Rate limited per IP: 5 per hour. Triple-writes the run row
 * (Postgres + Qdrant + Neo4j) for BDC follow-up + similar-prospect search.
 *
 * Returns 200 with `{ run_id, status_url, status: 'pending' }`.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit-log";
import { trackWebsiteAudit } from "@/lib/analytics-hooks";

export const dynamic = "force-dynamic";

const OEM_AFFILIATIONS = [
  "porsche",
  "audi",
  "toyota",
  "kia",
  "independent",
  "other",
] as const;

const oemAffiliationSchema = z.enum(OEM_AFFILIATIONS).optional();
const contactRoleSchema = z
  .enum(["gm", "gsm", "marketing_director", "owner", "fi_director", "other"])
  .optional();

const fieldsSchema = z.object({
  dealership_name: z.string().min(2).max(200),
  website_url: z
    .string()
    .url("Must be a valid URL")
    .refine((u) => isPublicHttpsUrl(u), "URL must be public HTTP/HTTPS, not localhost or private IP"),
  contact_name: z.string().min(2).max(200),
  contact_email: z.string().email().max(255),
  contact_phone: z.string().max(40).optional(),
  contact_role: contactRoleSchema,
  oem_affiliation: oemAffiliationSchema,
});

function isPublicHttpsUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".local")
    ) {
      return false;
    }
    // RFC1918 + loopback IP literals
    if (/^127\./.test(host)) return false;
    if (/^10\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
    if (/^169\.254\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function extractIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

async function verifyHcaptcha(token: string | undefined): Promise<boolean> {
  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) {
    console.warn("[website-audit] HCAPTCHA_SECRET not set — bypassing captcha (dev/test only)");
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
    console.error("[website-audit] hCaptcha verification error:", err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const ip = extractIp(request);

  // Per-IP rate limit — 5 per hour AND 2 per minute. Cheaper limit first.
  const minute = await checkRateLimit(`website-audit:minute:${ip}`, 2, 60);
  if (!minute.allowed) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const hour = await checkRateLimit(`website-audit:hour:${ip}`, 5, 3600);
  if (!hour.allowed) {
    return NextResponse.json(
      { error: "Too many requests — try again later." },
      { status: 429 },
    );
  }

  // Parse JSON body
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }
  if (!raw || typeof raw !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  const parsed = fieldsSchema.safeParse(body);
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
    typeof body.hcaptcha_token === "string" ? body.hcaptcha_token : undefined,
  );
  if (!captchaOk) {
    return NextResponse.json(
      { error: "Captcha verification failed" },
      { status: 400 },
    );
  }

  const userAgent = request.headers.get("user-agent") ?? "";

  let runId: string;
  if (!process.env.DATABASE_URL) {
    runId = `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  } else {
    try {
      const { query } = await import("@/lib/db");
      const r = await query<{ id: string }>(
        `INSERT INTO website_audit_runs (
           dealership_name, website_url, contact_name, contact_email,
           contact_phone, contact_role, oem_affiliation, ip_address, user_agent
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id::text`,
        [
          fields.dealership_name,
          fields.website_url,
          fields.contact_name,
          fields.contact_email,
          fields.contact_phone ?? null,
          fields.contact_role ?? null,
          fields.oem_affiliation ?? null,
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
      console.error("[website-audit] DB insert failed:", err);
      return NextResponse.json(
        { error: "Failed to record audit request" },
        { status: 500 },
      );
    }
  }

  // Audit + analytics + triple-write (fire-and-forget).
  void auditLog(
    "website_audit.request_submitted",
    {
      run_id: runId,
      dealership: fields.dealership_name,
      website_url: fields.website_url,
      email: fields.contact_email,
      oem_affiliation: fields.oem_affiliation ?? null,
    },
    undefined,
    undefined,
    ip,
  );
  trackWebsiteAudit("website_audit.request_submitted", runId, {
    dealership: fields.dealership_name,
    website_url: fields.website_url,
    oem_affiliation: fields.oem_affiliation ?? "unspecified",
    contact_role: fields.contact_role ?? "unspecified",
  });
  void tripleWriteWebsiteAuditRun({
    id: runId,
    dealership_name: fields.dealership_name,
    contact_email: fields.contact_email,
    website_url: fields.website_url,
    oem_affiliation: fields.oem_affiliation ?? null,
  });

  return NextResponse.json(
    {
      run_id: runId,
      status: "pending",
      status_url: `/api/website-audit-request/${runId}`,
    },
    { status: 200 },
  );
}

/**
 * Triple-write the run row to Qdrant + Neo4j. Postgres write already
 * happened in the handler; this fans out to the other two stores
 * fire-and-forget. Failures logged, never thrown.
 */
async function tripleWriteWebsiteAuditRun(run: {
  id: string;
  dealership_name: string;
  contact_email: string;
  website_url: string;
  oem_affiliation: string | null;
}): Promise<void> {
  if (process.env.QDRANT_URL) {
    try {
      const { upsertPoints, createCollection } = await import("@/lib/qdrant-client");
      await createCollection("wolfpack_website_audit_leads", 4);
      const idNumber = Math.abs(
        run.id.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0),
      );
      await upsertPoints("wolfpack_website_audit_leads", [
        {
          id: idNumber,
          vector: [0, 0, 0, 0],
          payload: {
            run_id: run.id,
            dealership_name: run.dealership_name,
            contact_email: run.contact_email,
            website_url: run.website_url,
            oem_affiliation: run.oem_affiliation ?? "unspecified",
            ts: new Date().toISOString(),
          },
        },
      ]);
    } catch (err) {
      console.error("[website-audit] Qdrant write failed:", err);
    }
  }
  if (process.env.NEO4J_URI) {
    try {
      const neo4j = await import("@/lib/neo4j-client");
      const session = (neo4j as { getSession?: () => unknown }).getSession?.();
      if (session && typeof session === "object" && "run" in session) {
        await (session as { run: (q: string, p: Record<string, unknown>) => Promise<unknown> }).run(
          `MERGE (a:WebsiteAuditLead { id: $id })
           SET a.dealership_name = $dealership,
               a.contact_email = $email,
               a.website_url = $url,
               a.oem_affiliation = $oem`,
          {
            id: run.id,
            dealership: run.dealership_name,
            email: run.contact_email,
            url: run.website_url,
            oem: run.oem_affiliation ?? "unspecified",
          },
        );
      }
    } catch (err) {
      console.error("[website-audit] Neo4j write failed:", err);
    }
  }
}
