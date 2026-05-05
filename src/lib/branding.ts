/**
 * Dynamic branding system — generates CSS custom properties from a dealer's
 * branding config so every page automatically picks up the correct colors,
 * fonts, and logo.
 *
 * Usage in layout.tsx:
 *   <style dangerouslySetInnerHTML={{ __html: getBrandingCSS(dealer) }} />  // audit-safe: A5 reason="JSDoc usage example, not real code"
 */

import type { Dealer, DealerBranding } from "@/types/dealer";

// ---------------------------------------------------------------------------
// Defaults — used when a dealer hasn't configured a value
// ---------------------------------------------------------------------------

const DEFAULT_BRANDING: DealerBranding = {
  primary_color: "#0c8de9",
  secondary_color: "#1e293b",
  accent_color: "#f59e0b",
  logo_url: "/wolfpack-logo.svg",
  favicon_url: null,
  font_family: "Inter, system-ui, sans-serif",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a `<style>` block string containing CSS custom properties for the
 * dealer's branding. Inject this into the document `<head>`.
 *
 * Properties set:
 *   --brand-primary, --brand-secondary, --brand-accent, --brand-text
 *   --brand-logo-url
 *   --brand-font-heading, --brand-font-body
 */
export function getBrandingCSS(dealer: Dealer | null): string {
  const b = dealer?.branding ?? DEFAULT_BRANDING;

  const primary = sanitizeColor(b.primary_color) || DEFAULT_BRANDING.primary_color;
  const secondary = sanitizeColor(b.secondary_color) || DEFAULT_BRANDING.secondary_color;
  const accent = sanitizeColor(b.accent_color) || DEFAULT_BRANDING.accent_color;
  const logoUrl = sanitizeUrl(b.logo_url) || DEFAULT_BRANDING.logo_url;
  const fontFamily = sanitizeFont(b.font_family) || DEFAULT_BRANDING.font_family;

  // Derive text color from primary — light primaries get dark text, dark get white
  const textColor = isLightColor(primary) ? "#1e293b" : "#ffffff";

  return `:root {
  --brand-primary: ${primary};
  --brand-secondary: ${secondary};
  --brand-accent: ${accent};
  --brand-text: ${textColor};
  --brand-logo-url: url("${logoUrl}");
  --brand-font-heading: ${fontFamily};
  --brand-font-body: ${fontFamily};
}`;
}

/**
 * Get the complete branding config with defaults filled in.
 */
export function getResolvedBranding(dealer: Dealer | null): DealerBranding {
  if (!dealer?.branding) return { ...DEFAULT_BRANDING };

  return {
    primary_color: dealer.branding.primary_color || DEFAULT_BRANDING.primary_color,
    secondary_color: dealer.branding.secondary_color || DEFAULT_BRANDING.secondary_color,
    accent_color: dealer.branding.accent_color || DEFAULT_BRANDING.accent_color,
    logo_url: dealer.branding.logo_url || DEFAULT_BRANDING.logo_url,
    favicon_url: dealer.branding.favicon_url ?? DEFAULT_BRANDING.favicon_url,
    font_family: dealer.branding.font_family || DEFAULT_BRANDING.font_family,
  };
}

// ---------------------------------------------------------------------------
// Sanitization — prevent CSS injection via branding values
// ---------------------------------------------------------------------------

/** Only allow hex colors, rgb(), hsl(), and named CSS colors. */
function sanitizeColor(value: string): string {
  if (!value) return "";
  // Hex: #abc, #aabbcc, #aabbccdd
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return value;
  // rgb/hsl with numbers and commas only
  if (/^(rgb|hsl)a?\(\s*[\d.,\s%]+\)$/.test(value)) return value;
  // Named colors — alphanumeric only
  if (/^[a-zA-Z]{3,30}$/.test(value)) return value;
  return "";
}

/** Only allow URLs that start with / or https:// */
function sanitizeUrl(value: string): string {
  if (!value) return "";
  if (value.startsWith("/")) return value;
  if (value.startsWith("https://")) return value;
  return "";
}

/** Only allow font family strings with alphanumerics, spaces, commas, hyphens. */
function sanitizeFont(value: string): string {
  if (!value) return "";
  if (/^[a-zA-Z0-9\s,\-'"]+$/.test(value)) return value;
  return "";
}

/**
 * Rough luminance check — returns true if the color is "light".
 * Only works for hex colors; defaults to false (dark) for others.
 */
function isLightColor(color: string): boolean {
  const hex = color.replace("#", "");
  if (hex.length < 6) return false;

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  // Perceived luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}
