/**
 * POST /api/admin/inventory/import
 *
 * Bulk-import vehicles from a CSV file into the current dealer's inventory.
 *
 * Accepts:
 *   - multipart/form-data with a `file` field (the CSV)
 *   - application/json with `{ csvData: "<base64>" }` (for wizard integration)
 *
 * Limits:
 *   - File size: 5 MB max (enforced before parsing)
 *   - Row count: 10,000 rows max (enforced after parsing header)
 *
 * Response:
 *   { imported: N, skipped: M, errors: [...], top_error_types: {...} }
 *
 * Security:
 *   - dealer_id is always sourced from the authenticated session — never from CSV
 *   - Rate limited: 10 imports per hour per dealer
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit-log";
import { trackSystem } from "@/lib/analytics-hooks";
import { pool } from "@/lib/db";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 10_000;
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/i;

/* -------------------------------------------------------------------------- */
/* CSV parsing                                                                */
/* -------------------------------------------------------------------------- */

interface ParsedVehicleRow {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  price: number;
  msrp: number | null;
  mileage: number;
  condition: string;
  exterior_color: string | null;
  fuel_type: string | null;
  transmission: string | null;
  body_style: string | null;
  description: string | null;
}

interface RowError {
  row: number;
  message: string;
  error_type: string;
}

interface ParseResult {
  rows: ParsedVehicleRow[];
  errors: RowError[];
}

/**
 * Split a single CSV line into fields, respecting double-quoted values.
 * Handles quoted commas (e.g. "$35,000" → "35000" after cleanup) and
 * escaped double-quotes ("" inside a quoted field).
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped double-quote inside a quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse CSV text into vehicle rows.
 *
 * Uses a proper quoted-field splitter so prices like $35,000 inside
 * double-quotes are handled correctly. No external dependencies required.
 */
function parseCsvText(csvText: string, maxRows: number): ParseResult {
  const rows: ParsedVehicleRow[] = [];
  const errors: RowError[] = [];

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    errors.push({
      row: 0,
      message: "CSV must have a header row and at least one data row",
      error_type: "empty_file",
    });
    return { rows, errors };
  }

  // Parse header — normalize to lowercase, strip non-alphanumeric
  const headers = splitCsvLine(lines[0])
    .map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ""));

  // Flexible column name aliases
  const aliases: Record<string, string[]> = {
    vin: ["vin", "vehicle_vin", "vin_number"],
    year: ["year", "model_year", "yr"],
    make: ["make", "manufacturer", "brand"],
    model: ["model", "model_name"],
    trim: ["trim", "trim_level", "trimlevel"],
    price: ["price", "asking_price", "list_price", "listprice", "askingprice"],
    msrp: ["msrp", "sticker_price", "stickerprice"],
    mileage: ["mileage", "miles", "odometer"],
    condition: ["condition", "cond", "vehicle_condition"],
    exterior_color: ["color", "exterior_color", "exteriorcolor", "ext_color"],
    fuel_type: ["fuel_type", "fuel", "fueltype"],
    transmission: ["transmission", "trans"],
    body_style: ["body_style", "body", "bodystyle", "type"],
    description: ["description", "desc", "notes"],
  };

  const colMap: Record<string, number> = {};
  for (const [field, names] of Object.entries(aliases)) {
    const idx = headers.findIndex((h) => names.includes(h));
    if (idx !== -1) colMap[field] = idx;
  }

  // Check required columns
  const requiredCols = ["vin", "year", "make", "model", "price"];
  const missingCols = requiredCols.filter((c) => !(c in colMap));
  if (missingCols.length > 0) {
    errors.push({
      row: 0,
      message: `Missing required CSV columns: ${missingCols.join(", ")}`,
      error_type: "missing_columns",
    });
    return { rows, errors };
  }

  // Cap data rows before parsing (skip header)
  const dataLines = lines.slice(1, maxRows + 2); // +1 for header already removed, +1 to detect overflow
  const rowsToProcess = dataLines.slice(0, maxRows);
  const overLimit = dataLines.length > maxRows;

  if (overLimit) {
    errors.push({
      row: maxRows + 1,
      message: `CSV exceeds ${maxRows.toLocaleString()} row limit. Only first ${maxRows.toLocaleString()} rows were processed.`,
      error_type: "row_limit_exceeded",
    });
  }

  for (let i = 0; i < rowsToProcess.length; i++) {
    const lineNum = i + 2; // 1-indexed, +1 for header
    const values = splitCsvLine(rowsToProcess[i]);

    try {
      // Required fields
      const vin = (values[colMap.vin] ?? "").toUpperCase();
      const yearStr = values[colMap.year] ?? "";
      const make = values[colMap.make] ?? "";
      const model = values[colMap.model] ?? "";
      const priceStr = values[colMap.price] ?? "";

      if (!vin) {
        errors.push({ row: lineNum, message: "Missing VIN", error_type: "missing_vin" });
        continue;
      }

      if (!VIN_PATTERN.test(vin)) {
        errors.push({
          row: lineNum,
          message: `Invalid VIN "${vin}" (must be 17 chars, A-Z/0-9, no I/O/Q)`,
          error_type: "invalid_vin",
        });
        continue;
      }

      const year = parseInt(yearStr, 10);
      if (isNaN(year) || year < 1900 || year > new Date().getFullYear() + 2) {
        errors.push({
          row: lineNum,
          message: `Invalid year "${yearStr}"`,
          error_type: "invalid_year",
        });
        continue;
      }

      if (!make) {
        errors.push({ row: lineNum, message: "Missing make", error_type: "missing_make" });
        continue;
      }

      if (!model) {
        errors.push({ row: lineNum, message: "Missing model", error_type: "missing_model" });
        continue;
      }

      const price = parseFloat(priceStr.replace(/[$,]/g, ""));
      if (isNaN(price) || price <= 0) {
        errors.push({
          row: lineNum,
          message: `Invalid price "${priceStr}" (must be a positive number)`,
          error_type: "invalid_price",
        });
        continue;
      }

      // Optional fields
      const mileageRaw = colMap.mileage !== undefined ? values[colMap.mileage] ?? "" : "";
      const mileage = mileageRaw ? parseInt(mileageRaw.replace(/[,]/g, ""), 10) : 0;

      const msrpRaw = colMap.msrp !== undefined ? values[colMap.msrp] ?? "" : "";
      const msrp = msrpRaw ? parseFloat(msrpRaw.replace(/[$,]/g, "")) : null;

      const trim = colMap.trim !== undefined ? (values[colMap.trim] ?? "").trim() || null : null;

      const conditionRaw = colMap.condition !== undefined
        ? (values[colMap.condition] ?? "").toLowerCase().trim()
        : "used";
      const condition = ["new", "used", "certified"].includes(conditionRaw)
        ? conditionRaw
        : "used";

      const exterior_color = colMap.exterior_color !== undefined
        ? (values[colMap.exterior_color] ?? "").trim() || null
        : null;

      const fuel_type = colMap.fuel_type !== undefined
        ? (values[colMap.fuel_type] ?? "").trim() || null
        : null;

      const transmission = colMap.transmission !== undefined
        ? (values[colMap.transmission] ?? "").trim() || null
        : null;

      const body_style = colMap.body_style !== undefined
        ? (values[colMap.body_style] ?? "").trim() || null
        : null;

      const description = colMap.description !== undefined
        ? (values[colMap.description] ?? "").trim() || null
        : null;

      rows.push({
        vin,
        year,
        make,
        model,
        trim,
        price,
        msrp: msrp !== null && !isNaN(msrp) && msrp > 0 ? msrp : null,
        mileage: isNaN(mileage) ? 0 : mileage,
        condition,
        exterior_color,
        fuel_type,
        transmission,
        body_style,
        description,
      });
    } catch {
      errors.push({
        row: lineNum,
        message: "Failed to parse row",
        error_type: "parse_error",
      });
    }
  }

  return { rows, errors };
}

