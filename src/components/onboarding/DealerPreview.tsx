/**
 * DealerPreview — Instant visual preview of the dealer's website.
 *
 * Inspired by Canva's "show, don't ask" principle: as soon as the dealer
 * types their name and city, they see a live mockup of their website.
 * This creates an immediate emotional connection and drastically reduces
 * time-to-value (Shopify's single-question-to-result pattern).
 *
 * Renders a mini website preview with dealer name, city, branding colors,
 * and tagline. Updates in real-time as the user types.
 */

"use client";

import type { DealerTemplate } from "@/lib/onboarding-templates";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface DealerPreviewProps {
  /** Dealer name (required for preview to render) */
  dealerName: string;
  /** City (optional, shown in hero if provided) */
  city?: string;
  /** Primary brand color (hex) */
  primaryColor?: string;
  /** Accent color (hex) */
  accentColor?: string;
  /** Tagline shown in the hero section */
  tagline?: string;
  /** Selected template (drives layout hints) */
  template?: DealerTemplate | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DealerPreview({
  dealerName,
  city,
  primaryColor = "#0070c7",
  accentColor = "#f97316",
  tagline = "Find Your Perfect Vehicle",
  template,
}: DealerPreviewProps) {
  if (!dealerName.trim()) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-600 bg-gray-800/50 p-8"
        data-testid="dealer-preview-empty"
      >
        <p className="text-sm text-gray-500">
          Type your dealership name to see a live preview
        </p>
      </div>
    );
  }

  const displayTagline = tagline || template?.tagline || "Find Your Perfect Vehicle";
  const locationLine = city ? `${city}` : "";

  return (
    <div
      className="overflow-hidden rounded-xl border border-gray-600 bg-white shadow-lg"
      data-testid="dealer-preview"
    >
      {/* ---- Nav bar ---- */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: primaryColor }}
      >
        <span className="text-sm font-bold text-white">{dealerName}</span>
        <div className="flex gap-3 text-xs text-white/70">
          <span>Inventory</span>
          <span>Finance</span>
          <span>Contact</span>
        </div>
      </div>

      {/* ---- Hero section ---- */}
      <div
        className="relative px-6 py-10 text-center"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}22 0%, ${accentColor}15 100%)`,
        }}
      >
        <h2 className="text-xl font-bold text-gray-900">{displayTagline}</h2>
        {locationLine && (
          <p className="mt-1 text-sm text-gray-500">
            Serving {locationLine} and surrounding areas
          </p>
        )}

        {/* Search bar mockup */}
        <div className="mx-auto mt-5 flex max-w-md items-center rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm">
          <span className="flex-1 text-left text-sm text-gray-400">
            Search make, model, or keyword...
          </span>
          <span
            className="rounded-full px-4 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            Search
          </span>
        </div>
      </div>

      {/* ---- Feature pills ---- */}
      {template && (
        <div className="flex flex-wrap justify-center gap-2 border-t border-gray-100 px-4 py-3">
          {template.features.slice(0, 4).map((feat) => (
            <span
              key={feat}
              className="rounded-full border px-3 py-1 text-xs font-medium"
              style={{
                borderColor: `${accentColor}40`,
                color: primaryColor,
                backgroundColor: `${primaryColor}08`,
              }}
            >
              {feat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          ))}
        </div>
      )}

      {/* ---- Vehicle cards mockup ---- */}
      <div className="grid grid-cols-3 gap-3 px-4 pb-4 pt-2">
        {["Recent Arrival", "Price Drop", "Just Listed"].map((badge, i) => (
          <div
            key={badge}
            className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50"
          >
            <div className="h-16 bg-gray-200" />
            <div className="p-2">
              <div className="h-2 w-3/4 rounded bg-gray-300" />
              <div className="mt-1 h-2 w-1/2 rounded bg-gray-200" />
              <span
                className="mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                style={{
                  backgroundColor: i === 1 ? accentColor : primaryColor,
                }}
              >
                {badge}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ---- Footer ---- */}
      <div
        className="px-4 py-2 text-center text-xs text-white/80"
        style={{ backgroundColor: primaryColor }}
      >
        &copy; {new Date().getFullYear()} {dealerName}
        {locationLine ? ` | ${locationLine}` : ""}
      </div>
    </div>
  );
}
