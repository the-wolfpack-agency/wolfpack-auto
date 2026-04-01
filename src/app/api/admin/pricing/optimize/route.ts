/**
 * POST /api/admin/pricing/optimize
 *
 * Returns optimal price calculation for a specific vehicle.
 *
 * Body: { vin: string, target_days?: number, min_margin_pct?: number }
 * Response: PricingReport for the specified vehicle with custom cost basis.
 * Emits: pricing.optimization_requested analytics event.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import {
  getDemoPricingReportByVin,
  getDemoPricingReports,
  generateVehiclePricingReport,
  type CostBasis,
} from "@/lib/pricing-engine";
import { trackPricing } from "@/lib/analytics-hooks";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let body: { vin?: string; target_days?: number; min_margin_pct?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const { vin, target_days, min_margin_pct } = body;

  if (!vin || typeof vin !== "string") {
    return NextResponse.json(
      { error: "vin is required" },
      { status: 400 },
    );
  }

  const costBasis: Partial<CostBasis> = {};
  if (target_days && typeof target_days === "number") {
    costBasis.target_days_to_sale = target_days;
  }

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    const report = getDemoPricingReportByVin(vin);

    if (!report) {
      return NextResponse.json(
        { error: `Vehicle with VIN ${vin} not found` },
        { status: 404 },
      );
    }

    try {
      trackPricing("pricing.optimization_requested", dealerId, {
        vin,
        target_days: target_days ?? 30,
        min_margin_pct: min_margin_pct ?? 0,
        source: "shadow",
      });
    } catch { /* analytics must never throw */ }

    return NextResponse.json({ report });
  }

  // Production mode
  try {
    const { query } = await import("@/lib/db");

    // Fetch the specific vehicle
    const vehicleResult = await query<{
      vin: string;
      year: number;
      make: string;
      model: string;
      trim: string;
      price: number;
      msrp: number;
      mileage: number;
      fuel: string;
      transmission: string;
      condition: string;
      body_style: string;
      photo_url: string;
      created_at: string;
      is_ev: boolean;
      cost_basis: number | null;
    }>(
      `SELECT vin, year, make, model,
              COALESCE(trim, '') AS trim,
              price, COALESCE(msrp, price) AS msrp,
              COALESCE(mileage, 0) AS mileage,
              COALESCE(fuel_type, 'Gasoline') AS fuel,
              COALESCE(transmission, 'Automatic') AS transmission,
              COALESCE(condition, 'used') AS condition,
              COALESCE(body_style, 'Sedan') AS body_style,
              COALESCE(photo_url, '') AS photo_url,
              created_at,
              COALESCE(is_ev, false) AS is_ev,
              cost_basis
       FROM vehicles
       WHERE dealer_id = $1 AND vin = $2 AND status = 'available'
       LIMIT 1`,
      [dealerId, vin],
    );

    if (vehicleResult.rows.length === 0) {
      return NextResponse.json(
        { error: `Vehicle with VIN ${vin} not found` },
        { status: 404 },
      );
    }

    const r = vehicleResult.rows[0];
    const vehicle = {
      vin: r.vin,
      year: r.year,
      make: r.make,
      model: r.model,
      trim: r.trim,
      price: Number(r.price),
      msrp: Number(r.msrp),
      mileage: Number(r.mileage),
      fuel: r.fuel,
      transmission: r.transmission,
      gradient: "",
      condition: r.condition,
      bodyStyle: r.body_style,
      photo: r.photo_url,
      is_ev: r.is_ev,
      ev_range_miles: null,
      ev_drivetrain: null,
      federal_tax_credit_eligible: false,
      federal_tax_credit_amount: 0,
      days_on_lot: Math.max(0, Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000)),
    };

    if (r.cost_basis) {
      costBasis.acquisition_cost = Number(r.cost_basis);
    }

    // Fetch all inventory for comparables
    const invResult = await query<{
      vin: string; year: number; make: string; model: string; trim: string;
      price: number; msrp: number; mileage: number; fuel: string;
      transmission: string; condition: string; body_style: string;
      photo_url: string; is_ev: boolean;
    }>(
      `SELECT vin, year, make, model,
              COALESCE(trim, '') AS trim,
              price, COALESCE(msrp, price) AS msrp,
              COALESCE(mileage, 0) AS mileage,
              COALESCE(fuel_type, 'Gasoline') AS fuel,
              COALESCE(transmission, 'Automatic') AS transmission,
              COALESCE(condition, 'used') AS condition,
              COALESCE(body_style, 'Sedan') AS body_style,
              COALESCE(photo_url, '') AS photo_url,
              COALESCE(is_ev, false) AS is_ev
       FROM vehicles
       WHERE dealer_id = $1 AND status = 'available'`,
      [dealerId],
    );

    const inventory = invResult.rows.map((row) => ({
      vin: row.vin,
      year: row.year,
      make: row.make,
      model: row.model,
      trim: row.trim,
      price: Number(row.price),
      msrp: Number(row.msrp),
      mileage: Number(row.mileage),
      fuel: row.fuel,
      transmission: row.transmission,
      gradient: "",
      condition: row.condition,
      bodyStyle: row.body_style,
      photo: row.photo_url,
      is_ev: row.is_ev,
      ev_range_miles: null,
      ev_drivetrain: null,
      federal_tax_credit_eligible: false,
      federal_tax_credit_amount: 0,
    }));

    const report = generateVehiclePricingReport(vehicle, inventory, undefined, costBasis);

    try {
      trackPricing("pricing.optimization_requested", dealerId, {
        vin,
        target_days: target_days ?? 30,
        min_margin_pct: min_margin_pct ?? 0,
        optimal_price: report.optimal.optimal_price,
        delta_pct: report.optimal.delta_pct,
        source: "live",
      });
    } catch { /* analytics must never throw */ }

    return NextResponse.json({ report });
  } catch (err) {
    console.error("[POST /api/admin/pricing/optimize] Error:", err);
    const report = getDemoPricingReportByVin(vin);
    if (!report) {
      return NextResponse.json(
        { error: `Vehicle with VIN ${vin} not found` },
        { status: 404 },
      );
    }
    return NextResponse.json({ report });
  }
}