/**
 * Summarise the most common error types from row-level errors.
 * Used by the learning system to surface data quality issues.
 */
function summariseErrorTypes(errors: RowError[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of errors) {
    counts[e.error_type] = (counts[e.error_type] ?? 0) + 1;
  }
  return counts;
}

/* -------------------------------------------------------------------------- */
/* Route handler                                                              */
/* -------------------------------------------------------------------------- */

export async function POST(req: NextRequest): Promise<NextResponse> {
  // --- Authentication -------------------------------------------------------
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult as NextResponse;

  const dealerId = authResult.user.dealer_id;

  // --- Rate limiting --------------------------------------------------------
  const rl = await checkRateLimit(`csv-import:${dealerId}`, 10, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Too many import requests. Please wait before trying again.",
        reset_at: rl.resetAt,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.resetAt - Math.floor(Date.now() / 1000)),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rl.resetAt),
        },
      },
    );
  }

  // --- Shadow mode ----------------------------------------------------------
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      {
        imported: 0,
        skipped: 0,
        errors: [],
        top_error_types: {},
        message: "Shadow mode — no database configured.",
      },
      { status: 200 },
    );
  }

  // --- Read CSV data --------------------------------------------------------
  let csvText: string;
  let fileSizeBytes = 0;
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Failed to parse multipart form data" },
        { status: 400 },
      );
    }

    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: 'A "file" field is required in the multipart body' },
        { status: 400 },
      );
    }

    // Type-safe: file is a File object at this point
    const fileObj = file as File;

    // Mime type check
    const mimeOk =
      fileObj.type === "text/csv" ||
      fileObj.type === "application/csv" ||
      fileObj.type === "text/plain" ||
      fileObj.name?.endsWith(".csv");
    if (!mimeOk) {
      return NextResponse.json(
        { error: "Only CSV files are accepted (.csv)" },
        { status: 415 },
      );
    }

    fileSizeBytes = fileObj.size;
    if (fileSizeBytes > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `File too large. Maximum allowed size is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
        },
        { status: 413 },
      );
    }

    csvText = await fileObj.text();
  } else if (contentType.includes("application/json")) {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { csvData } = body as { csvData?: string };
    if (!csvData || typeof csvData !== "string") {
      return NextResponse.json(
        { error: '"csvData" (base64-encoded CSV string) is required' },
        { status: 400 },
      );
    }

    try {
      csvText = Buffer.from(csvData, "base64").toString("utf-8");
    } catch {
      return NextResponse.json(
        { error: "Failed to decode base64 csvData" },
        { status: 400 },
      );
    }

    fileSizeBytes = Buffer.byteLength(csvData, "base64");
    if (fileSizeBytes > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          error: `Decoded CSV too large. Maximum allowed size is ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
        },
        { status: 413 },
      );
    }
  } else {
    return NextResponse.json(
      {
        error:
          "Content-Type must be multipart/form-data (file upload) or application/json ({ csvData: base64 })",
      },
      { status: 415 },
    );
  }

  // --- Parse CSV ------------------------------------------------------------
  const { rows: parsedRows, errors: parseErrors } = parseCsvText(csvText, MAX_ROWS);

  // If there are only structural errors (missing columns, empty file), return early
  const structuralErrors = parseErrors.filter((e) => e.row === 0);
  if (structuralErrors.length > 0) {
    return NextResponse.json(
      {
        imported: 0,
        skipped: 0,
        errors: structuralErrors.map((e) => e.message),
        top_error_types: summariseErrorTypes(parseErrors),
      },
      { status: 422 },
    );
  }

  // --- Insert rows ----------------------------------------------------------
  let imported = 0;
  let skipped = 0;
  const insertErrors: RowError[] = [...parseErrors]; // start with parse errors

  for (const vehicle of parsedRows) {
    try {
      await pool.query(
        `INSERT INTO vehicles (
           dealer_id, vin,
           year, make, model, trim,
           price, msrp,
           mileage, condition,
           exterior_color, fuel_type, transmission, body_style,
           description,
           status, created_at, updated_at
         ) VALUES (
           $1, $2,
           $3, $4, $5, $6,
           $7, $8,
           $9, $10,
           $11, $12, $13, $14,
           $15,
           'available', NOW(), NOW()
         )
         ON CONFLICT (dealer_id, vin) DO UPDATE SET
           year = EXCLUDED.year,
           make = EXCLUDED.make,
           model = EXCLUDED.model,
           trim = EXCLUDED.trim,
           price = EXCLUDED.price,
           msrp = COALESCE(EXCLUDED.msrp, vehicles.msrp),
           mileage = EXCLUDED.mileage,
           condition = EXCLUDED.condition,
           exterior_color = COALESCE(EXCLUDED.exterior_color, vehicles.exterior_color),
           fuel_type = COALESCE(EXCLUDED.fuel_type, vehicles.fuel_type),
           transmission = COALESCE(EXCLUDED.transmission, vehicles.transmission),
           body_style = COALESCE(EXCLUDED.body_style, vehicles.body_style),
           description = COALESCE(EXCLUDED.description, vehicles.description),
           updated_at = NOW()`,
        [
          dealerId, // always from session — never from CSV
          vehicle.vin,
          vehicle.year,
          vehicle.make,
          vehicle.model,
          vehicle.trim,
          vehicle.price,
          vehicle.msrp ?? vehicle.price,
          vehicle.mileage,
          vehicle.condition,
          vehicle.exterior_color,
          vehicle.fuel_type,
          vehicle.transmission,
          vehicle.body_style,
          vehicle.description,
        ],
      );
      imported++;
    } catch (err: unknown) {
      skipped++;
      const pgErr = err as { code?: string; message?: string };
      const msg =
        pgErr?.code === "23505"
          ? `VIN ${vehicle.vin}: duplicate VIN already exists for this dealer`
          : `VIN ${vehicle.vin}: ${pgErr?.message ?? "insert failed"}`;
      insertErrors.push({
        row: 0, // row unknown at this point — VIN identifies it
        message: msg,
        error_type: pgErr?.code === "23505" ? "duplicate_vin" : "db_error",
      });
    }
  }

  // --- Audit log ------------------------------------------------------------
  void auditLog("inventory.csv_imported", {
    dealer_id: dealerId,
    imported,
    skipped,
    errors: insertErrors.length,
  }).catch(() => {});

  // --- Analytics ------------------------------------------------------------
  const topErrorTypes = summariseErrorTypes(insertErrors);
  try {
    trackSystem("system.inventory_csv_imported", dealerId, {
      row_count: parsedRows.length + parseErrors.filter((e) => e.row > 0).length,
      imported,
      skipped,
      error_count: insertErrors.length,
      file_size_bytes: fileSizeBytes,
      top_error_type: Object.entries(topErrorTypes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "none",
    });
  } catch { /* analytics never blocks */ }

  // --- Response -------------------------------------------------------------
  return NextResponse.json({
    imported,
    skipped,
    errors: insertErrors.map((e) => e.message),
    top_error_types: topErrorTypes,
  });
}
