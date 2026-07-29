/**
 * Image Compositor: Sharp-Based Vehicle + Background Compositing
 *
 * Creates professional composite images by layering:
 *  1. Background (preset gradient or custom uploaded image)
 *  2. Vehicle cutout (transparent PNG from AI background removal)
 *  3. Effects (drop shadow, floor reflection, vignette, watermark)
 *
 * All processing happens server-side via Sharp. No GPU required.
 * Output is optimized for web (WebP/JPEG) with responsive variants.
 *
 * Usage:
 *   import { compositeVehicle } from "@/lib/image-compositor";
 *   const result = await compositeVehicle({
 *     cutout_buffer: vehiclePNG,
 *     background_buffer: bgImage,
 *     options: { add_shadow: true, add_reflection: true },
 *   });
 */

import sharp, { type OverlayOptions } from "sharp";
import type { CompositeOptions } from "./background-generator";
import { DEFAULT_COMPOSITE_OPTIONS } from "./background-generator";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CompositeInput {
  /** Transparent PNG buffer of the vehicle (from background removal) */
  cutout_buffer: Buffer;
  /** Background image buffer (custom upload) */
  background_buffer?: Buffer;
  /** OR: background CSS gradient to render as a solid image */
  background_css?: string;
  /** Dealer logo buffer for watermarking (optional) */
  logo_buffer?: Buffer;
  /** Compositing options */
  options?: Partial<CompositeOptions>;
}

export interface CompositeResult {
  /** Final composite image buffer */
  buffer: Buffer;
  /** Output format */
  format: "webp" | "png" | "jpeg";
  /** Dimensions */
  width: number;
  height: number;
  /** File size in bytes */
  size: number;
  /** Processing time in ms */
  processing_ms: number;
}

export interface ThumbnailResult {
  buffer: Buffer;
  width: number;
  height: number;
  size: number;
}

/* ------------------------------------------------------------------ */
/*  Color helpers                                                      */
/* ------------------------------------------------------------------ */

/** Parse a hex color to RGBA components */
function hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return { r, g, b, alpha: 1 };
}

/**
 * Parse a simple CSS linear-gradient into a top-color and bottom-color.
 * Handles formats like:
 *   "linear-gradient(180deg, #fff 0%, #eee 100%)"
 *   "linear-gradient(135deg, #2563eb 0%, #1e40af 100%)"
 */
