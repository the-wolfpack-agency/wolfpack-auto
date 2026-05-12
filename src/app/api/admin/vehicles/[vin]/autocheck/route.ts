/**
 * GET /api/admin/vehicles/[vin]/autocheck
 *
 * Pulls an AutoCheck (Experian) report for the VIN using the dealer's BYO
 * credential. Same graceful-degradation contract as the Carfax route:
 * missing credential = 200 with `{ available: false }`, never 500.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, requireAuth } from "@/lib/auth-guard";
import { getAutoCheckReport } from "@/lib/external-credentials/autocheck-client";

interface RouteContext {
  params: Promise<{ vin: string }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAuth(req);
  if (!isAuthenticated(auth)) return auth;

  const { vin } = await ctx.params;
  if (!vin) {
    return NextResponse.json({ error: "VIN is required" }, { status: 400 });
  }

  const dealerId = auth.user.dealer_id;

  try {
    const result = await getAutoCheckReport({ dealerId, vin });
    if (!result.ok) {
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
    console.error("[GET /admin/vehicles/[vin]/autocheck] failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
