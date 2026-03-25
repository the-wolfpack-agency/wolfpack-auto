import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
};

// ---------------------------------------------------------------------------
// Singleton S3-compatible client (Cloudflare R2)
// ---------------------------------------------------------------------------

/**
 * HMR-safe singleton — survives Next.js hot reloads without leaking clients.
 */
function getStorageClient(): S3Client {
  const globalForS3 = globalThis as unknown as { __s3Client?: S3Client };

  if (!globalForS3.__s3Client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    if (!accountId) {
      // Return a dummy client that throws on use — allows build to succeed
      // without env vars. At runtime, env vars must be set.
      return new S3Client({ region: "auto" });
    }

    globalForS3.__s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
    });
  }

  return globalForS3.__s3Client;
}

/** Lazy-initialized — safe at build time without env vars. */
export function getS3() { return getStorageClient(); }

function getBucket(): string {
  return process.env.R2_BUCKET_NAME ?? "wolfpack-auto-media";
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/**
 * Construct the canonical R2 key for a vehicle image.
 *
 * Path: `dealers/{dealerId}/vehicles/{vin}/{filename}`
 */
export function buildKey(
  dealerId: string,
  vin: string,
  filename: string,
): string {
  return `dealers/${dealerId}/vehicles/${vin}/${filename}`;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export interface UploadResult {
  key: string;
  publicUrl: string;
  size: number;
  contentType: string;
}

/**
 * Upload a buffer to R2 under the dealer-scoped path.
 *
 * Validates file size (max 10 MB) and detects content type from extension.
 * Throws on invalid input.
 */
export async function uploadImage(
  dealerId: string,
  vin: string,
  filename: string,
  buffer: Buffer,
): Promise<UploadResult> {
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(
      `[storage] File exceeds max size (${(buffer.length / 1024 / 1024).toFixed(1)} MB > 10 MB)`,
    );
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_MAP[ext];
  if (!contentType) {
    throw new Error(`[storage] Unsupported file extension: .${ext}`);
  }

  const key = buildKey(dealerId, vin, filename);

  await getS3().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return {
    key,
    publicUrl: getPublicUrl(key),
    size: buffer.length,
    contentType,
  };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Remove a single object from R2 by its full key.
 */
export async function deleteImage(key: string): Promise<void> {
  await getS3().send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }),
  );
}

// ---------------------------------------------------------------------------
// Signed & Public URLs
// ---------------------------------------------------------------------------

/**
 * Generate a presigned URL for direct private uploads (e.g. from the browser).
 *
 * @param key       Full R2 object key.
 * @param expiresIn Seconds until the URL expires. Default: 3 600 (1 hour).
 */
export async function getSignedUrl(
  key: string,
  expiresIn = 3_600,
): Promise<string> {
  return awsGetSignedUrl(
    getS3(),
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn },
  );
}

/**
 * Return the public CDN URL for an R2 object.
 *
 * Falls back to a placeholder if `R2_PUBLIC_URL` is unset (dev mode).
 */
export function getPublicUrl(key: string): string {
  const base =
    process.env.R2_PUBLIC_URL ?? "https://media.wolfpackauto.com";
  return `${base}/${key}`;
}
