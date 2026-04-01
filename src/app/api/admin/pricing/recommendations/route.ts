/**
 * GET /api/admin/pricing/recommendations
 *
 * Returns AI-powered pricing recommendations for all vehicles,
 * with optional VIN filter via query param (?vin=...).
 *
 * Response: array of PricingReport objects.
 * Emits: pricing.recommendations_generated analytics event.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import {
  getDemoPricingReports,
  getDemoPricingReportByVin,
  generateVehiclePricingReport,
  type PricingReport,
} from "@/lib/pricing-engine";
import { trackPricing } from "@/lib/analytics-hooks";

export async function GET(req: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const vinFilter = req.nextUrl.searchParams.get("vin");

  // Shadow mode — no DB
  if (!process.env.DATABASE_URL) {
    let reports: PricingReport[];

    if (vinFilter) {
      const report = getDemoPricingReportByVin(vinFilter);
      reports = report ? [report] : [];
    } else {
      reports = getDemoPricingReports();
    }

    try {
      trackPricing("pricing.recommendations_generated", dealerId, {
        vehicle_count: reports.length,
        vin_filter: vinFilter ?? "",
        source: "shadow",
      });
    } catch { /* analytics must never throw */ }

    return NextResponse.json({ reports, count: reports.length });
  }

  // Production mode — fetch from DB
  try {
    const { query } = await import("@/lib/db");

    // Build filter clause
    const params: unknown[] = [dealerId];
    let vinClause = "";
    if (vinFilter) {
      vinClause = " AND vin = $2";
      params.push(vinFilter);
    }

    const result = await query<{
      id: string;
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
      `SELECT id, vin, year, make, model,
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
       WHERE dealer_id = $1 AND status = 'available'${vinClause}
       ORDER BY created_at ASC`,
      params,
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

    try {
      trackPricing("pricing.recommendations_generated", dealerId, {
        vehicle_count: reports.length,
        vin_filter: vinFilter ?? "",
        source: "live",
      });
    } catch { /* analytics must never throw */ }

    return NextResponse.json({ reports, count: reports.length });
  } catch (err) {
    console.error("[GET /api/admin/pricing/recommendations] Error:", err);
    // Fall back to demo data
    const reports = vinFilter
      ? (() => { const r = getDemoPricingReportByVin(vinFilter); return r ? [r] : []; })()
      : getDemoPricingReports();
    return NextResponse.json({ reports, count: reports.length });
  }
}
