/**
 * POST /api/admin/quick-add
 *
 * "Quick Add" endpoint — minimal input, maximum automation.
 *
 * Accepts: { vin, dealer_id, price?, mileage?, photos? }
 * Performs: VIN decode -> smart defaults -> listing generation ->
 *           photo processing -> PostgreSQL save -> Qdrant index
 * Returns:  Complete vehicle record ready for the storefront.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { decodeVIN, isValidVIN } from "@/lib/intake/vin-decoder";
import { getSmartDefaults } from "@/lib/intake/smart-defaults";
import { generateListing } from "@/lib/intake/listing-generator";
import { processPhonePhotos } from "@/lib/intake/photo-from-phone";
import { query } from "@/lib/db";
import type { Vehicle, VehicleCondition, VehicleStatus } from "@/types/vehicle";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";

/* ------------------------------------------------------------------ */
/*  Stock number generation                                            */
/* ------------------------------------------------------------------ */

function generateStockNumber(vin: string): string {
  const suffix = vin.slice(-6).toUpperCase();
  const year = new Date().getFullYear().toString().slice(-2);
  return `WP${year}-${suffix}`;
}

/* ------------------------------------------------------------------ */
/*  Qdrant indexing (best-effort)                                      */
/* ------------------------------------------------------------------ */

