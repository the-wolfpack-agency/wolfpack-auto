/**
 * GET  /api/admin/vehicles/[vin]/market-intel
 * POST /api/admin/vehicles/[vin]/market-intel  (force a refresh)
 *
 * Returns the latest VehicleMarketSignal + recent valuation snapshots +
 * top comparable listings for the vehicle. Tenant-scoped via the session's
 * dealer_id (NEVER taken from the request body — see `.ai/conventions.md`).
 *
 * Mock data caveat is conveyed in the response: every snapshot/comparable
 * carries an `is_mock` flag so the UI can label the values clearly.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated, requireAuth } from "@/lib/auth-guard";
import {
  loadCurrentMarketIntel,
  refreshVehicleMarketIntel,
} from "@/lib/market-intel";

interface RouteContext {
  params: Promise<{ vin: string }>;
}

/* ------------------------------------------------------------------ */
/*  GET                                                                */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAuth(req);
  if (!isAuthenticated(auth)) return auth;

  const { vin } = await ctx.params;
  if (!vin) {
    return NextResponse.json({ error: "VIN is required" }, { status: 400 });
  }

  const dealerId = auth.user.dealer_id;

  // Shadow mode — no DB. Return a structured empty payload so the UI can
  // render its empty state without crashing.
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      vehicle_id: null,
      vin: vin.toUpperCase(),
      signal: null,
      recent_snapshots: [],
      top_comparables: [],
      noData: true,
      noDataReason: "database_unavailable",
      mock_in_use: true,
    });
  }

  try {
    const { query } = await import("@/lib/db");
    const vehicleRow = await query<{ id: string; price: number; created_at: Date }>(
      `SELECT id, price, created_at FROM vehicles
        WHERE dealer_id = $1 AND vin = $2
        LIMIT 1`,
      [dealerId, vin.toUpperCase()],
    );
    const vehicle = (vehicleRow.rows as Array<{ id: string }>)[0];
    if (!vehicle) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const intel = await loadCurrentMarketIntel(vehicle.id, dealerId);

    const mockInUse =
      intel.recentSnapshots.length === 0
        ? true
        : intel.recentSnapshots.every((s) => s.is_mock);

    return NextResponse.json({
      vehicle_id: vehicle.id,
      vin: vin.toUpperCase(),
      signal: intel.signal,
      recent_snapshots: intel.recentSnapshots,
      top_comparables: intel.topComparables,
      noData: intel.signal === null,
      noDataReason: intel.signal === null ? "no_market_signal_yet" : null,
      mock_in_use: mockInUse,
    });
  } catch (err) {
    console.error("[GET /admin/vehicles/[vin]/market-intel] failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  POST — force refresh (dealer-initiated)                           */
/* ------------------------------------------------------------------ */

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await requireAuth(req);
  if (!isAuthenticated(auth)) return auth;

  const { vin } = await ctx.params;
  if (!vin) {
    return NextResponse.json({ error: "VIN is required" }, { status: 400 });
  }

  const dealerId = auth.user.dealer_id;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      success: false,
      noDataReason: "database_unavailable",
    });
  }

  try {
    const { query } = await import("@/lib/db");
    const row = await query<{
      id: string;
      vin: string;
      year: number;
      make: string;
      model: string;
      trim: string | null;
      mileage: number | null;
      price: number;
      created_at: Date;
    }>(
      `SELECT id, vin, year, make, model, trim, mileage, price, created_at
         FROM vehicles
        WHERE dealer_id = $1 AND vin = $2
        LIMIT 1`,
      [dealerId, vin.toUpperCase()],
    );
    const v = (row.rows as Array<{
      id: string;
      vin: string;
      year: number;
      make: string;
      model: string;
      trim: string | null;
      mileage: number | null;
      price: number;
      created_at: Date;
    }>)[0];
    if (!v) {
      return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
    }

    const daysOnLot = Math.max(
      0,
      Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86_400_000),
    );

    const result = await refreshVehicleMarketIntel(
      {
        vehicleId: v.id,
        dealerId,
        vin: v.vin,
        year: v.year,
        make: v.make,
        model: v.model,
        trim: v.trim ?? undefined,
        miles: v.mileage ?? undefined,
        ourPriceCents: Math.round((Number(v.price) || 0) * 100),
        daysOnLot,
      },
      { via: "api", userId: auth.user.id },
    );

    return NextResponse.json({
      success: true,
      signal: result.signal,
      mock_in_use: result.value?.isMock ?? true,
    });
  } catch (err) {
    console.error("[POST /admin/vehicles/[vin]/market-intel] failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
