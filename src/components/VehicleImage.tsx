"use client";

import React, { useState } from "react";
import { generateSrcSet } from "@/lib/images";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VehicleImageProps {
  /** Base URL for the image (without format extension). */
  src: string;
  /** Vehicle year for alt text. */
  year: number;
  /** Vehicle make for alt text. */
  make: string;
  /** Vehicle model for alt text. */
  model: string;
  /** Optional trim to include in alt text. */
  trim?: string;
  /** Intrinsic width for aspect ratio container. Default: 4. */
  aspectWidth?: number;
  /** Intrinsic height for aspect ratio container. Default: 3. */
  aspectHeight?: number;
  /** Additional class names for the wrapper. */
  className?: string;
  /** Image sizing hint. Default: "(max-width: 640px) 100vw, 50vw". */
  sizes?: string;
  /** Priority image — disables lazy loading. */
  priority?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WIDTHS = [320, 640, 960, 1280];

// Tiny 1x1 transparent WebP used as a blur placeholder.
const PLACEHOLDER =
  "data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADQAQCdASoCAAIAAkA4JZQCdAEO/hepgAAA/v3dT//b6P/Of9t7sP+a/5b3Rv//+pQAAAAA";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Responsive vehicle image with AVIF / WebP / JPEG fallback.
 *
 * Uses a `<picture>` element for format negotiation, `srcset` for responsive
 * sizing, and an aspect-ratio container to prevent CLS.
 */
export default function VehicleImage({
  src,
  year,
  make,
  model,
  trim,
  aspectWidth = 4,
  aspectHeight = 3,
  className = "",
  sizes = "(max-width: 640px) 100vw, 50vw",
  priority = false,
}: VehicleImageProps) {
  const [loaded, setLoaded] = useState(false);

  const alt = trim
    ? `${year} ${make} ${model} ${trim}`
    : `${year} ${make} ${model}`;

  // Build srcset strings for each format.
  // Convention: .avif / .webp / .jpg variants live alongside each other.
  const avifSrcSet = generateSrcSet(`${src}.avif`, WIDTHS);
  const webpSrcSet = generateSrcSet(`${src}.webp`, WIDTHS);
  const jpegSrcSet = generateSrcSet(`${src}.jpg`, WIDTHS);

  return (
    <div
      className={`relative overflow-hidden bg-gray-100 ${className}`}
      style={{ aspectRatio: `${aspectWidth} / ${aspectHeight}` }}
    >
      {/* Blur placeholder — fades out once the real image loads */}
      {!loaded && (
        <img
          src={PLACEHOLDER}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover blur-lg scale-110"
        />
      )}

      <picture>
        <source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />
        <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />
        <img
          src={`${src}.jpg`}
          srcSet={jpegSrcSet}
          sizes={sizes}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding={priority ? "sync" : "async"}
          onLoad={() => setLoaded(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      </picture>
    </div>
  );
}
