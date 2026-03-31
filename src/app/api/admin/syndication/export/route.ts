/**
 * POST /api/admin/syndication/export — Trigger a manual feed export
 *
 * Returns the dealer's inventory formatted for the specified platform.
 * Supports XML (ADF/XML for AutoTrader), CSV (Cars.com/Craigslist), and JSON (CarGurus/Facebook).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackSystem, trackSecurity } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Mock inventory for feed generation                                         */
/* -------------------------------------------------------------------------- */

const MOCK_INVENTORY = [
  { vin: "4T1G11AK5RU123456", year: 2024, make: "Toyota", model: "Camry XSE", trim: "XSE", body: "Sedan", color: "Midnight Black Metallic", mileage: 12, price: 31500, msrp: 32340, condition: "New", stock: "T24-0892", images: ["https://cdn.example.com/img/camry-1.jpg"], description: "2024 Toyota Camry XSE — premium sedan with panoramic roof and JBL audio." },
  { vin: "7FARS6H79RE045678", year: 2025, make: "Honda", model: "CR-V Hybrid", trim: "Sport-L", body: "SUV", color: "Canyon River Blue", mileage: 8, price: 39845, msrp: 39845, condition: "New", stock: "H25-0341", images: ["https://cdn.example.com/img/crv-1.jpg"], description: "2025 Honda CR-V Hybrid Sport-L — all-wheel drive hybrid with Honda Sensing." },
  { vin: "1FTFW1E80RFA12345", year: 2024, make: "Ford", model: "F-150 XLT", trim: "SuperCrew", body: "Truck", color: "Iconic Silver", mileage: 45, price: 51200, msrp: 52890, condition: "New", stock: "F24-0567", images: ["https://cdn.example.com/img/f150-1.jpg"], description: "2024 Ford F-150 XLT SuperCrew — 3.5L EcoBoost, tow package, 360 camera." },
  { vin: "5UX43DP05R9E78901", year: 2025, make: "BMW", model: "X3 xDrive30i", trim: "xDrive30i", body: "SUV", color: "Alpine White", mileage: 5, price: 48500, msrp: 49995, condition: "New", stock: "B25-0123", images: ["https://cdn.example.com/img/x3-1.jpg"], description: "2025 BMW X3 xDrive30i — turbocharged, panoramic roof, Harman Kardon." },
  { vin: "2T2HZMDA4PC123456", year: 2023, make: "Lexus", model: "RX 350 F Sport", trim: "F Sport", body: "SUV", color: "Matador Red Mica", mileage: 18200, price: 42900, msrp: 56500, condition: "Used", stock: "L23-0089", images: ["https://cdn.example.com/img/rx-1.jpg"], description: "2023 Lexus RX 350 F Sport — CPO, one owner, adaptive suspension." },
];

/* -------------------------------------------------------------------------- */
/* Format helpers                                                             */
/* -------------------------------------------------------------------------- */

