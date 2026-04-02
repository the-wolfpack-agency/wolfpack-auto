/**
 * POST /api/admin/vehicles/backgrounds/upload — Upload a custom background image
 *
 * Accepts multipart form data with:
 *   file: image file (JPEG, PNG, WebP — max 10 MB)
 *   name: display name
 *   description: optional description
 *   category: studio | outdoor | branded | seasonal | lifestyle | custom
 *   tags: comma-separated tags
 *   position: CSS object-position (default: center)
 *   fit: CSS object-fit (default: cover)
 *   overlay_opacity: 0..1 darkening overlay (default: 0)
 *
 * Optimizes the image (WebP + thumbnail), uploads to R2, saves metadata to DB.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackBackground } from "@/lib/analytics-hooks";
import { optimizeImage, generateThumbnail } from "@/lib/images";
import { getPublicUrl } from "@/lib/storage";
import { validateCustomBackgroundInput } from "@/lib/background-generator";
import type { BackgroundCategory } from "@/lib/background-generator";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const dealerId = authResult.user.dealer_id;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const name = (formData.get("name") as string | null) ?? "";
    const description = (formData.get("description") as string | null) ?? "";
    const category = (formData.get("category") as string | null) ?? "custom";
    const tagsRaw = (formData.get("tags") as string | null) ?? "";
    const position = (formData.get("position") as string | null) ?? "center";
    const fit = (formData.get("fit") as string | null) ?? "cover";
    const overlayOpacity = parseFloat((formData.get("overlay_opacity") as string | null) ?? "0");

    // Validate file
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Allowed: jpeg, png, webp` },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: 10 MB` },
        { status: 400 },
      );
    }

    // Validate metadata
    const validation = validateCustomBackgroundInput({
      name,
      category,
      position,
      fit,
      overlay_opacity: overlayOpacity,
    });
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join("; ") }, { status: 400 });
    }

    const tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // Read buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Get dimensions
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    // Optimize + generate thumbnail
    const [optimized, thumbnail] = await Promise.all([
      optimizeImage(buffer, { formats: ["webp"], maxWidth: 2000 }),
      generateThumbnail(buffer, 480, 270),
    ]);

    const timestamp = Date.now();
    const bgId = crypto.randomUUID();

    // Upload to R2 (or shadow mode: skip upload, use placeholder URLs)
    let originalUrl = "";
    let optimizedUrl = "";
    let thumbnailUrl = "";
    let originalKey = "";
    let optimizedKey = "";
    let thumbnailKey = "";

    if (process.env.R2_ACCOUNT_ID) {
      const { uploadImage } = await import("@/lib/storage");

      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";

      const [origResult, optResult, thumbResult] = await Promise.all([
        uploadImage(dealerId, `backgrounds`, `${timestamp}_${bgId}_original.${ext}`, buffer),
        uploadImage(dealerId, `backgrounds`, `${timestamp}_${bgId}_optimized.webp`, optimized[0].buffer),
        uploadImage(dealerId, `backgrounds`, `${timestamp}_${bgId}_thumb.webp`, thumbnail.buffer),
      ]);

      originalKey = origResult.key;
      originalUrl = origResult.publicUrl;
      optimizedKey = optResult.key;
      optimizedUrl = optResult.publicUrl;
      thumbnailKey = thumbResult.key;
      thumbnailUrl = thumbResult.publicUrl;
    } else {
      // Shadow mode — use placeholder URLs
      originalKey = `dealers/${dealerId}/backgrounds/${timestamp}_original`;
      originalUrl = getPublicUrl(originalKey);
      optimizedKey = `dealers/${dealerId}/backgrounds/${timestamp}_optimized`;
      optimizedUrl = getPublicUrl(optimizedKey);
      thumbnailKey = `dealers/${dealerId}/backgrounds/${timestamp}_thumb`;
      thumbnailUrl = getPublicUrl(thumbnailKey);
    }

    // Save to DB
    let savedId = bgId;
    if (process.env.DATABASE_URL) {
      const { query } = await import("@/lib/db");
      const { rows } = await query(
        `INSERT INTO custom_backgrounds
           (dealer_id, name, description, category, tags,
            original_key, original_url, optimized_key, optimized_url,
            thumbnail_key, thumbnail_url,
            width, height, file_size, mime_type,
            position, fit, overlay_opacity)
         VALUES ($1, $2, $3, $4, $5,
                 $6, $7, $8, $9,
                 $10, $11,
                 $12, $13, $14, $15,
                 $16, $17, $18)
         RETURNING id`,
        [
          dealerId, name, description, category as BackgroundCategory, tags,
          originalKey, originalUrl, optimizedKey, optimizedUrl,
          thumbnailKey, thumbnailUrl,
          width, height, file.size, file.type,
          position, fit, overlayOpacity,
        ],
      );
      savedId = rows[0]?.id ?? bgId;
    }

    trackBackground("background.custom_uploaded", dealerId, {
      background_id: savedId,
      name,
      category,
      width,
      height,
      file_size: file.size,
    });

    return NextResponse.json({
      id: savedId,
      name,
      description,
      category,
      tags,
      original_url: originalUrl,
      optimized_url: optimizedUrl,
      thumbnail_url: thumbnailUrl,
      width,
      height,
      file_size: file.size,
      position,
      fit,
      overlay_opacity: overlayOpacity,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[api/backgrounds/upload] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
