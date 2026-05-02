/**
 * GET /api/vehicle-provenance/[vin]/verify   (PUBLIC, rate-limited)
 *
 * The buyer-trust endpoint. Returns a small, signed verification result
 * that any third party can hit without authentication. Rate-limited to
 * prevent enumeration / DoS.
 *
 * Response shape:
 *   {
 *     ok: boolean,                       // chain integrity AND signatures intact
 *     vin: string,
 *     count: number,                     // number of recorded events
 *     root: string,                      // merkle root over the chain leaves
 *     signature_alg: string | null,      // alg of the most recent leaf signature
 *     verifying_key_id: string | null,
 *     last_event_at: string | null,
 *     reason?: string                    // populated when ok === false
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  listEvents,
  verifyChain,
  merkleRoot,
} from "@/lib/vehicle-provenance";
import { trackProvenance } from "@/lib/analytics-hooks";

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{11,17}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: { vin: string } },
) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const rl = await checkRateLimit(`provenance-public:${ip}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", reset_at: rl.resetAt },
      { status: 429, headers: { "Retry-After": String(Math.max(1, rl.resetAt - Math.floor(Date.now() / 1000))) } },
    );
  }

  const vin = (params.vin ?? "").toUpperCase();
  if (!VIN_REGEX.test(vin)) {
    return NextResponse.json({ error: "Invalid VIN" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        ok: true,
        vin,
        count: 0,
        root: null,
        signature_alg: null,
        verifying_key_id: null,
        last_event_at: null,
        warning: "Database not configured — shadow response",
      },
      { status: 200 },
    );
  }

  try {
    const events = await listEvents(vin);
    const verification = await verifyChain(vin);

    const root = events.length > 0
      ? merkleRoot(events.map((e) => e.this_hash))
      : null;
    const last = events[events.length - 1];

    const body = {
      ok: verification.ok,
      vin,
      count: events.length,
      root,
      signature_alg: last?.signature_alg ?? null,
      verifying_key_id: last?.verifying_key_id ?? null,
      last_event_at: last?.recorded_at ?? null,
      ...(verification.ok ? {} : { reason: verification.reason }),
    };

    try {
      // dealer_id is unknown / unauth — use the row's dealer_id when we
      // can; fall back to "public" so analytics doesn't drop the event.
      const dealerId = last?.dealer_id ?? "public";
      trackProvenance("provenance.public_verified", dealerId, {
        vin,
        ok: verification.ok,
        count: events.length,
      });
    } catch {
      /* analytics must never throw */
    }

    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist")) {
      return NextResponse.json(
        {
          ok: true,
          vin,
          count: 0,
          root: null,
          signature_alg: null,
          verifying_key_id: null,
          last_event_at: null,
          warning: "Provenance tables not yet migrated",
        },
        { status: 200 },
      );
    }
    console.error("[api/vehicle-provenance/[vin]/verify] error:", msg);
    return NextResponse.json(
      { error: "Failed to verify provenance" },
      { status: 500 },
    );
  }
}
