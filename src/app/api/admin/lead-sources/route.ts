/**
 * /api/admin/lead-sources
 *
 *   GET   — list this dealer's lead sources
 *   POST  — create a new lead source (generates a signing_secret server-side)
 *
 * Admin-only. Tenant-scoped via `dealer_id` from the session.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { auditLog } from "@/lib/audit-log";
import { trackLead } from "@/lib/analytics-hooks";

const createSchema = z.object({
  source_name: z.string().min(1).max(120),
  source_type: z.enum(["webhook", "api", "email", "manual"]),
  config: z.record(z.unknown()).optional().default({}),
  active: z.boolean().optional().default(true),
});

interface LeadSourceRow {
  id: string;
  dealer_id: string;
  source_name: string;
  source_type: "webhook" | "api" | "email" | "manual";
  config: Record<string, unknown>;
  signing_secret: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

const SAMPLE: LeadSourceRow[] = [
  {
    id: "ls-demo-1",
    dealer_id: "demo-dealer",
    source_name: "Website webhook",
    source_type: "webhook",
    config: {},
    signing_secret: null,
    active: true,
    created_at: "2026-04-20T00:00:00Z",
    updated_at: "2026-04-20T00:00:00Z",
  },
];

/** Strip the signing_secret from response payloads — never echo to clients. */
function publicView(row: LeadSourceRow): Omit<LeadSourceRow, "signing_secret"> & {
  has_signing_secret: boolean;
} {
  const { signing_secret, ...rest } = row;
  return { ...rest, has_signing_secret: signing_secret !== null };
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  const dealerId = getDealerId(auth);

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ sources: SAMPLE.map(publicView) });
  }

  try {
    const { query } = await import("@/lib/db");
    const res = await query<LeadSourceRow>(
      `SELECT id::text AS id, dealer_id::text AS dealer_id,
              source_name, source_type, config, signing_secret, active,
              created_at, updated_at
         FROM lead_sources
        WHERE dealer_id = $1::uuid
        ORDER BY created_at DESC`,
      [dealerId],
    );
    return NextResponse.json({ sources: res.rows.map(publicView) });
  } catch (err) {
    console.error("[admin/lead-sources] list failed:", err);
    return NextResponse.json({ error: "Unable to list lead sources" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  const dealerId = getDealerId(auth);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  // Generate a 32-byte hex signing secret. Returned ONCE in this response.
  const signingSecret = crypto.randomBytes(32).toString("hex");

  if (!process.env.DATABASE_URL) {
    const row: LeadSourceRow = {
      id: `ls-${Date.now().toString(36)}`,
      dealer_id: dealerId,
      source_name: parsed.data.source_name,
      source_type: parsed.data.source_type,
      config: parsed.data.config as Record<string, unknown>,
      signing_secret: signingSecret,
      active: parsed.data.active,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    trackLead("lead.source_created", dealerId, {
      source_name: row.source_name,
      source_type: row.source_type,
    });
    return NextResponse.json(
      {
        source: publicView(row),
        // Only echoed on creation; clients must store this.
        signing_secret: signingSecret,
      },
      { status: 201 },
    );
  }

  try {
    const { query } = await import("@/lib/db");
    const res = await query<LeadSourceRow>(
      `INSERT INTO lead_sources
         (dealer_id, source_name, source_type, config, signing_secret, active)
       VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6)
       RETURNING id::text AS id, dealer_id::text AS dealer_id,
                 source_name, source_type, config, signing_secret, active,
                 created_at, updated_at`,
      [
        dealerId,
        parsed.data.source_name,
        parsed.data.source_type,
        JSON.stringify(parsed.data.config ?? {}),
        signingSecret,
        parsed.data.active,
      ],
    );
    const row = res.rows[0];
    trackLead("lead.source_created", dealerId, {
      source_name: row.source_name,
      source_type: row.source_type,
    });
    void auditLog(
      "lead_source.create",
      { source_id: row.id, source_name: row.source_name, source_type: row.source_type },
      auth.user.id,
      dealerId,
    );
    return NextResponse.json(
      {
        source: publicView(row),
        signing_secret: signingSecret,
      },
      { status: 201 },
    );
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json({ error: "A lead source with this name already exists" }, { status: 409 });
    }
    console.error("[admin/lead-sources] create failed:", err);
    return NextResponse.json({ error: "Unable to create lead source" }, { status: 500 });
  }
}
