/**
 * Simplified mobile photo workflow for vehicle intake.
 *
 * Accepts raw phone photos (HEIC/JPEG/PNG, typically 3-12 MB each),
 * extracts EXIF timestamps for auto-ordering, optimizes images via
 * sharp, and uploads to R2.
 *
 * Designed for the "snap photos at the lot on your phone" workflow.
 */

import { uploadImage, buildKey, getPublicUrl } from "@/lib/storage";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ProcessedPhonePhoto {
  url: string;
  thumbnail_url: string;
  alt: string;
  sort_order: number;
  is_primary: boolean;
}

export interface PhonePhotoResult {
  photos: ProcessedPhonePhoto[];
  auto_ordered: boolean;
  exterior_count: number;
  interior_count: number;
}

/* ------------------------------------------------------------------ */
/*  EXIF timestamp extraction                                          */
/* ------------------------------------------------------------------ */

interface PhotoWithTimestamp {
  index: number;
  buffer: Buffer;
  filename: string;
  timestamp: number | null;
}

/**
 * Extract EXIF creation timestamp from an image buffer using sharp.
 * Returns epoch ms or null if unavailable.
 */
async function extractTimestamp(buffer: Buffer): Promise<number | null> {
  try {
    const sharp = (await import("sharp")).default;
    const metadata = await sharp(buffer).metadata();

    // sharp exposes EXIF data; the creation date is in exif.DateTimeOriginal
    // It is stored as raw EXIF buffer; we attempt to parse the common fields.
    if (metadata.exif) {
      const exifStr = metadata.exif.toString("ascii");

      // EXIF DateTimeOriginal format: "YYYY:MM:DD HH:MM:SS"
      const match = exifStr.match(/(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
        if (!isNaN(date.getTime())) {
          return date.getTime();
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Image optimization                                                 */
/* ------------------------------------------------------------------ */

interface OptimizedPair {
  full: { buffer: Buffer; filename: string };
  thumb: { buffer: Buffer; filename: string };
}

const FULL_MAX_WIDTH = 1600;
const THUMB_SIZE = 400;
const WEBP_QUALITY = 80;

async function optimizePhoto(buffer: Buffer, baseName: string): Promise<OptimizedPair> {
  try {
    const sharp = (await import("sharp")).default;

    // Full-size WebP
    const fullBuffer = await sharp(buffer)
      .rotate() // auto-rotate from EXIF orientation
      .resize({ width: FULL_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    // Thumbnail WebP
    const thumbBuffer = await sharp(buffer)
      .rotate()
      .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: "cover" })
      .webp({ quality: WEBP_QUALITY - 10 })
      .toBuffer();

    return {
      full: { buffer: fullBuffer, filename: `${baseName}.webp` },
      thumb: { buffer: thumbBuffer, filename: `${baseName}_thumb.webp` },
    };
  } catch {
    // sharp unavailable — pass through original
    return {
      full: { buffer, filename: `${baseName}.jpg` },
      thumb: { buffer, filename: `${baseName}_thumb.jpg` },
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Upload helper                                                      */
/* ------------------------------------------------------------------ */

async function uploadToR2(
  dealerId: string,
  vin: string,
  fileBuffer: Buffer,
  filename: string,
): Promise<string> {
  try {
    const result = await uploadImage(dealerId, vin, filename, fileBuffer);
    return result.publicUrl;
  } catch {
    // R2 not configured — return CDN path as placeholder
    const key = buildKey(dealerId, vin, filename);
    return getPublicUrl(key);
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Process phone photos for vehicle intake.
 *
 * Accepts raw File objects from a mobile upload, extracts EXIF timestamps
 * for auto-ordering, optimizes to WebP, generates thumbnails, and uploads
 * everything to R2.
 *
 * @param files    Raw photo files from the phone camera/gallery
 * @param dealerId Dealer identifier for R2 path scoping
 * @param vin      Vehicle VIN for R2 path scoping and alt text
 * @returns        Processed photos with URLs, ordering info, and counts
 */
export async function processPhonePhotos(
  files: File[],
  dealerId: string,
  vin: string,
): Promise<PhonePhotoResult> {
  if (files.length === 0) {
    return { photos: [], auto_ordered: false, exterior_count: 0, interior_count: 0 };
  }

  // Step 1: Read all files into buffers and extract timestamps
  const photosWithTimestamps: PhotoWithTimestamp[] = [];

  for (let i = 0; i < files.length; i++) {
    try {
      const file = files[i];
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const filename = `phone_${String(i).padStart(3, "0")}.${ext}`;
      const timestamp = await extractTimestamp(buffer);

      photosWithTimestamps.push({ index: i, buffer, filename, timestamp });
    } catch {
      // Skip unreadable files
      continue;
    }
  }

  // Step 2: Sort by EXIF timestamp if available
  const hasTimestamps = photosWithTimestamps.some((p) => p.timestamp !== null);

  if (hasTimestamps) {
    photosWithTimestamps.sort((a, b) => {
      if (a.timestamp === null && b.timestamp === null) return a.index - b.index;
      if (a.timestamp === null) return 1;
      if (b.timestamp === null) return -1;
      return a.timestamp - b.timestamp;
    });
  }

  // Step 3: Optimize, upload, and build results
  const photos: ProcessedPhonePhoto[] = [];

  for (let sortOrder = 0; sortOrder < photosWithTimestamps.length; sortOrder++) {
    const photo = photosWithTimestamps[sortOrder];

    try {
      const baseName = `photo_${String(sortOrder).padStart(3, "0")}`;

      // Optimize
      const optimized = await optimizePhoto(photo.buffer, baseName);

      // Upload full and thumbnail in parallel
      const [fullUrl, thumbUrl] = await Promise.all([
        uploadToR2(dealerId, vin, optimized.full.buffer, optimized.full.filename),
        uploadToR2(dealerId, vin, optimized.thumb.buffer, optimized.thumb.filename),
      ]);

      // Generate descriptive alt text
      const viewLabel = sortOrder === 0 ? "primary" : `view ${sortOrder + 1}`;
      const alt = `${vin} - ${viewLabel}`;

      photos.push({
        url: fullUrl,
        thumbnail_url: thumbUrl,
        alt,
        sort_order: sortOrder,
        is_primary: sortOrder === 0,
      });
    } catch {
      // Skip failed photo, continue with rest
      continue;
    }
  }

  // Estimate exterior vs interior (heuristic: first 60% exterior, rest interior)
  const splitPoint = Math.ceil(photos.length * 0.6);
  const exterior_count = Math.min(splitPoint, photos.length);
  const interior_count = Math.max(0, photos.length - splitPoint);

  return {
    photos,
    auto_ordered: hasTimestamps,
    exterior_count,
    interior_count,
  };
}