async function indexInQdrant(vehicle: Vehicle): Promise<boolean> {
  try {
    // Dynamic import — Qdrant may not be available in all environments
    const { indexVehicleToQdrant } = await import("@/lib/vehicle-search");
    return await indexVehicleToQdrant(vehicle as never);
  } catch {
    // Qdrant not available — vehicle is still saved in PostgreSQL
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Save to PostgreSQL                                                 */
/* ------------------------------------------------------------------ */

async function saveVehicle(vehicle: Vehicle): Promise<void> {
  await query(
    `INSERT INTO vehicles (
       id, vin, stock_number, dealer_id,
       year, make, model, trim, body_style,
       exterior_color, interior_color,
       engine, transmission, drivetrain, fuel_type,
       mpg_city, mpg_highway,
       msrp, price, internet_price,
       condition, mileage, status,
       photos, photo_count,
       description, features,
       created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7, $8, $9,
       $10, $11,
       $12, $13, $14, $15,
       $16, $17,
       $18, $19, $20,
       $21, $22, $23,
       $24, $25,
       $26, $27,
       $28, $29
     )
     ON CONFLICT (vin, dealer_id) DO UPDATE SET
       price = EXCLUDED.price,
       mileage = EXCLUDED.mileage,
       photos = EXCLUDED.photos,
       photo_count = EXCLUDED.photo_count,
       description = EXCLUDED.description,
       features = EXCLUDED.features,
       status = EXCLUDED.status,
       updated_at = EXCLUDED.updated_at`,
    [
      vehicle.id,
      vehicle.vin,
      vehicle.stock_number,
      vehicle.dealer_id,
      vehicle.year,
      vehicle.make,
      vehicle.model,
      vehicle.trim,
      vehicle.body_style,
      vehicle.exterior_color,
      vehicle.interior_color,
      vehicle.engine,
      vehicle.transmission,
      vehicle.drivetrain,
      vehicle.fuel_type,
      vehicle.mpg_city,
      vehicle.mpg_highway,
      vehicle.msrp,
      vehicle.price,
      vehicle.internet_price,
      vehicle.condition,
      vehicle.mileage,
      vehicle.status,
      JSON.stringify(vehicle.photos),
      vehicle.photo_count,
      vehicle.description,
      JSON.stringify(vehicle.features),
      vehicle.created_at,
      vehicle.updated_at,
    ],
  );
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  // --- Authentication ---
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      success: true,
      vehicle: { id: "shadow-vehicle-1", vin: "SHADOW00000000000", year: 2024, make: "Demo", model: "Vehicle", price: 29999, status: "available" },
      meta: { vin_decoded: false, listing_generated: false, photos_processed: 0, qdrant_indexed: false },
      message: "Shadow mode — no database configured.",
    });
  }

  const dealerId = authResult.user.dealer_id;

  try {
    const formData = await request.formData();

    const vin = formData.get("vin")?.toString().trim().toUpperCase();
    const priceStr = formData.get("price")?.toString();
    const mileageStr = formData.get("mileage")?.toString();

    // Collect photo files
    const photoFiles: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "photos" && value instanceof File && value.size > 0) {
        photoFiles.push(value);
      }
    }

    // --- Validation ---

    if (!vin) {
      return NextResponse.json(
        { error: "Missing required field: vin" },
        { status: 400 },
      );
    }

    if (!isValidVIN(vin)) {
      return NextResponse.json(
        { error: "Invalid VIN format. Must be 17 alphanumeric characters (no I, O, or Q)." },
        { status: 400 },
      );
    }

    const price = priceStr ? parseInt(priceStr, 10) : undefined;
    const mileage = mileageStr ? parseInt(mileageStr, 10) : 0;

    // --- Step 1: Decode VIN ---

    const decoded = await decodeVIN(vin);

    if (!decoded) {
      return NextResponse.json(
        { error: "Unable to decode VIN. Please verify the VIN and try again." },
        { status: 422 },
      );
    }

    // --- Step 2: Smart defaults ---

    const partial: Partial<Vehicle> = {
      vin,
      dealer_id: dealerId,
      year: decoded.year,
      make: decoded.make,
      model: decoded.model,
      trim: decoded.trim ?? "",
      body_style: decoded.body_style ?? "",
      engine: decoded.engine ?? "",
      transmission: (decoded.transmission as Vehicle["transmission"]) ?? "automatic",
      drivetrain: (decoded.drivetrain as Vehicle["drivetrain"]) ?? "fwd",
      fuel_type: (decoded.fuel_type as Vehicle["fuel_type"]) ?? "gasoline",
      mileage,
      price: price ?? 0,
    };

    const defaults = await getSmartDefaults(partial, dealerId);

    // --- Step 3: Generate listing ---

    const vehicleForListing: Partial<Vehicle> = {
      ...partial,
      condition: defaults.suggested_condition,
      features: defaults.suggested_features.slice(0, 10),
      price: price ?? defaults.suggested_price ?? 0,
    };

    const listing = await generateListing(vehicleForListing);

    // --- Step 4: Process photos ---

    const photoResult = await processPhonePhotos(photoFiles, dealerId, vin);

    // --- Step 5: Assemble complete vehicle record ---

    const now = new Date().toISOString();
    const vehicle: Vehicle = {
      id: randomUUID(),
      vin,
      stock_number: generateStockNumber(vin),
      dealer_id: dealerId,
      year: decoded.year,
      make: decoded.make,
      model: decoded.model,
      trim: decoded.trim ?? "",
      body_style: decoded.body_style ?? "",
      exterior_color: "",
      interior_color: "",
      engine: decoded.engine ?? "",
      transmission: (decoded.transmission as Vehicle["transmission"]) ?? "automatic",
      drivetrain: (decoded.drivetrain as Vehicle["drivetrain"]) ?? "fwd",
      fuel_type: (decoded.fuel_type as Vehicle["fuel_type"]) ?? "gasoline",
      mpg_city: null,
      mpg_highway: null,
      msrp: null,
      price: price ?? defaults.suggested_price ?? 0,
      internet_price: null,
      condition: defaults.suggested_condition as VehicleCondition,
      mileage,
      status: defaults.suggested_status as VehicleStatus,
      photos: photoResult.photos,
      photo_count: photoResult.photos.length,
      description: listing.description,
      features: defaults.suggested_features.slice(0, 10),
      created_at: now,
      updated_at: now,
    };

    // --- Step 6: Save to PostgreSQL ---

    await saveVehicle(vehicle);

    // --- Step 7: Index in Qdrant (best-effort) ---

    const indexed = await indexInQdrant(vehicle);

    // --- Done ---

    try { trackSystem("system.vehicle_quick_added", authResult?.user?.dealer_id ?? "system", { action: "vehicle_quick_added", vin }); } catch {}

    return NextResponse.json({
      success: true,
      vehicle,
      meta: {
        vin_decoded: true,
        smart_defaults_confidence: defaults.confidence,
        listing_generated: true,
        photos_processed: photoResult.photos.length,
        photos_auto_ordered: photoResult.auto_ordered,
        qdrant_indexed: indexed,
        seo: {
          title: listing.seo_title,
          description: listing.seo_description,
        },
        highlights: listing.highlights,
      },
    });
  } catch (err) {
    console.error("[quick-add] Error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while adding the vehicle." },
      { status: 500 },
    );
  }
}
