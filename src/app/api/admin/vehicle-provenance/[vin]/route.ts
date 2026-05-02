/**
 * GET /api/admin/vehicle-provenance/[vin]
 *
 * Returns the full provenance summary for a VIN: events, anchors, and
 * a fresh chain-verification result. Admin-scoped.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getProvenanceSummary } from "@/lib/vehicle-provenance";
import { trackProvenance } from "@/lib/analytics-hooks";

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{11,17}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: { vin: string } },
) {
  const authResult = await requireAuth(request);
  if (!isAuthenticated(authResult)) return authResult;

  const vin = (params.vin ?? "").toUpperCase();
  if (!VIN_REGEX.test(vin)) {
    return NextResponse.json({ error: "Invalid VIN" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        vin,
        count: 0,
        last_event_at: null,
        last_hash: null,
        last_alg: null,
        events: [],
        anchors: [],
        verification: { ok: true, count: 0 },
        warning: "Database not configured — shadow response",
      },
      { status: 200 },
    );
  }

  try {
    const summary = await getProvenanceSummary(vin);

    try {
      trackProvenance("provenance.chain_verified", authResult.user.dealer_id, {
        vin,
        count: summary.count,
        ok: summary.verification.ok,
      });
      if (!summary.verification.ok) {
        trackProvenance(
          "provenance.chain_invalid_detected",
          authResult.user.dealer_id,
          {
            vin,
            count: summary.count,
            reason: summary.verification.reason ?? "unknown",
          },
        );
      }
    } catch {
      /* analytics must never throw */
    }

    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist")) {
      return NextResponse.json(
        {
          vin,
          count: 0,
          last_event_at: null,
          last_hash: null,
          last_alg: null,
          events: [],
          anchors: [],
          verification: { ok: true, count: 0 },
          warning: "Provenance tables not yet migrated",
        },
        { status: 200 },
      );
    }
    console.error("[api/admin/vehicle-provenance/[vin]] error:", msg);
    return NextResponse.json(
      { error: "Failed to load provenance summary" },
      { status: 500 },
    );
  }
}