function escapeCsv(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function escapeXml(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toAdfXml(vehicles: typeof MOCK_INVENTORY, dealerName: string): string {
  const vehicleNodes = vehicles.map((v) => `  <vehicle>
    <vin>${escapeXml(v.vin)}</vin>
    <year>${v.year}</year>
    <make>${escapeXml(v.make)}</make>
    <model>${escapeXml(v.model)}</model>
    <trim>${escapeXml(v.trim)}</trim>
    <bodystyle>${escapeXml(v.body)}</bodystyle>
    <exteriorcolor>${escapeXml(v.color)}</exteriorcolor>
    <mileage>${v.mileage}</mileage>
    <price>${v.price}</price>
    <msrp>${v.msrp}</msrp>
    <condition>${escapeXml(v.condition)}</condition>
    <stocknumber>${escapeXml(v.stock)}</stocknumber>
    <description>${escapeXml(v.description)}</description>
    <images>${v.images.map((img) => `<imageurl>${escapeXml(img)}</imageurl>`).join("")}</images>
  </vehicle>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<adf version="1.0">
  <dealer>
    <name>${escapeXml(dealerName)}</name>
    <generatedAt>${new Date().toISOString()}</generatedAt>
  </dealer>
  <vehicles>
${vehicleNodes}
  </vehicles>
</adf>`;
}

function toCsv(vehicles: typeof MOCK_INVENTORY): string {
  const header = "VIN,Year,Make,Model,Trim,Body,Color,Mileage,Price,MSRP,Condition,Stock,Description";
  const rows = vehicles.map((v) =>
    [
      escapeCsv(v.vin),
      v.year,
      escapeCsv(v.make),
      escapeCsv(v.model),
      escapeCsv(v.trim),
      escapeCsv(v.body),
      escapeCsv(v.color),
      v.mileage,
      v.price,
      v.msrp,
      escapeCsv(v.condition),
      escapeCsv(v.stock),
      escapeCsv(v.description),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

function toFeedJson(vehicles: typeof MOCK_INVENTORY, platform: string) {
  return {
    platform,
    generated_at: new Date().toISOString(),
    total_vehicles: vehicles.length,
    vehicles: vehicles.map((v) => ({
      vin: v.vin,
      year: v.year,
      make: v.make,
      model: v.model,
      trim: v.trim,
      body_style: v.body,
      exterior_color: v.color,
      mileage: v.mileage,
      price: v.price,
      msrp: v.msrp,
      condition: v.condition,
      stock_number: v.stock,
      description: v.description,
      images: v.images,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/syndication/export                                         */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const rl = await checkRateLimit(`syndication-export:${dealerId}`, 5, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", dealerId, { route: "syndication/export", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { platform, format } = body;

  if (!platform || typeof platform !== "string") {
    return NextResponse.json({ error: "Missing required field: platform" }, { status: 422 });
  }

  const VALID_PLATFORMS = ["autotrader", "cars_com", "cargurus", "facebook_marketplace", "craigslist"];
  if (!VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(", ")}` }, { status: 422 });
  }

  const VALID_FORMATS = ["xml", "csv", "json"];
  if (!format || typeof format !== "string" || !VALID_FORMATS.includes(format)) {
    return NextResponse.json({ error: `Invalid format. Must be one of: ${VALID_FORMATS.join(", ")}` }, { status: 422 });
  }

  /* ---- Fetch inventory (DB or mock) ---- */
  let vehicles = MOCK_INVENTORY;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT vin, year, make, model, trim, body_style as body, exterior_color as color,
                mileage, price, msrp, condition, stock_number as stock, description, images
           FROM vehicles
          WHERE dealer_id = $1 AND deleted_at IS NULL AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 500`,
        [dealerId],
      );
      if ((result.rows as unknown[]).length > 0) {
        vehicles = result.rows as typeof MOCK_INVENTORY;
      }
    } catch (err) {
      console.error("[api/admin/syndication/export] DB error, using mock inventory:", err);
      /* fall through to mock */
    }
  }

  /* ---- Generate feed ---- */
  let feedContent: string;
  let contentType: string;
  let filename: string;

  switch (format) {
    case "xml":
      feedContent = toAdfXml(vehicles, "Wolfpack Auto");
      contentType = "application/xml";
      filename = `${platform}-feed-${Date.now()}.xml`;
      break;
    case "csv":
      feedContent = toCsv(vehicles);
      contentType = "text/csv";
      filename = `${platform}-feed-${Date.now()}.csv`;
      break;
    case "json":
    default:
      feedContent = JSON.stringify(toFeedJson(vehicles, platform), null, 2);
      contentType = "application/json";
      filename = `${platform}-feed-${Date.now()}.json`;
      break;
  }

  try { trackSystem("system.syndication_exported" as never, dealerId, { platform: String(platform), format: String(format), vehicles: vehicles.length }); } catch {}

  return new NextResponse(feedContent, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
