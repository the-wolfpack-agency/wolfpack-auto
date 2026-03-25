/**
 * DMS CSV upload endpoint — manual inventory upload.
 *
 * Accepts multipart/form-data with a CSV file.
 * Auto-detects column headers and normalises through the feed processor.
 * Returns per-vehicle results synchronously.
 */

import { NextRequest, NextResponse } from "next/server";
import { processFeed } from "@/lib/dms/feed-processor";
import { DMSProvider } from "@/lib/dms/types";
import type { DMSVehicleRecord } from "@/lib/dms/types";

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Parse CSV text into an array of objects keyed by header names.
 *
 * Handles:
 *  - Quoted fields with commas inside
 *  - CRLF and LF line endings
 *  - Trailing commas / empty fields
 */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j].trim();
      if (header) {
        row[header] = values[j]?.trim() ?? "";
      }
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line, respecting quoted fields.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
  }

  fields.push(current);
  return fields;
}

// ---------------------------------------------------------------------------
// Column auto-detection
// ---------------------------------------------------------------------------

/**
 * Map CSV column headers to DMSVehicleRecord field names.
 *
 * This handles common variations dealers use in their spreadsheets:
 *  - "VIN Number" -> vin
 *  - "Stock #" -> stock_number
 *  - "Asking Price" -> price
 */
const COLUMN_ALIASES: Record<string, string> = {
  vin: "vin",
  "vin number": "vin",
  "vin #": "vin",
  "vin#": "vin",
  stock: "stock_number",
  "stock number": "stock_number",
  "stock #": "stock_number",
  "stock#": "stock_number",
  "stk #": "stock_number",
  "stk#": "stock_number",
  year: "year",
  yr: "year",
  make: "make",
  manufacturer: "make",
  model: "model",
  trim: "trim",
  "trim level": "trim",
  "body style": "body_style",
  body: "body_style",
  "body type": "body_style",
  "exterior color": "exterior_color",
  "ext color": "exterior_color",
  "ext. color": "exterior_color",
  color: "exterior_color",
  "interior color": "interior_color",
  "int color": "interior_color",
  "int. color": "interior_color",
  engine: "engine",
  transmission: "transmission",
  trans: "transmission",
  drivetrain: "drivetrain",
  "drive type": "drivetrain",
  "fuel type": "fuel_type",
  fuel: "fuel_type",
  "city mpg": "mpg_city",
  "mpg city": "mpg_city",
  "highway mpg": "mpg_highway",
  "hwy mpg": "mpg_highway",
  "mpg highway": "mpg_highway",
  price: "price",
  "asking price": "price",
  "list price": "price",
  "sale price": "price",
  msrp: "msrp",
  "internet price": "internet_price",
  "web price": "internet_price",
  condition: "condition",
  "new/used": "condition",
  "new or used": "condition",
  type: "condition",
  mileage: "mileage",
  miles: "mileage",
  odometer: "mileage",
  status: "status",
  description: "description",
  comments: "description",
  notes: "description",
  features: "features",
  options: "features",
  equipment: "features",
  photos: "photos",
  images: "photos",
  "photo url": "photos",
  "image url": "photos",
};

function mapColumns(rows: Record<string, string>[]): DMSVehicleRecord[] {
  return rows.map((row) => {
    const mapped: Record<string, string> = {};

    for (const [csvHeader, value] of Object.entries(row)) {
      const normalizedHeader = csvHeader.toLowerCase().trim();
      const fieldName = COLUMN_ALIASES[normalizedHeader] ?? normalizedHeader;
      mapped[fieldName] = value;
    }

    return mapped as unknown as DMSVehicleRecord;
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const dealerId = request.headers.get("x-dealer-id");

  if (!dealerId) {
    return NextResponse.json(
      { error: "Missing x-dealer-id header" },
      { status: 400 },
    );
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a CSV file" },
      { status: 400 },
    );
  }

  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field in form data" },
      { status: 400 },
    );
  }

  // Validate file type
  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".csv")) {
    return NextResponse.json(
      { error: "Only CSV files are supported" },
      { status: 400 },
    );
  }

  // Size limit: 10MB
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 10MB." },
      { status: 400 },
    );
  }

  // Read and parse CSV
  let csvText: string;
  try {
    csvText = await file.text();
  } catch {
    return NextResponse.json(
      { error: "Failed to read file contents" },
      { status: 400 },
    );
  }

  const csvRows = parseCSV(csvText);

  if (csvRows.length === 0) {
    return NextResponse.json(
      { error: "CSV file is empty or has no data rows" },
      { status: 400 },
    );
  }

  // Map columns and process
  const records = mapColumns(csvRows);

  try {
    const result = await processFeed(
      dealerId,
      DMSProvider.GENERIC_CSV,
      records,
      "upload",
    );

    return NextResponse.json({
      status: "completed",
      summary: {
        received: result.vehicles_received,
        added: result.vehicles_added,
        updated: result.vehicles_updated,
        removed: result.vehicles_removed,
        skipped: result.vehicles_skipped,
        errors: result.errors.length,
        warnings: result.warnings.length,
        duration_ms: result.sync_duration_ms,
      },
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (err) {
    console.error("[dms/upload] Processing error:", err);
    return NextResponse.json(
      { error: "Failed to process inventory file" },
      { status: 500 },
    );
  }
}
