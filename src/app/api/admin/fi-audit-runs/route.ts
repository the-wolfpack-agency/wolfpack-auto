/**
 * GET /api/admin/fi-audit-runs — Wolfpack staff list of audit prospects.
 *
 * The BDC follow-up trigger. Returns the most-recent audit submissions
 * with contact info + status so a human can call the warm lead.
 *
 * Restricted to Wolfpack staff (operator-auth). Dealer "owner" sessions
 * MUST NOT pass — these are pre-customer leads, not tenant data.
 *
 * Query params:
 *   limit  default 50, max 200
 *   status optional filter (pending/processing/delivered/...)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireWolfpackStaff,
  isWolfpackStaff,
} from "@/lib/operator-auth";
import { auditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

interface AuditRunListItem {
  id: string;
  dealership_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  contact_role: string | null;
  rooftops_count: number | null;
  status: string;
  source_csv_row_count: number | null;
  summary_metrics: Record<string, unknown> | null;
  requested_at: string;
  delivered_at: string | null;
}

const VALID_STATUSES = new Set([
  "pending",
  "processing",
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
    return NextResponse.json({ runs: [] as AuditRunListItem[] });
  }

  try {
    const { query } = await import("@/lib/db");
    const where = status ? `WHERE status = $1` : ``;
    const args = status ? [status, limit] : [limit];
    const limitArg = status ? `$2` : `$1`;
    const r = await query<AuditRunListItem>(
      `SELECT
         id::text,
         dealership_name,
         contact_name,
         contact_email,
         contact_phone,
         contact_role,
         rooftops_count,
         status,
         source_csv_row_count,
         summary_metrics,
         requested_at::text,
         delivered_at::text
       FROM fi_audit_runs
       ${where}
       ORDER BY requested_at DESC
       LIMIT ${limitArg}`,
      args,
    );
    void auditLog(
      "admin.fi_audit_runs_listed",
      { count: r.rows?.length ?? 0, status, limit },
      auth.staff.id,
      undefined,
      undefined,
    );
    return NextResponse.json({ runs: r.rows ?? [] });
  } catch (err) {
    console.error("[fi-audit] admin list failed:", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
