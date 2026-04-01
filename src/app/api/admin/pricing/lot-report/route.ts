/**
 * GET /api/admin/pricing/lot-report
 *
 * Returns lot-level pricing analytics: aging distribution, revenue velocity,
 * inventory health score, and top optimization opportunities.
 *
 * Response: LotPricingReport object.
 * Emits: pricing.lot_report_generated analytics event.
 */
import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import {
  getDemoLotReport,
  generateVehiclePricingReport,
  generateLotReport,
} from "@/lib/pricing-engine";
import { trackPricing } from "@/lib/analytics-hooks";

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    const report = getDemoLotReport();

    try {
      trackPricing("pricing.lot_report_generated", dealerId, {
        total_vehicles: report.total_vehicles,
        health_score: report.inventory_health_score,
        source: "shadow",
      });
    } catch { /* analytics must never throw */ }

    return NextResponse.json(report);
  }

  // Production mode
  try {
    const { query } = await import("@/lib/db");

    const result = await query<{
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
              COALESCE(is_ev, false) AS is_ev
       FROM vehicles
       WHERE dealer_id = $1 AND status = 'available'
       ORDER BY created_at ASC`,
      [dealerId],
    );

    const vehicles = result.rows.map((r) => ({
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
    }));

    const reports = vehicles.map((v) =>
      generateVehiclePricingReport(v, vehicles)
    );
    const lotReport = generateLotReport(vehicles, reports);

    try {
      trackPricing("pricing.lot_report_generated", dealerId, {
        total_vehicles: lotReport.total_vehicles,
        health_score: lotReport.inventory_health_score,
        source: "live",
      });
    } catch { /* analytics must never throw */ }

    return NextResponse.json(lotReport);
  } catch (err) {
    console.error("[GET /api/admin/pricing/lot-report] Error:", err);
    const report = getDemoLotReport();
    return NextResponse.json(report);
  }
}