function parseGradient(css: string): { top: string; bottom: string } {
  const colorMatches = css.match(/#[0-9a-fA-F]{3,8}/g);
  if (!colorMatches || colorMatches.length < 2) {
    return { top: "#ffffff", bottom: "#e0e0e0" };
  }
  return { top: colorMatches[0], bottom: colorMatches[colorMatches.length - 1] };
}

/* ------------------------------------------------------------------ */
/*  Background generation                                              */
/* ------------------------------------------------------------------ */

/**
 * Create a gradient background image from CSS gradient string.
 * Uses Sharp to generate a vertical gradient between two colors.
 */
async function generateGradientBackground(
  css: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const { top, bottom } = parseGradient(css);
  const topRgba = hexToRgba(top);
  const bottomRgba = hexToRgba(bottom);

  // Create SVG gradient
  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:rgb(${topRgba.r},${topRgba.g},${topRgba.b});stop-opacity:1" />
          <stop offset="100%" style="stop-color:rgb(${bottomRgba.r},${bottomRgba.g},${bottomRgba.b});stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
    </svg>
  `);

  return sharp(svg).png().toBuffer();
}

/* ------------------------------------------------------------------ */
/*  Shadow generation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Create an elliptical shadow beneath the vehicle.
 * Returns a transparent PNG with a dark ellipse at the bottom.
 */
async function generateShadow(
  vehicleWidth: number,
  vehicleHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  opacity: number,
): Promise<Buffer> {
  const shadowWidth = Math.round(vehicleWidth * 0.9);
  const shadowHeight = Math.round(vehicleHeight * 0.08);
  const cx = Math.round(canvasWidth / 2);
  const cy = Math.round(canvasHeight * 0.82);
  const alphaInt = Math.round(opacity * 255);

  const svg = Buffer.from(`
    <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="${Math.round(shadowWidth * 0.08)}" />
        </filter>
      </defs>
      <ellipse cx="${cx}" cy="${cy}" rx="${Math.round(shadowWidth / 2)}" ry="${shadowHeight}"
        fill="rgba(0,0,0,${alphaInt / 255})" filter="url(#blur)" />
    </svg>
  `);

  return sharp(svg).png().toBuffer();
}

/* ------------------------------------------------------------------ */
/*  Reflection generation                                              */
/* ------------------------------------------------------------------ */

/**
 * Create a floor reflection of the vehicle cutout.
 * Flips the image vertically, crops the top 30%, and applies fade.
 */
async function generateReflection(
  cutout: Buffer,
  canvasWidth: number,
  canvasHeight: number,
  vehicleWidth: number,
  vehicleHeight: number,
  opacity: number,
): Promise<Buffer> {
  const reflectionHeight = Math.round(vehicleHeight * 0.3);

  // Flip the vehicle vertically
  const flipped = await sharp(cutout)
    .resize(vehicleWidth, vehicleHeight, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .flip()
    .extract({
      left: 0,
      top: 0,
      width: vehicleWidth,
      height: reflectionHeight,
    })
    .ensureAlpha()
    .modulate({ brightness: 0.6 })
    .toBuffer();

  // Create a gradient mask for fade-out effect
  const fadeSvg = Buffer.from(`
    <svg width="${vehicleWidth}" height="${reflectionHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style="stop-color:white;stop-opacity:${opacity}" />
          <stop offset="100%" style="stop-color:white;stop-opacity:0" />
        </linearGradient>
      </defs>
      <rect width="${vehicleWidth}" height="${reflectionHeight}" fill="url(#fade)" />
    </svg>
  `);

  const mask = await sharp(fadeSvg).greyscale().toBuffer();

  // Apply the fade mask as alpha
  const faded = await sharp(flipped)
    .composite([{
      input: mask,
      blend: "dest-in",
    }])
    .toBuffer();

  // Position on canvas
  const xOffset = Math.round((canvasWidth - vehicleWidth) / 2);
  const yOffset = Math.round(canvasHeight * 0.78);

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: faded,
      left: xOffset,
      top: yOffset,
    }])
    .png()
    .toBuffer();
}

/* ------------------------------------------------------------------ */
/*  Watermark                                                          */
/* ------------------------------------------------------------------ */

/**
 * Add a small dealer logo watermark in the bottom-right corner.
 */
async function generateWatermark(
  logo: Buffer,
  canvasWidth: number,
  canvasHeight: number,
): Promise<Buffer> {
  const maxLogoWidth = Math.round(canvasWidth * 0.1);
  const maxLogoHeight = Math.round(canvasHeight * 0.06);

  const resizedLogo = await sharp(logo)
    .resize(maxLogoWidth, maxLogoHeight, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .ensureAlpha()
    .modulate({ brightness: 1 })
    .toBuffer();

  const logoMeta = await sharp(resizedLogo).metadata();
  const logoW = logoMeta.width ?? maxLogoWidth;
  const logoH = logoMeta.height ?? maxLogoHeight;

  const xOffset = canvasWidth - logoW - Math.round(canvasWidth * 0.02);
  const yOffset = canvasHeight - logoH - Math.round(canvasHeight * 0.02);

  return sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: resizedLogo,
      left: xOffset,
      top: yOffset,
    }])
    .png()
    .toBuffer();
}

/* ------------------------------------------------------------------ */
/*  Main compositing pipeline                                          */
/* ------------------------------------------------------------------ */

/**
 * Create a professional composite image of a vehicle on a background.
 *
 * Pipeline:
 *  1. Prepare background (custom image or gradient)
 *  2. Scale + position the vehicle cutout
 *  3. Layer shadow beneath vehicle
 *  4. Layer reflection below vehicle
 *  5. Composite vehicle on top
 *  6. Add dealer logo watermark (if provided)
 *  7. Optimize output (WebP/JPEG at configured quality)
 */
export async function compositeVehicle(
  input: CompositeInput,
): Promise<CompositeResult> {
  const startMs = Date.now();
  const opts = { ...DEFAULT_COMPOSITE_OPTIONS, ...input.options };

  const { output_width, output_height } = opts;

  // 1. Prepare background
  let backgroundBuffer: Buffer;

  if (input.background_buffer) {
    // Custom uploaded background, resize to canvas dimensions
    backgroundBuffer = await sharp(input.background_buffer)
      .resize(output_width, output_height, { fit: "cover" })
      .png()
      .toBuffer();
  } else if (input.background_css) {
    // CSS gradient, render as image
    backgroundBuffer = await generateGradientBackground(
      input.background_css,
      output_width,
      output_height,
    );
  } else {
    // Fallback: white gradient
    backgroundBuffer = await generateGradientBackground(
      "linear-gradient(180deg, #ffffff 0%, #f0f0f0 70%, #e0e0e0 100%)",
      output_width,
      output_height,
    );
  }

  // 2. Scale + position vehicle cutout
  const cutoutMeta = await sharp(input.cutout_buffer).metadata();
  const origW = cutoutMeta.width ?? output_width;
  const origH = cutoutMeta.height ?? output_height;

  const vehicleMaxW = Math.round(output_width * opts.vehicle_scale);
  const vehicleMaxH = Math.round(output_height * opts.vehicle_scale);

  const scaledCutout = await sharp(input.cutout_buffer)
    .resize(vehicleMaxW, vehicleMaxH, {
      fit: "inside",
      withoutEnlargement: origW < vehicleMaxW && origH < vehicleMaxH ? true : false,
    })
    .ensureAlpha()
    .toBuffer();

  const scaledMeta = await sharp(scaledCutout).metadata();
  const vehicleW = scaledMeta.width ?? vehicleMaxW;
  const vehicleH = scaledMeta.height ?? vehicleMaxH;

  // Calculate position
  let xOffset: number;
  switch (opts.vehicle_position) {
    case "left":
      xOffset = Math.round(output_width * 0.1);
      break;
    case "right":
      xOffset = Math.round(output_width * 0.9 - vehicleW);
      break;
    default: // center
      xOffset = Math.round((output_width - vehicleW) / 2);
  }
  const yOffset = Math.round((output_height - vehicleH) * 0.55);

  // 3. Build composite layers
  const layers: OverlayOptions[] = [];

  // Shadow layer (below vehicle)
  if (opts.add_shadow) {
    const shadowBuf = await generateShadow(
      vehicleW,
      vehicleH,
      output_width,
      output_height,
      opts.shadow_opacity,
    );
    layers.push({ input: shadowBuf, left: 0, top: 0 });
  }

  // Reflection layer (below vehicle)
  if (opts.add_reflection) {
    try {
      const reflectionBuf = await generateReflection(
        scaledCutout,
        output_width,
        output_height,
        vehicleW,
        vehicleH,
        opts.reflection_opacity,
      );
      layers.push({ input: reflectionBuf, left: 0, top: 0 });
    } catch {
      // Reflection generation can fail on very small images, skip gracefully
    }
  }

  // Vehicle layer
  layers.push({
    input: scaledCutout,
    left: xOffset,
    top: yOffset,
  });

  // Watermark layer (on top of everything)
  if (input.logo_buffer) {
    try {
      const watermarkBuf = await generateWatermark(
        input.logo_buffer,
        output_width,
        output_height,
      );
      layers.push({ input: watermarkBuf, left: 0, top: 0 });
    } catch {
      // Watermark failure is non-critical, skip
    }
  }

  // 4. Composite all layers onto background
  let pipeline = sharp(backgroundBuffer)
    .resize(output_width, output_height, { fit: "cover" })
    .composite(layers);

  // 5. Output in requested format
  let outputBuffer: Buffer;
  let outputFormat = opts.output_format;

  switch (outputFormat) {
    case "png":
      outputBuffer = await pipeline.png({ quality: opts.output_quality }).toBuffer();
      break;
    case "jpeg":
      outputBuffer = await pipeline.jpeg({ quality: opts.output_quality }).toBuffer();
      break;
    default:
      outputFormat = "webp";
      outputBuffer = await pipeline.webp({ quality: opts.output_quality }).toBuffer();
  }

  const finalMeta = await sharp(outputBuffer).metadata();
  const processingMs = Date.now() - startMs;

  return {
    buffer: outputBuffer,
    format: outputFormat,
    width: finalMeta.width ?? output_width,
    height: finalMeta.height ?? output_height,
    size: outputBuffer.length,
    processing_ms: processingMs,
  };
}

/**
 * Generate a thumbnail of a composite image.
 */
export async function generateCompositeThumbnail(
  compositeBuffer: Buffer,
  width = 480,
  height = 270,
): Promise<ThumbnailResult> {
  const output = await sharp(compositeBuffer)
    .resize(width, height, { fit: "cover" })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: output.data,
    width: output.info.width,
    height: output.info.height,
    size: output.info.size,
  };
}

/**
 * Quick preview composite at reduced resolution (for real-time preview in UI).
 */
export async function generateQuickPreview(
  input: CompositeInput,
): Promise<CompositeResult> {
  return compositeVehicle({
    ...input,
    options: {
      ...input.options,
      output_width: 640,
      output_height: 360,
      output_quality: 70,
      output_format: "webp",
      add_reflection: false,
    },
  });
}
