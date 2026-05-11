/**
 * GET /api/cron/market-intel-refresh — Vercel Cron target.
 *
 * Refreshes vehicle_market_signals for every in-stock vehicle across every
 * active dealer. Idempotent: an upsert per vehicle. Rate-limited internally
 * (sequential per dealer, capped vehicles-per-run) so a refresh never blows
 * out external valuation APIs once the KBB partnership lands.
 *
 * Suggested schedule (vercel.json): "0 4 * * *" (daily 04:00 UTC).
 */

import { NextRequest, NextResponse } from "next/server";
import { refreshVehicleMarketIntel } from "@/lib/market-intel";

const MAX_VEHICLES_PER_RUN = 250;
const MAX_DEALERS_PER_RUN = 100;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  if (cronSecret) {
    const provided = authHeader?.replace("Bearer ", "") ?? cronHeader;
    if (provided !== cronSecret) {
      return NextResponse.json(
        { error: "Unauthorized — invalid cron secret" },
        { status: 401 },
      );
    }
  }

  const startedAt = Date.now();

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      success: true,
      message: "No database configured — refresh skipped",
      refreshed: 0,
      duration_ms: Date.now() - startedAt,
    });
  }

  try {
    const { query } = await import("@/lib/db");
    const dealersResult = await query<{ id: string }>(
      `SELECT id FROM dealers WHERE COALESCE(active, TRUE) = TRUE LIMIT $1`,
      [MAX_DEALERS_PER_RUN],
    ).catch(() => ({ rows: [] as Array<{ id: string }> }));

    let totalRefreshed = 0;
    const perDealer: Array<{ dealer_id: string; refreshed: number; errors: number }> = [];

    for (const dealer of dealersResult.rows as Array<{ id: string }>) {
      const vehicles = await query<{
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
          WHERE dealer_id = $1 AND status = 'available'
          ORDER BY created_at DESC
          LIMIT $2`,
        [dealer.id, MAX_VEHICLES_PER_RUN],
      ).catch(() => ({ rows: [] as Array<{
        id: string;
        vin: string;
        year: number;
        make: string;
        model: string;
        trim: string | null;
        mileage: number | null;
        price: number;
        created_at: Date;
      }> }));

      let refreshed = 0;
      let errors = 0;

      for (const v of vehicles.rows as Array<{
        id: string;
        vin: string;
        year: number;
        make: string;
        model: string;
        trim: string | null;
        mileage: number | null;
        price: number;
        created_at: Date;
      }>) {
        const daysOnLot = Math.max(
          0,
          Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86_400_000),
        );
        try {
          await refreshVehicleMarketIntel(
            {
              vehicleId: v.id,
              dealerId: dealer.id,
              vin: v.vin,
              year: v.year,
              make: v.make,
              model: v.model,
              trim: v.trim ?? undefined,
              miles: v.mileage ?? undefined,
              ourPriceCents: Math.round((Number(v.price) || 0) * 100),
              daysOnLot,
            },
            { via: "cron" },
          );
          refreshed += 1;
        } catch (err) {
          errors += 1;
          console.error(
            `[cron/market-intel-refresh] vehicle ${v.id} failed:`,
            err,
          );
        }
      }

      perDealer.push({ dealer_id: dealer.id, refreshed, errors });
      totalRefreshed += refreshed;
    }

    return NextResponse.json({
      success: true,
      dealers: perDealer,
      refreshed: totalRefreshed,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[cron/market-intel-refresh] cron failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: "Cron failed",
        duration_ms: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
