/**
 * GET /api/admin/vehicles/[vin]/edmunds-valuation
 *
 * Real Edmunds public-API valuation for a VIN. KBB doesn't issue per-dealer
 * credentials in practice (verified 2026-05-12), so this is the production
 * KBB-substitute — free, public, no credentials required.
 *
 * Triple-write: Edmunds valuations are semantic "similar-valuation" signals
 * so we fan out to Qdrant + Neo4j via `writeEventsToSecondaryStores`. (The
 * Stream A brief specifies triple-write IS required for Edmunds valuations
 * even though it is NOT required for the credential rows themselves.)
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, requireAuth } from "@/lib/auth-guard";
import { getValuation } from "@/lib/external-credentials/edmunds-client";

interface RouteContext {
  params: Promise<{ vin: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAuth(req);
  if (!isAuthenticated(auth)) return auth;

  if (!process.env.DATABASE_URL) {
    // Shadow mode (no database): no credential/cache store to read, so the
    // external provider cannot be reached. Degrade gracefully.
    return NextResponse.json(
      { error: "service_unavailable", shadow: true },
      { status: 503 },
    );
  }

  const { vin } = await ctx.params;
  if (!vin) {
    return NextResponse.json({ error: "VIN is required" }, { status: 400 });
  }

  const dealerId = auth.user.dealer_id;
  const url = new URL(req.url);
  const zipCode = url.searchParams.get("zip") ?? undefined;

  try {
    const result = await getValuation({ vin, zipCode }, dealerId);
    if (!result.ok) {
      if (result.error.code === "invalid_input") {
        return NextResponse.json(
          { error: result.error.message, code: result.error.code },
          { status: 400 },
        );
      }
      // Other failures degrade gracefully — UI shows "valuation unavailable"
      return NextResponse.json({
        available: false,
        reason: result.error.code,
        message: result.error.message,
        vin: vin.toUpperCase(),
      });
    }

    // Triple-write the valuation to Qdrant + Neo4j so similar-valuation
    // semantic queries work. Fire-and-forget; failure here MUST NOT block
    // the response.
    if (process.env.QDRANT_URL || process.env.NEO4J_URI || process.env.NEO4J_URL) {
      try {
        const { writeEventsToSecondaryStores } = await import("@/lib/triple-write");
        void writeEventsToSecondaryStores([
          {
            event_type: "market_intel",
            action: "market_intel.edmunds_valuation_fetched",
            page: dealerId,
            session_id: "server",
            user_fingerprint: auth.user.id,
            timestamp: new Date().toISOString(),
            metadata: {
              dealer_id: dealerId,
              vin: vin.toUpperCase(),
              trade_in_value_cents: result.value.tradeInValueCents,
              private_party_value_cents: result.value.privatePartyValueCents,
              dealer_retail_value_cents: result.value.dealerRetailValueCents,
              market_average_cents: result.value.marketAverageCents,
              source: "edmunds",
              is_mock: result.value.isMock,
            },
          },
        ]).catch(() => {
          /* swallow — triple-write must never block response */
        });
      } catch {
        /* dynamic import failure must never break the request */
      }
    }

    return NextResponse.json({
      available: true,
      vin: vin.toUpperCase(),
      valuation: result.value,
      mock_in_use: result.value.isMock,
    });
  } catch (err) {
    console.error("[GET /admin/vehicles/[vin]/edmunds-valuation] failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
