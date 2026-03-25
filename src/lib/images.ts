import sharp, { type FormatEnum } from "sharp";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_WIDTH = 2_000;

const QUALITY: Record<string, number> = {
  webp: 80,
  avif: 75,
  jpeg: 85,
};

export type OutputFormat = "webp" | "avif" | "jpeg";

export interface OptimizeOptions {
  /** Maximum width in pixels. Height scales proportionally. Default: 2000 */
  maxWidth?: number;
  /** Output formats to generate. Default: ["webp", "avif", "jpeg"] */
  formats?: OutputFormat[];
  /** Override default quality per format. */
  quality?: Partial<Record<OutputFormat, number>>;
}

export interface OptimizedResult {
  format: OutputFormat;
  buffer: Buffer;
  width: number;
  height: number;
  size: number;
}

// ---------------------------------------------------------------------------
// Core: optimizeImage
// ---------------------------------------------------------------------------

/**
 * Resize and convert a raw image buffer into one or more optimized formats.
 *
 * Always constrains to `maxWidth` (default 2 000 px), preserving aspect ratio.
 * Returns one `OptimizedResult` per requested format.
 */
export async function optimizeImage(
  buffer: Buffer,
  options: OptimizeOptions = {},
): Promise<OptimizedResult[]> {
  const maxWidth = options.maxWidth ?? MAX_WIDTH;
  const formats = options.formats ?? (["webp", "avif", "jpeg"] as const);
  const qualityOverrides = options.quality ?? {};

  const base = sharp(buffer).rotate(); // auto-rotate from EXIF

  const metadata = await base.metadata();
  const needsResize = (metadata.width ?? 0) > maxWidth;

  const results: OptimizedResult[] = [];

  for (const fmt of formats) {
    const q = qualityOverrides[fmt] ?? QUALITY[fmt] ?? 80;

    let pipeline = base.clone();

    if (needsResize) {
      pipeline = pipeline.resize({ width: maxWidth, withoutEnlargement: true });
    }

    pipeline = pipeline.toFormat(fmt as keyof FormatEnum, { quality: q });

    const outputBuffer = await pipeline.toBuffer({ resolveWithObject: true });

    results.push({
      format: fmt,
      buffer: outputBuffer.data,
      width: outputBuffer.info.width,
      height: outputBuffer.info.height,
      size: outputBuffer.info.size,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Core: generateThumbnail
// ---------------------------------------------------------------------------

/**
 * Create a single WebP thumbnail at exact dimensions (cover-crop).
 */
export async function generateThumbnail(
  buffer: Buffer,
  width = 320,
  height = 240,
): Promise<OptimizedResult> {
  const output = await sharp(buffer)
    .rotate()
    .resize({ width, height, fit: "cover" })
    .toFormat("webp", { quality: QUALITY.webp })
    .toBuffer({ resolveWithObject: true });

  return {
    format: "webp",
    buffer: output.data,
    width: output.info.width,
    height: output.info.height,
    size: output.info.size,
  };
}

// ---------------------------------------------------------------------------
// Utility: generateSrcSet
// ---------------------------------------------------------------------------

/**
 * Build an HTML-ready `srcset` attribute string for responsive images.
 *
 * ```
 * generateSrcSet("/img/abc", [320, 640, 960])
 * // "/img/abc?w=320 320w, /img/abc?w=640 640w, /img/abc?w=960 960w"
 * ```
 */
export function generateSrcSet(baseUrl: string, widths: number[]): string {
  return widths
    .map((w) => {
      const separator = baseUrl.includes("?") ? "&" : "?";
      return `${baseUrl}${separator}w=${w} ${w}w`;
    })
    .join(", ");
}
