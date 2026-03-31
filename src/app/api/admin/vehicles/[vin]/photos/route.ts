/**
 * GET  /api/admin/vehicles/[vin]/photos — List photos for a vehicle
 * POST /api/admin/vehicles/[vin]/photos — Upload photos for a vehicle
 *
 * POST accepts multipart form data with one or more photo files.
 * Validates file type (jpg, png, webp) and size (<10 MB).
 * Uploads to R2 when configured, falls back to local /public/uploads/ for dev.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { checkRateLimit } from "@/lib/rate-limit";
import { trackSystem, trackSecurity } from "@/lib/analytics-hooks";
import { uploadImage, getPublicUrl, buildKey } from "@/lib/storage";
import path from "path";
import { writeFile, mkdir, readdir } from "fs/promises";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface RouteContext {
  params: Promise<{ vin: string }>;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}

function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function sanitizeFilename(filename: string): string {
  // Strip path traversal and non-safe characters
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, ".");
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/vehicles/[vin]/photos                                       */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  context: RouteContext,
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const { vin } = await context.params;
  if (!vin) {
    return NextResponse.json({ error: "VIN is required" }, { status: 400 });
  }

  const upperVin = vin.toUpperCase();

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT photos, photo_count FROM vehicles
         WHERE dealer_id = $1 AND vin = $2 AND deleted_at IS NULL
         LIMIT 1`,
        [dealerId, upperVin],
      );

      if ((result.rows as unknown[]).length === 0) {
        return NextResponse.json({ error: "Vehicle not found" }, { status: 404 });
      }

      const row = result.rows[0] as Record<string, unknown>;
      const photos = typeof row.photos === "string"
        ? JSON.parse(row.photos)
        : row.photos ?? [];

      return NextResponse.json({
        vin: upperVin,
        photos,
        total: Array.isArray(photos) ? photos.length : 0,
      });
    } catch (err) {
      console.error("[api/admin/vehicles/[vin]/photos] DB error, falling back:", err);
      /* fall through to local check */
    }
  }

  /* ---- Local fallback: check /public/uploads/vehicles/{vin}/ ---- */
  try {
    const uploadDir = path.join(process.cwd(), "public", "uploads", "vehicles", upperVin);
    const files = await readdir(uploadDir);
    const photos = files
      .filter((f) => ALLOWED_EXTENSIONS.has(getExtension(f)))
      .map((f) => ({
        url: `/uploads/vehicles/${upperVin}/${f}`,
        filename: f,
      }));

    return NextResponse.json({
      vin: upperVin,
      photos,
      total: photos.length,
    });
  } catch {
    // Directory doesn't exist — no photos yet
    return NextResponse.json({
      vin: upperVin,
      photos: [],
      total: 0,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/vehicles/[vin]/photos                                      */
/* -------------------------------------------------------------------------- */

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const { vin } = await context.params;
  if (!vin) {
    return NextResponse.json({ error: "VIN is required" }, { status: 400 });
  }

  const upperVin = vin.toUpperCase();

  const rl = await checkRateLimit(`vehicle-photos:${dealerId}`, 20, 60);
  if (!rl.allowed) {
    try { trackSecurity("security.rate_limit_triggered", dealerId, { route: "vehicle-photos", remaining: 0 }); } catch {}
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  /* ---- Parse multipart form data ---- */
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data. Send multipart/form-data with photo files." },
      { status: 400 },
    );
  }

  const files: File[] = [];
  for (const [, value] of formData.entries()) {
    if (value instanceof File && value.size > 0) {
      files.push(value);
    }
  }

  if (files.length === 0) {
    return NextResponse.json(
      { error: "No photo files found in request" },
      { status: 400 },
    );
  }

  /* ---- Validate each file ---- */
  const errors: string[] = [];
  const validFiles: { file: File; ext: string; safeName: string }[] = [];

  for (const file of files) {
    const ext = getExtension(file.name);

    // Check extension
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      errors.push(`${file.name}: unsupported file type (.${ext}). Allowed: jpg, png, webp`);
      continue;
    }

    // Check MIME type
    if (file.type && !ALLOWED_TYPES.has(file.type)) {
      errors.push(`${file.name}: invalid MIME type (${file.type})`);
      continue;
    }

    // Check size
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name}: exceeds 10 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
      continue;
    }

    const timestamp = Date.now();
    const safeName = sanitizeFilename(`${timestamp}_${file.name}`);
    validFiles.push({ file, ext, safeName });
  }

  if (validFiles.length === 0) {
    return NextResponse.json(
      { error: "No valid photos to upload", details: errors },
      { status: 422 },
    );
  }

  /* ---- Upload ---- */
  const uploaded: { url: string; filename: string; size: number; content_type: string }[] = [];

  if (isR2Configured()) {
    /* ---- R2 path ---- */
    for (const { file, safeName } of validFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const result = await uploadImage(dealerId, upperVin, safeName, buffer);
        uploaded.push({
          url: result.publicUrl,
          filename: safeName,
          size: result.size,
          content_type: result.contentType,
        });
      } catch (err) {
        console.error(`[photos] R2 upload failed for ${safeName}:`, err);
        errors.push(`${file.name}: upload failed`);
      }
    }
  } else {
    /* ---- Local fallback: save to /public/uploads/vehicles/{vin}/ ---- */
    const uploadDir = path.join(process.cwd(), "public", "uploads", "vehicles", upperVin);
    try {
      await mkdir(uploadDir, { recursive: true });
    } catch {
      return NextResponse.json(
        { error: "Failed to create upload directory" },
        { status: 500 },
      );
    }

    for (const { file, safeName } of validFiles) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const filePath = path.join(uploadDir, safeName);

        await writeFile(filePath, buffer);

        uploaded.push({
          url: `/uploads/vehicles/${upperVin}/${safeName}`,
          filename: safeName,
          size: buffer.length,
          content_type: file.type || "image/jpeg",
        });
      } catch (err) {
        console.error(`[photos] Local write failed for ${safeName}:`, err);
        errors.push(`${file.name}: save failed`);
      }
    }
  }

  /* ---- Update vehicle record if DB available ---- */
  if (process.env.DATABASE_URL && uploaded.length > 0) {
    try {
      const { query } = await import("@/lib/db");
      // Fetch existing photos
      const existing = await query(
        `SELECT photos FROM vehicles WHERE dealer_id = $1 AND vin = $2 AND deleted_at IS NULL LIMIT 1`,
        [dealerId, upperVin],
      );

      if ((existing.rows as unknown[]).length > 0) {
        const row = existing.rows[0] as Record<string, unknown>;
        const currentPhotos = typeof row.photos === "string"
          ? JSON.parse(row.photos)
          : row.photos ?? [];

        const allPhotos = [
          ...(Array.isArray(currentPhotos) ? currentPhotos : []),
          ...uploaded.map((u) => ({ url: u.url, filename: u.filename })),
        ];

        await query(
          `UPDATE vehicles SET photos = $1, photo_count = $2, updated_at = NOW()
           WHERE dealer_id = $3 AND vin = $4`,
          [JSON.stringify(allPhotos), allPhotos.length, dealerId, upperVin],
        );
      }
    } catch (err) {
      console.error("[photos] DB update failed:", err);
      // Photos are uploaded — DB update failure is non-critical
    }
  }

  /* ---- Analytics ---- */
  for (const photo of uploaded) {
    try {
      trackSystem("system.vehicle_photo_uploaded", dealerId, {
        vin: upperVin,
        filename: photo.filename,
        size: photo.size,
        content_type: photo.content_type,
      });
    } catch {}
  }

  return NextResponse.json({
    vin: upperVin,
    uploaded,
    total_uploaded: uploaded.length,
    errors: errors.length > 0 ? errors : undefined,
  }, { status: 201 });
}
