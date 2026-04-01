"use client";

/**
 * VehiclePhotoWithBackground
 *
 * Renders a vehicle photo with a CSS-based background preset applied.
 * Used on VDP pages and inventory cards to give every vehicle a
 * polished, studio-quality presentation.
 *
 * Integrates with the photo engagement tracking system so background
 * performance data feeds into the analytics brain.
 */

import { useEffect, useRef, useCallback } from "react";
import { generateBackgroundCSS, type BackgroundPresetId, type DealerColors } from "@/lib/background-generator";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface VehiclePhotoWithBackgroundProps {
  /** URL of the vehicle photo */
  photoUrl: string;
  /** Alt text for accessibility */
  alt: string;
  /** Which background preset to apply */
  backgroundPreset: BackgroundPresetId;
  /** Vehicle exterior color (used by some presets like minimalist) */
  vehicleColor?: string;
  /** Dealer brand colors (used by dealer_branded preset) */
  dealerColors?: DealerColors;
  /** Vehicle VIN for analytics tracking */
  vin?: string;
  /** Optional CSS class on the outer container */
  className?: string;
  /** Width/height aspect ratio class. Default: aspect-video */
  aspectRatio?: string;
  /** Track callback for photo engagement (from EventCollector) */
  onView?: (vin: string, preset: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function VehiclePhotoWithBackground({
  photoUrl,
  alt,
  backgroundPreset,
  vehicleColor,
  dealerColors,
  vin,
  className = "",
  aspectRatio = "aspect-video",
  onView,
}: VehiclePhotoWithBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasTrackedView = useRef(false);

  const cssString = generateBackgroundCSS(backgroundPreset, vehicleColor, dealerColors);

  // Track view when component enters viewport
  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !hasTrackedView.current && vin && onView) {
          hasTrackedView.current = true;
          onView(vin, backgroundPreset);
        }
      }
    },
    [vin, backgroundPreset, onView],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(handleIntersection, {
      threshold: 0.5,
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, [handleIntersection]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-2xl shadow-card ${aspectRatio} ${className}`}
      style={cssToObject(cssString)}
      data-testid="vehicle-photo-bg"
      data-preset={backgroundPreset}
    >
      {/* Vehicle photo rendered on top of the background */}
      <img
        src={photoUrl}
        alt={alt}
        className="relative z-10 h-full w-full object-contain"
        loading="lazy"
      />

      {/* Subtle reflection effect for studio presets */}
      {(backgroundPreset === "showroom_white" || backgroundPreset === "showroom_dark") && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-1/4"
          style={{
            background:
              backgroundPreset === "showroom_white"
                ? "linear-gradient(to top, rgba(240,240,240,0.8), transparent)"
                : "linear-gradient(to top, rgba(26,26,46,0.8), transparent)",
          }}
          aria-hidden="true"
        />
      )}

      {/* Bokeh dots overlay for urban_night */}
      {backgroundPreset === "urban_night" && (
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage:
              "radial-gradient(circle 2px, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }}
          aria-hidden="true"
        />
      )}

      {/* Snowflake texture for winter */}
      {backgroundPreset === "seasonal_winter" && (
        <div
          className="pointer-events-none absolute inset-0 z-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle 1px, white 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Convert a CSS string like "background: ...; box-shadow: ...;" into
 * a React CSSProperties object.
 */
function cssToObject(css: string): React.CSSProperties {
  const style: Record<string, string> = {};
  const declarations = css.split(";").filter(Boolean);

  for (const decl of declarations) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;

    const prop = decl.slice(0, colonIdx).trim();
    const value = decl.slice(colonIdx + 1).trim();

    // Convert kebab-case to camelCase
    const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    style[camelProp] = value;
  }

  return style as React.CSSProperties;
}
