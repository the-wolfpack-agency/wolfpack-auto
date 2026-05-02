/**
 * POST /api/admin/vehicle-provenance/record
 *
 * Append a new signed event to the hash-chained provenance ledger for a VIN.
 * Auth: admin or owner role (mutating route, dealer-scoped).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import {
  recordEvent,
  PROVENANCE_EVENT_TYPES,
  type ProvenanceEventType,
} from "@/lib/vehicle-provenance";

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{11,17}$/i; // permissive; full VIN check lives in vin-decoder

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  const role = authResult.user.role;
  if (role !== "admin" && role !== "owner" && role !== "manager") {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 },
    );
  }

  let body: {
    vin?: string;
    event_type?: ProvenanceEventType;
    occurred_at?: string;
    payload?: Record<string, unknown>;
    verifying_key_id?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { vin, event_type, occurred_at, payload } = body;

  if (!vin || typeof vin !== "string" || !VIN_REGEX.test(vin)) {
    return NextResponse.json({ error: "Invalid or missing VIN" }, { status: 400 });
  }
  if (!event_type || !PROVENANCE_EVENT_TYPES.includes(event_type)) {
    return NextResponse.json(
      { error: `event_type must be one of: ${PROVENANCE_EVENT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (!occurred_at || isNaN(Date.parse(occurred_at))) {
    return NextResponse.json(
      { error: "occurred_at must be a valid ISO timestamp" },
      { status: 400 },
    );
  }
  if (payload != null && (typeof payload !== "object" || Array.isArray(payload))) {
    return NextResponse.json(
      { error: "payload must be a JSON object" },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database not configured (set DATABASE_URL)" },
      { status: 503 },
    );
  }

  try {
    const row = await recordEvent({
      dealerId: authResult.user.dealer_id,
      vin: vin.toUpperCase(),
      eventType: event_type,
      occurredAt: occurred_at,
      payload: payload ?? {},
      recordedByUserId: authResult.user.id,
      verifyingKeyId: body.verifying_key_id,
    });
    return NextResponse.json({ event: row }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist")) {
      return NextResponse.json(
        { error: "Provenance tables not yet migrated. Run npm run db:migrate." },
        { status: 503 },
      );
    }
    if (msg.includes("duplicate key") || msg.includes("unique")) {
      return NextResponse.json(
        { error: "Concurrent chain extension detected — please retry" },
        { status: 409 },
      );
    }
    console.error("[api/admin/vehicle-provenance/record] error:", msg);
    return NextResponse.json(
      { error: "Failed to record provenance event" },
      { status: 500 },
    );
  }
}
