import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getTradeBenchmark } from "@/lib/auction-feed";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!isAuthenticated(auth)) return auth;

  const url = new URL(request.url);
  const vin = url.searchParams.get("vin");
  const yearStr = url.searchParams.get("year");
  const make = url.searchParams.get("make");
  const model = url.searchParams.get("model");
  const trim = url.searchParams.get("trim");
  const mileageStr = url.searchParams.get("mileage");

  let year: number; let mk: string; let md: string; let mileage: number;

  if (vin) {
    if (vin.length < 11) {
      return NextResponse.json({ error: "Invalid VIN" }, { status: 400 });
    }
    if (!process.env.DATABASE_URL) {
      // synthetic
      const benchmark = await getTradeBenchmark(2021, "Honda", "Accord", trim ?? null, Number(mileageStr ?? 50_000));
      return NextResponse.json({ benchmark });
    }
    try {
      const { query } = await import("@/lib/db");
      const r = await query<{ year: number; make: string; model: string; trim: string | null; mileage: number }>(
        `SELECT year, make, model, trim, mileage
           FROM auction_listings
          WHERE vin = $1
          ORDER BY sale_at DESC
          LIMIT 1`,
        [vin],
      );
      if (r.rows.length === 0) {
        return NextResponse.json({ error: "VIN not found in auction history" }, { status: 404 });
      }
      const row = r.rows[0];
      year = row.year; mk = row.make; md = row.model; mileage = row.mileage;
      const benchmark = await getTradeBenchmark(year, mk, md, row.trim, mileage);
      return NextResponse.json({ benchmark });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("does not exist")) {
        return NextResponse.json({ benchmark: null });
      }
      console.error("[auction/benchmarks] error:", err);
      return NextResponse.json({ error: "Failed to load benchmark" }, { status: 500 });
    }
  }

  if (!yearStr || !make || !model || !mileageStr) {
    return NextResponse.json({ error: "Either vin or (year+make+model+mileage) required" }, { status: 400 });
  }
  year = Number(yearStr);
  mileage = Number(mileageStr);
  if (!Number.isFinite(year) || !Number.isFinite(mileage)) {
    return NextResponse.json({ error: "year and mileage must be numbers" }, { status: 400 });
  }
  const benchmark = await getTradeBenchmark(year, make, model, trim, mileage);
  return NextResponse.json({ benchmark });
}
