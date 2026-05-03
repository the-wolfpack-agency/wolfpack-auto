/**
 * POST /api/admin/vehicle-provenance/anchor
 *
 * Anchors a contiguous range of provenance events for a VIN by computing
 * a merkle root and writing a signed anchor row. Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { anchorRange } from "@/lib/vehicle-provenance";
import { sanitizeForLog } from "@/lib/log-sanitize";

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{11,17}$/i;

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  if (authResult.user.role !== "admin" && authResult.user.role !== "owner") {
    return NextResponse.json(
      { error: "Insufficient permissions — admin or owner required" },
      { status: 403 },
    );
  }

  let body: { vin?: string; from_id?: string; to_id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const vin = (body.vin ?? "").toUpperCase();
  if (!VIN_REGEX.test(vin)) {
    return NextResponse.json({ error: "Invalid or missing VIN" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database not configured (set DATABASE_URL)" },
      { status: 503 },
    );
  }

  try {
    const anchor = await anchorRange({
      dealerId: authResult.user.dealer_id,
      vin,
      fromId: body.from_id,
      toId: body.to_id,
    });
    return NextResponse.json({ anchor }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("no events found") || msg.includes("not found")) {
      return NextResponse.json(
        { error: "No events found to anchor for this VIN" },
        { status: 404 },
      );
    }
    if (msg.includes("does not exist")) {
      return NextResponse.json(
        { error: "Provenance tables not yet migrated. Run npm run db:migrate." },
        { status: 503 },
      );
    }
    console.error("[api/admin/vehicle-provenance/anchor] error:", sanitizeForLog(msg));
    return NextResponse.json(
      { error: "Failed to anchor provenance range" },
      { status: 500 },
    );
  }
}
