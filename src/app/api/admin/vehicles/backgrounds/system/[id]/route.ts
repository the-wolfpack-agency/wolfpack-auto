/**
 * GET /api/admin/vehicles/backgrounds/system/[id] — Serve a system background image
 *
 * Generates the background on demand if not cached in R2.
 * Returns the image directly (WebP) for use in <img> tags.
 *
 * Query params:
 *   w: width (default 1920, max 3840)
 *   h: height (default 1080, max 2160)
 *   format: webp | png | jpeg (default webp)
 *   thumb: "true" to get 480x270 thumbnail
 */
import { NextRequest, NextResponse } from "next/server";
import { generateSystemBackground, generateOptimizedVariants } from "@/lib/system-backgrounds";
import sharp from "sharp";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ id: "demo", name: "Demo Background", url: "", format: "webp" });
  }

  const { id } = await params;
  const { searchParams } = request.nextUrl;

  const wantThumb = searchParams.get("thumb") === "true";
  const format = (searchParams.get("format") ?? "webp") as "webp" | "png" | "jpeg";
  const width = Math.min(parseInt(searchParams.get("w") ?? "1920") || 1920, 3840);
  const height = Math.min(parseInt(searchParams.get("h") ?? "1080") || 1080, 2160);

  const bg = await generateSystemBackground(id, width, height);
  if (!bg) {
    return NextResponse.json({ error: `Unknown system background: ${id}` }, { status: 404 });
  }

  let outputBuffer: Buffer;
  let contentType: string;

  if (wantThumb) {
    const variants = await generateOptimizedVariants(bg.buffer);
    outputBuffer = variants.thumbnail;
    contentType = "image/webp";
  } else {
    switch (format) {
      case "png":
        outputBuffer = bg.buffer; // already PNG from generator
        contentType = "image/png";
        break;
      case "jpeg":
        outputBuffer = await sharp(bg.buffer).jpeg({ quality: 90 }).toBuffer();
        contentType = "image/jpeg";
        break;
      default:
        outputBuffer = await sharp(bg.buffer).webp({ quality: 90 }).toBuffer();
        contentType = "image/webp";
    }
  }

  return new NextResponse(new Uint8Array(outputBuffer), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": outputBuffer.length.toString(),
      ...CACHE_HEADERS,
    },
  });
}
