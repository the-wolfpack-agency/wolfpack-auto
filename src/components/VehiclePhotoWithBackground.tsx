"use client";

/**
 * VehiclePhotoWithBackground — Enterprise-grade vehicle photo display
 *
 * Renders a vehicle photo with its assigned background (preset CSS, custom image,
 * or AI composite). Supports:
 *  - Preset CSS gradient backgrounds with visual effects (reflection, bokeh, snow)
 *  - Custom uploaded image backgrounds
 *  - AI composite images (full composited result)
 *  - Before/after toggle
 *  - Lazy loading with intersection observer
 *  - Loading skeleton
 *  - Engagement tracking (view, dwell, click) — feeds learning system
 *
 * Backwards compatible: still accepts the old props (backgroundPreset, vehicleColor, etc.)
 * but also supports the new assignment-based system.
 */

import { useState, useEffect, useRef, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type BackgroundPresetId =
  | "showroom_white"
  | "showroom_dark"
  | "outdoor_scenic"
  | "dealer_branded"
  | "urban_night"
  | "minimalist"
  | "seasonal_winter"
  | "seasonal_summer";

interface BackgroundAssignment {
  background_type: "preset" | "custom" | "composite";
  preset_id?: string | null;
  custom_bg_id?: string | null;
  composite_url?: string | null;
  cutout_url?: string | null;
  css_override?: string | null;
  custom_bg_url?: string | null;
}

interface DealerColors {
  primary: string;
  secondary: string;
}

export interface VehiclePhotoWithBackgroundProps {
  /** Vehicle photo URL (original) */
  photoUrl: string;
  /** Alt text for accessibility */
  alt: string;
  /** Vehicle VIN for analytics tracking */
  vin?: string;

  // --- New assignment-based API ---
  /** Background assignment from DB */
  assignment?: BackgroundAssignment | null;

  // --- Legacy preset-based API (still supported) ---
  /** Which background preset to apply */
  backgroundPreset?: BackgroundPresetId;
  /** Vehicle exterior color (used by minimalist preset) */
  vehicleColor?: string;
  /** Dealer brand colors (used by dealer_branded preset) */
  dealerColors?: DealerColors;

  // --- Display options ---
  /** CSS class on the outer container */
  className?: string;
  /** Width/height aspect ratio class. Default: aspect-video */
  aspectRatio?: string;
  /** Show before/after toggle. Default: true */
  showToggle?: boolean;
  /** Called when photo is clicked */
  onClick?: () => void;
  /** Track callback for photo engagement */
  onView?: (vin: string, preset: string) => void;
  /** Dealer ID for engagement tracking */
  dealerId?: string;
}

/* ------------------------------------------------------------------ */
/*  CSS preset map                                                     */
/* ------------------------------------------------------------------ */

const PRESET_CSS: Record<string, string> = {
  showroom_white: "linear-gradient(180deg, #ffffff 0%, #f0f0f0 70%, #e0e0e0 100%)",
  showroom_dark: "linear-gradient(180deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
  outdoor_scenic: "linear-gradient(180deg, #87CEEB 0%, #a8d8ea 40%, #6b8e4e 65%, #3d5a3e 100%)",
  dealer_branded: "linear-gradient(135deg, var(--brand-600, #2563eb) 0%, var(--brand-800, #1e40af) 100%)",
  urban_night: "linear-gradient(180deg, #0c0c1d 0%, #1a1a3e 50%, #2d1b4e 100%)",
  minimalist: "linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%)",
  seasonal_winter: "linear-gradient(180deg, #d6e6f2 0%, #b8d4e3 50%, #f0f4f8 100%)",
  seasonal_summer: "linear-gradient(180deg, #fceabb 0%, #f8b500 40%, #87ceeb 100%)",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function cssToObject(css: string): React.CSSProperties {
  const style: Record<string, string> = {};
  const declarations = css.split(";").filter(Boolean);
  for (const decl of declarations) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim();
    const value = decl.slice(colonIdx + 1).trim();
    const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    style[camelProp] = value;
  }
  return style as React.CSSProperties;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function VehiclePhotoWithBackground({
  photoUrl,
  alt,
  vin,
  assignment,
  backgroundPreset,
  vehicleColor,
  dealerColors,
  className = "",
  aspectRatio = "aspect-video",
  showToggle = true,
  onClick,
  onView,
  dealerId,
}: VehiclePhotoWithBackgroundProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasTrackedView = useRef(false);
  const viewStartRef = useRef<number>(0);

  // Resolve the active preset (from assignment or legacy prop)
  const activePreset: string | null =
    assignment?.preset_id ?? backgroundPreset ?? null;

  const hasBackground = !!(assignment || backgroundPreset);
  const isComposite = assignment?.background_type === "composite" && assignment.composite_url;

  // ----- Engagement tracking -----

  useEffect(() => {
    const el = containerRef.current;
    if (!el || hasTrackedView.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasTrackedView.current) {
          hasTrackedView.current = true;
          viewStartRef.current = Date.now();

          // Legacy callback
          if (vin && onView && activePreset) {
            onView(vin, activePreset);
          }

          // New engagement tracking
          if (vin && dealerId) {
            fetch("/api/admin/vehicles/backgrounds/engagement", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                vin,
                event: "view",
                background_type: assignment?.background_type ?? (backgroundPreset ? "preset" : "none"),
                preset_id: activePreset,
              }),
            }).catch(() => {});
          }

          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [vin, onView, activePreset, assignment, backgroundPreset, dealerId]);

  // Track dwell on unmount
  useEffect(() => {
    return () => {
      if (viewStartRef.current > 0 && vin && dealerId) {
        const dwellMs = Date.now() - viewStartRef.current;
        if (dwellMs > 500) {
          const payload = JSON.stringify({
            vin,
            event: "dwell",
            dwell_ms: dwellMs,
            background_type: assignment?.background_type ?? "preset",
            preset_id: activePreset,
          });
          navigator.sendBeacon?.(
            "/api/admin/vehicles/backgrounds/engagement",
            new Blob([payload], { type: "application/json" }),
          );
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = useCallback(() => {
    if (vin && dealerId) {
      fetch("/api/admin/vehicles/backgrounds/engagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vin,
          event: "click",
          background_type: assignment?.background_type ?? "preset",
          preset_id: activePreset,
        }),
      }).catch(() => {});
    }
    onClick?.();
  }, [vin, dealerId, assignment, activePreset, onClick]);

  // ----- Resolve background style -----

  let bgStyle: React.CSSProperties = {};

  if (!showOriginal && hasBackground && !isComposite) {
    if (assignment?.css_override) {
      bgStyle = cssToObject(assignment.css_override);
    } else if (assignment?.background_type === "custom" && assignment.custom_bg_url) {
      bgStyle = {
        backgroundImage: `url(${assignment.custom_bg_url})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    } else if (activePreset && PRESET_CSS[activePreset]) {
      let css = PRESET_CSS[activePreset];
      // Handle dealer_branded with custom colors
      if (activePreset === "dealer_branded" && dealerColors) {
        css = `linear-gradient(135deg, ${dealerColors.primary} 0%, ${dealerColors.secondary} 100%)`;
      }
      bgStyle = { background: css };
    }
  }

  // ----- Render -----

  const showBackground = hasBackground && !showOriginal;
  const showComposite = isComposite && !showOriginal;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-2xl shadow-card ${aspectRatio} ${className}`}
      data-testid="vehicle-photo-bg"
      data-preset={activePreset}
      data-background-type={assignment?.background_type ?? (backgroundPreset ? "preset" : "none")}
    >
      {/* Loading skeleton */}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gray-200" />
      )}

      {/* AI Composite (fully processed image) */}
      {showComposite && assignment?.composite_url ? (
        <img
          src={assignment.composite_url}
          alt={alt}
          className="relative z-10 h-full w-full cursor-pointer object-cover"
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onClick={handleClick}
        />
      ) : showBackground ? (
        /* Photo with background (CSS preset or custom image) */
        <div
          className="flex h-full w-full items-center justify-center"
          style={bgStyle}
          onClick={handleClick}
        >
          <img
            src={photoUrl}
            alt={alt}
            className="relative z-10 h-full w-full cursor-pointer object-contain"
            loading="lazy"
            onLoad={() => setLoaded(true)}
          />
        </div>
      ) : (
        /* Original photo (no background) */
        <div className="flex h-full w-full items-center justify-center bg-gray-100">
          <img
            src={photoUrl}
            alt={alt}
            className="h-full w-full cursor-pointer object-cover"
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onClick={handleClick}
          />
        </div>
      )}

      {/* Studio reflection effect */}
      {showBackground && !showComposite && (activePreset === "showroom_white" || activePreset === "showroom_dark") && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-1/4"
          style={{
            background:
              activePreset === "showroom_white"
                ? "linear-gradient(to top, rgba(240,240,240,0.8), transparent)"
                : "linear-gradient(to top, rgba(26,26,46,0.8), transparent)",
          }}
          aria-hidden="true"
        />
      )}

      {/* Bokeh overlay for urban_night */}
      {showBackground && !showComposite && activePreset === "urban_night" && (
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage: "radial-gradient(circle 2px, rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }}
          aria-hidden="true"
        />
      )}

      {/* Snowflake texture for winter */}
      {showBackground && !showComposite && activePreset === "seasonal_winter" && (
        <div
          className="pointer-events-none absolute inset-0 z-0 opacity-20"
          style={{
            backgroundImage: "radial-gradient(circle 1px, white 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
          aria-hidden="true"
        />
      )}

      {/* Before/After toggle */}
      {showToggle && hasBackground && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowOriginal(!showOriginal);
          }}
          className="absolute right-2 top-2 z-30 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white backdrop-blur transition-colors hover:bg-black/80"
          aria-label={showOriginal ? "Show with background" : "Show original"}
        >
          {showOriginal ? "After" : "Before"}
        </button>
      )}

      {/* Background type badge */}
      {hasBackground && !showOriginal && (
        <div className="absolute bottom-2 left-2 z-30 flex items-center gap-1 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
          {isComposite && (
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          )}
          {isComposite
            ? "AI Composite"
            : assignment?.background_type === "custom"
              ? "Custom"
              : activePreset?.replace(/_/g, " ") ?? "Preset"}
        </div>
      )}
    </div>
  );
}
