import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { optimizeImage, generateThumbnail, type OutputFormat } from "@/lib/images";
import { uploadImage } from "@/lib/storage";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const RATE_LIMIT = 100; // uploads per hour per dealer
const RATE_WINDOW = 3_600; // seconds

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

const FORMAT_EXT: Record<OutputFormat, string> = {
  webp: "webp",
  avif: "avif",
  jpeg: "jpg",
};

// ---------------------------------------------------------------------------
// POST /api/images/upload
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    // ------------------------------------------------------------------
    // Authenticate — only logged-in dealers may upload
    // ------------------------------------------------------------------
    const authResult = await requireAuth();
    if (!isAuthenticated(authResult)) return authResult;
    const dealerId = authResult.user.dealer_id;

    // ------------------------------------------------------------------
    // Parse multipart body
    // ------------------------------------------------------------------
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const vin = formData.get("vin") as string | null;

    if (!file || !vin) {
      return NextResponse.json(
        { error: "Missing required fields: file, vin" },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // Validate file type
    // ------------------------------------------------------------------
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type}. Allowed: jpeg, png, webp, heic`,
        },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // Validate file size
    // ------------------------------------------------------------------
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: 10 MB`,
        },
        { status: 400 },
      );
    }

    // ------------------------------------------------------------------
    // Rate limit (sliding window via Redis)
    // ------------------------------------------------------------------
    const rateKey = `rate:img:${dealerId}`;
    const currentCount = await redis.incr(rateKey);

    if (currentCount === 1) {
      await redis.expire(rateKey, RATE_WINDOW);
    }

    if (currentCount > RATE_LIMIT) {
      return NextResponse.json(
        { error: "Rate limit exceeded (100 uploads/hour)" },
        { status: 429 },
      );
    }

    // ------------------------------------------------------------------
    // Read buffer
    // ------------------------------------------------------------------
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ------------------------------------------------------------------
    // Generate optimized variants + thumbnail
    // ------------------------------------------------------------------
    const timestamp = Date.now();
    const baseName = `${timestamp}`;

    const [variants, thumbnail] = await Promise.all([
      optimizeImage(buffer, { formats: ["webp", "avif", "jpeg"] }),
      generateThumbnail(buffer, 320, 240),
    ]);

    // ------------------------------------------------------------------
    // Upload all variants to R2
    // ------------------------------------------------------------------
    const uploads = await Promise.all([
      ...variants.map((v) =>
        uploadImage(
          dealerId,
          vin,
          `${baseName}.${FORMAT_EXT[v.format]}`,
          v.buffer,
        ),
      ),
      uploadImage(dealerId, vin, `${baseName}_thumb.webp`, thumbnail.buffer),
    ]);

    // Build response map keyed by variant name
    const urls: Record<string, string> = {};
    for (let i = 0; i < variants.length; i++) {
      urls[variants[i].format] = uploads[i].publicUrl;
    }
    urls.thumbnail = uploads[uploads.length - 1].publicUrl;

    return NextResponse.json({
      success: true,
      vin,
      dealer_id: dealerId,
      variants: urls,
      sizes: {
        original: file.size,
        webp: variants.find((v) => v.format === "webp")?.size ?? 0,
        avif: variants.find((v) => v.format === "avif")?.size ?? 0,
        jpeg: variants.find((v) => v.format === "jpeg")?.size ?? 0,
        thumbnail: thumbnail.size,
      },
    });
  } catch (err) {
    /* Surface a short cause hint so the operator can see why the
       upload failed without server-log access. Same pattern as
       /api/admin/vehicles/backgrounds/upload. */
    console.error("[api/images/upload] Error:", err);
    const message = (err as Error)?.message ?? "unknown";
    let hint: string | undefined;
    if (/Cannot find module .*sharp/i.test(message)) {
      hint = "sharp not installed in this deployment — add `sharp` to dependencies and redeploy";
    } else if (/R2|s3|aws/i.test(message) && /credential|access|denied|signature/i.test(message)) {
      hint = "R2 / S3 credentials missing or invalid — check R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY (or AWS_*)";
    } else if (/redis|ECONNREFUSED.*6379/i.test(message)) {
      hint = "Redis unavailable — REDIS_URL missing or unreachable; rate limiter cannot run";
    } else if (/heic|HEIF/i.test(message)) {
      hint = "HEIC decode failed — sharp build on Vercel may not include libheif; convert to JPEG client-side";
    }
    return NextResponse.json(
      {
        error: "Internal server error",
        cause: message.slice(0, 200),
        ...(hint ? { hint } : {}),
      },
      { status: 500 },
    );
  }
}
