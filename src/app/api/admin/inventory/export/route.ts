/**
 * GET /api/admin/inventory/export — Export dealer inventory as CSV
 *
 * Downloads a CSV file with columns: VIN, Year, Make, Model, Trim, Color,
 * Mileage, Price, Status, Stock#, Days on Lot.
 *
 * Follows the same pattern as /api/admin/export/leads.
 */
import { NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackSystem } from "@/lib/analytics-hooks";
import { placeholderVehicles } from "@/lib/placeholder-data";

/* -------------------------------------------------------------------------- */
/* CSV helpers                                                                */
/* -------------------------------------------------------------------------- */

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_HEADER =
  "VIN,Year,Make,Model,Trim,Color,Mileage,Price,Status,Stock #,Days on Lot";

/* -------------------------------------------------------------------------- */
/* GET /api/admin/inventory/export                                            */
/* -------------------------------------------------------------------------- */

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  const today = new Date().toISOString().slice(0, 10);

  interface ExportRow {
    vin: string;
    year: number;
    make: string;
    model: string;
    trim: string;
    exterior_color: string;
    mileage: number;
    price: number;
    status: string;
    stock_number: string;
    days_on_lot: number;
  }

  let vehicles: ExportRow[];

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT
           v.vin, v.year, v.make, v.model, v.trim,
           v.exterior_color, COALESCE(v.mileage, 0) AS mileage,
           v.price, v.status, v.stock_number,
           EXTRACT(EPOCH FROM (now() - v.created_at))::int / 86400 AS days_on_lot
         FROM vehicles v
         WHERE v.dealer_id = $1
         ORDER BY v.created_at DESC`,
        [dealerId],
      );
      vehicles = result.rows as ExportRow[];
    } catch (err) {
      console.error("[api/admin/inventory/export] DB error, falling back to placeholder:", err);
      vehicles = placeholderVehicles.map((v, i) => ({
        vin: v.vin,
        year: v.year,
        make: v.make,
        model: v.model,
        trim: v.trim,
        exterior_color: v.exteriorColor,
        mileage: v.mileage,
        price: v.price,
        status: i % 3 === 0 ? "pending" : i % 5 === 0 ? "sold" : "available",
        stock_number: v.stockNumber,
        days_on_lot: i * 3,
      }));
    }
  } else {
    /* ---- Shadow mode ---- */
    vehicles = placeholderVehicles.map((v, i) => ({
      vin: v.vin,
      year: v.year,
      make: v.make,
      model: v.model,
      trim: v.trim,
      exterior_color: v.exteriorColor,
      mileage: v.mileage,
      price: v.price,
      status: i % 3 === 0 ? "pending" : i % 5 === 0 ? "sold" : "available",
      stock_number: v.stockNumber,
      days_on_lot: i * 3,
    }));
  }

  /* ---- Build CSV ---- */
  const rows = [
    CSV_HEADER,
    ...vehicles.map((v) =>
      [
        escapeCsv(v.vin),
        v.year,
        escapeCsv(v.make),
        escapeCsv(v.model),
        escapeCsv(v.trim),
        escapeCsv(v.exterior_color),
        v.mileage,
        v.price,
        escapeCsv(v.status),
        escapeCsv(v.stock_number),
        v.days_on_lot,
      ].join(","),
    ),
  ];
  const csv = rows.join("\n");

  try { trackSystem("system.inventory_exported", dealerId, { action: "csv_export", vehicle_count: vehicles.length }); } catch {}

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventory-export-${today}.csv"`,
    },
  });
}
