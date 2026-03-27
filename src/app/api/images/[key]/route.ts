import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// ---------------------------------------------------------------------------
// We resolve the S3 client inline to avoid importing the full storage module
// (which would pull in the presigner and add cold-start weight for a hot
// image-serving path).
// ---------------------------------------------------------------------------

function getClient(): S3Client {
  const g = globalThis as unknown as { __s3Img?: S3Client };
  if (!g.__s3Img) {
    g.__s3Img = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return g.__s3Img;
}

function getBucket(): string {
  return process.env.R2_BUCKET_NAME ?? "wolfpack-auto-media";
}

// ---------------------------------------------------------------------------
// Content negotiation: pick the best format the client supports.
// ---------------------------------------------------------------------------

function negotiateFormat(
  accept: string | null,
  requestedKey: string,
): string {
  // If the key already targets a specific format, honour it.
  if (
    requestedKey.endsWith(".avif") ||
    requestedKey.endsWith(".webp") ||
    requestedKey.endsWith(".jpg") ||
    requestedKey.endsWith(".jpeg")
  ) {
    return requestedKey;
  }

  // Otherwise, pick the best format the client supports.
  if (accept?.includes("image/avif")) {
    return `${requestedKey}.avif`;
  }
  if (accept?.includes("image/webp")) {
    return `${requestedKey}.webp`;
  }
  return `${requestedKey}.jpg`;
}

// ---------------------------------------------------------------------------
// GET /api/images/:key
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    const { key } = await params;
    const rawKey = decodeURIComponent(key);
    const accept = req.headers.get("accept");
    const resolvedKey = negotiateFormat(accept, rawKey);

    const command = new GetObjectCommand({
      Bucket: getBucket(),
      Key: resolvedKey,
    });

    const response = await getClient().send(command);

    if (!response.Body) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Stream the body directly.
    const bodyBytes = await response.Body.transformToByteArray();

    const headers = new Headers();
    headers.set(
      "Content-Type",
      response.ContentType ?? "application/octet-stream",
    );
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    // ETag for conditional requests
    if (response.ETag) {
      headers.set("ETag", response.ETag);

      const ifNoneMatch = req.headers.get("if-none-match");
      if (ifNoneMatch === response.ETag) {
        return new NextResponse(null, { status: 304, headers });
      }
    }

    // Vary on Accept so CDN caches per-format
    headers.set("Vary", "Accept");

    if (response.ContentLength !== undefined) {
      headers.set("Content-Length", String(response.ContentLength));
    }

    return new NextResponse(Buffer.from(bodyBytes), { status: 200, headers });
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "name" in err
        ? (err as { name: string }).name
        : "";

    if (code === "NoSuchKey") {
      return new NextResponse("Not found", { status: 404 });
    }

    console.error("[api/images/key] Error:", err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
