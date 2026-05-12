/**
 * GET /api/admin/website-audit-runs — Wolfpack staff list of Website Audit prospects.
 *
 * BDC follow-up trigger. Returns recent submissions with contact info +
 * status. Restricted to Wolfpack staff (operator-auth). Mirrors the
 * `/api/admin/fi-audit-runs` shape from the F&I Audit.
 *
 * Query params:
 *   limit   default 50, max 200
 *   status  optional filter (pending/scanning/generating_report/delivered/...)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireWolfpackStaff,
  isWolfpackStaff,
} from "@/lib/operator-auth";
import { auditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

interface WebsiteAuditRunListItem {
  id: string;
  dealership_name: string;
  website_url: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  contact_role: string | null;
  oem_affiliation: string | null;
  status: string;
  summary_metrics: Record<string, unknown> | null;
  requested_at: string;
  delivered_at: string | null;
}

const VALID_STATUSES = new Set([
  "pending",
  "scanning",
  "generating_report",
  "delivered",
  "failed",
  "demo_booked",
  "converted",
]);

export async function GET(request: NextRequest) {
  const auth = await requireWolfpackStaff(request);
  if (!isWolfpackStaff(auth)) return auth;

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const limit = Math.max(1, Math.min(200, Number.isFinite(limitRaw) ? limitRaw : 50));
  const statusRaw = url.searchParams.get("status");
  const status = statusRaw && VALID_STATUSES.has(statusRaw) ? statusRaw : null;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ runs: [] as WebsiteAuditRunListItem[] });
  }

  try {
    const { query } = await import("@/lib/db");
    const where = status ? `WHERE status = $1` : ``;
    const args = status ? [status, limit] : [limit];
    const limitArg = status ? `$2` : `$1`;
    const r = await query<WebsiteAuditRunListItem>(
      `SELECT
         id::text,
         dealership_name,
         website_url,
         contact_name,
         contact_email,
         contact_phone,
         contact_role,
         oem_affiliation,
         status,
         summary_metrics,
         requested_at::text,
         delivered_at::text
       FROM website_audit_runs
       ${where}
       ORDER BY requested_at DESC
       LIMIT ${limitArg}`,
      args,
    );
    void auditLog(
      "admin.website_audit_runs_listed",
      { count: r.rows?.length ?? 0, status, limit },
      auth.staff.id,
      undefined,
      undefined,
    );
    return NextResponse.json({ runs: r.rows ?? [] });
  } catch (err) {
    console.error("[website-audit] admin list failed:", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
