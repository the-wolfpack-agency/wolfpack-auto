import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";
import crypto from "crypto";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  active: boolean;
}

/* -------------------------------------------------------------------------- */
/* Shadow mode sample data                                                    */
/* -------------------------------------------------------------------------- */

const SAMPLE_KEYS: ApiKey[] = [
  {
    id: "key-001",
    name: "CRM Integration",
    prefix: "wpa_live_abc1",
    created_at: "2026-02-01T00:00:00Z",
    last_used_at: "2026-03-27T14:30:00Z",
    active: true,
  },
  {
    id: "key-002",
    name: "Analytics Export",
    prefix: "wpa_live_def2",
    created_at: "2026-03-10T00:00:00Z",
    last_used_at: null,
    active: true,
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/agency/api-keys — list API keys                                   */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (authResult.user.role !== "admin") {
    return NextResponse.json(
      { error: "Agency-level access required" },
      { status: 403 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ keys: SAMPLE_KEYS });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `SELECT id, name, prefix, created_at, last_used_at, active
       FROM agency_api_keys
       ORDER BY created_at DESC`,
    );
    return NextResponse.json({ keys: result.rows });
  } catch (err) {
    console.error("[api/agency/api-keys] DB error:", err);
    return NextResponse.json({ keys: SAMPLE_KEYS });
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/agency/api-keys — generate a new API key                        */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (authResult.user.role !== "admin") {
    return NextResponse.json(
      { error: "Agency-level access required" },
      { status: 403 },
    );
  }

  let body: { name?: string } = {};
  try {
    body = await request.json();
  } catch {
    // name is optional
  }

  const name = typeof body.name === "string" ? body.name.slice(0, 200) : "Untitled Key";
  const rawKey = `wpa_live_${crypto.randomBytes(32).toString("hex")}`;
  const prefix = rawKey.slice(0, 16);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (!process.env.DATABASE_URL) {
    try { trackSystem("agency.api_key_created", authResult.user.dealer_id, { name, prefix }); } catch { /* */ }
    return NextResponse.json(
      {
        key: {
          id,
          name,
          prefix,
          full_key: rawKey,
          created_at: now,
          last_used_at: null,
          active: true,
        },
        warning: "Store this key securely. It will not be shown again.",
      },
      { status: 201 },
    );
  }

  try {
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const { query } = await import("@/lib/db");
    await query(
      `INSERT INTO agency_api_keys (id, name, prefix, key_hash, active)
       VALUES ($1, $2, $3, $4, true)`,
      [id, name, prefix, keyHash],
    );

    try { trackSystem("agency.api_key_created", authResult.user.dealer_id, { name, prefix }); } catch { /* */ }

    return NextResponse.json(
      {
        key: {
          id,
          name,
          prefix,
          full_key: rawKey,
          created_at: now,
          last_used_at: null,
          active: true,
        },
        warning: "Store this key securely. It will not be shown again.",
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[api/agency/api-keys] Create error:", err);
    return NextResponse.json(
      { error: "Failed to create API key" },
      { status: 500 },
    );
  }
}
