/**
 * GET /api/admin/vehicles/[vin]/carfax
 *
 * Pulls a Carfax-for-Dealers report for the VIN using the dealer's BYO
 * Carfax credential. If the dealer has no Carfax credential row, this
 * route degrades gracefully: 200 with `{ available: false, reason:
 * 'no_credential' }` (per the Stream A brief — never 500).
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, requireAuth } from "@/lib/auth-guard";
import { getCarfaxReport } from "@/lib/external-credentials/carfax-client";

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

  try {
    const result = await getCarfaxReport({ dealerId, vin });
    if (!result.ok) {
      // Graceful degradation: missing credential or upstream issue ->
      // 200 with available=false so the UI never blanks.
      if (
        result.error.code === "upstream_unavailable" &&
        result.error.message === "no_credential"
      ) {
        return NextResponse.json({
          available: false,
          reason: "no_credential",
          vin: vin.toUpperCase(),
        });
      }
      if (result.error.code === "invalid_input") {
        return NextResponse.json(
          { error: result.error.message, code: result.error.code },
          { status: 400 },
        );
      }
      return NextResponse.json({
        available: false,
        reason: result.error.code,
        message: result.error.message,
        vin: vin.toUpperCase(),
      });
    }
    return NextResponse.json({
      available: true,
      vin: vin.toUpperCase(),
      report: result.value,
      mock_in_use: result.value.isMock,
    });
  } catch (err) {
    console.error("[GET /admin/vehicles/[vin]/carfax] failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
