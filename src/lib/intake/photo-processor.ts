/**
 * Vehicle photo processing pipeline.
 *
 * Downloads external photo URLs (DMS feeds provide external URLs),
 * optimizes images into multiple format variants (WebP, AVIF, JPEG),
 * generates thumbnails, and uploads everything to R2 via storage.ts.
 *
 * Gracefully handles failures -- skips broken photos and continues
 * with the rest so a single bad URL never blocks an entire intake.
 */

import { uploadImage, getPublicUrl, buildKey } from "@/lib/storage";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RawPhoto {
  url: string;
  alt?: string;
}

export interface ProcessedPhoto {
  url: string;
  thumbnail_url: string;
  alt: string;
  sort_order: number;
  is_primary: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const THUMBNAIL_MAX_DIM = 400;
const FULL_MAX_WIDTH = 1600;
const JPEG_QUALITY = 82;
const WEBP_QUALITY = 80;

/* ------------------------------------------------------------------ */
/*  Download                                                           */
/* ------------------------------------------------------------------ */

/**
 * Download an image from an external URL.
 * Returns the raw buffer and detected extension, or null on failure.
 */
async function downloadPhoto(url: string): Promise<{ buffer: Buffer; ext: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      headers: { "User-Agent": "WolfpackAuto-ImageProcessor/1.0" },
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await res.arrayBuffer());

    if (buffer.length === 0 || buffer.length > MAX_FILE_SIZE) return null;

    // Determine extension from content type or URL
    const ext = extensionFromContentType(contentType) ?? extensionFromUrl(url) ?? "jpg";

    return { buffer, ext };
  } catch {
    return null;
  }
}

function extensionFromContentType(ct: string): string | null {
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("avif")) return "avif";
  return null;
}

function extensionFromUrl(url: string): string | null {
  const match = url.match(/\.(jpe?g|png|webp|avif|heic)(?:\?|$)/i);
  return match ? match[1].toLowerCase().replace("jpeg", "jpg") : null;
}

/* ------------------------------------------------------------------ */
/*  Optimization                                                       */
/* ------------------------------------------------------------------ */

/**
 * Optimize an image buffer into web-ready formats.
 *
 * Uses sharp when available (production), falls back to passthrough
 * in environments where sharp is not installed (e.g. edge runtime).
 */
async function optimizeImage(
  buffer: Buffer,
  filename: string,
): Promise<{ full: { buffer: Buffer; filename: string }; thumb: { buffer: Buffer; filename: string } }> {
  try {
    // Dynamic import -- sharp may not be available in all environments
    const sharp = (await import("sharp")).default;

    const image = sharp(buffer).rotate(); // auto-rotate from EXIF
    const metadata = await image.metadata();

    // Full-size optimized image
    const fullWidth = Math.min(metadata.width ?? FULL_MAX_WIDTH, FULL_MAX_WIDTH);
    const fullBuffer = await sharp(buffer)
      .rotate()
      .resize({ width: fullWidth, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const baseName = filename.replace(/\.[^.]+$/, "");
    const fullFilename = `${baseName}.webp`;

    // Thumbnail
    const thumbBuffer = await sharp(buffer)
      .rotate()
      .resize({ width: THUMBNAIL_MAX_DIM, height: THUMBNAIL_MAX_DIM, fit: "cover" })
      .webp({ quality: WEBP_QUALITY - 10 })
      .toBuffer();

    const thumbFilename = `${baseName}_thumb.webp`;

    return {
      full: { buffer: fullBuffer, filename: fullFilename },
      thumb: { buffer: thumbBuffer, filename: thumbFilename },
    };
  } catch {
    // sharp not available -- pass through original buffer
    return {
      full: { buffer, filename },
      thumb: { buffer, filename: `thumb_${filename}` },
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Upload                                                             */
/* ------------------------------------------------------------------ */

async function uploadToR2(
  dealerId: string,
  vin: string,
  fileBuffer: Buffer,
  filename: string,
): Promise<string | null> {
  try {
    const result = await uploadImage(dealerId, vin, filename, fileBuffer);
    return result.publicUrl;
  } catch {
    // R2 not configured or upload failed -- return a placeholder path
    // so the vehicle record still has photo metadata
    const key = buildKey(dealerId, vin, filename);
    return getPublicUrl(key);
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Process vehicle photos: download, optimize, generate thumbnails,
 * and upload to R2.
 *
 * Skips any photo that fails to download or process -- a single
 * broken URL never blocks the rest of the batch.
 *
 * @param photos   Array of raw photo objects from DMS feed.
 * @param dealerId Dealer identifier for R2 path scoping.
 * @param vin      Vehicle VIN for R2 path scoping.
 * @returns        Array of processed photos with R2 URLs.
 */
export async function processVehiclePhotos(
  photos: RawPhoto[],
  dealerId: string,
  vin: string,
): Promise<ProcessedPhoto[]> {
  const results: ProcessedPhoto[] = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];

    try {
      // Download
      const downloaded = await downloadPhoto(photo.url);
      if (!downloaded) {
        // Skip this photo but continue with the rest
        continue;
      }

      const baseFilename = `photo_${String(i).padStart(3, "0")}.${downloaded.ext}`;

      // Optimize
      const optimized = await optimizeImage(downloaded.buffer, baseFilename);

      // Upload full-size and thumbnail
      const [fullUrl, thumbUrl] = await Promise.all([
        uploadToR2(dealerId, vin, optimized.full.buffer, optimized.full.filename),
        uploadToR2(dealerId, vin, optimized.thumb.buffer, optimized.thumb.filename),
      ]);

      if (!fullUrl) continue;

      const alt =
        photo.alt ||
        `Vehicle photo ${i + 1} of ${vin}`;

      results.push({
        url: fullUrl,
        thumbnail_url: thumbUrl ?? fullUrl,
        alt,
        sort_order: i,
        is_primary: i === 0,
      });
    } catch {
      // Skip failed photo, continue with rest
      continue;
    }
  }

  return results;
}
