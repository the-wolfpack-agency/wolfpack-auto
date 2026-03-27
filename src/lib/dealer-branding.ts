/**
 * Dealer branding configuration.
 *
 * This is the single file to edit when onboarding a new dealer.
 * Swap the values below, and the entire site — colors, logo, name,
 * fonts, contact info, hours — updates instantly.
 *
 * In production this will load from the database per-tenant.
 * For now it reads from environment variables with sensible defaults.
 */

export interface DealerBranding {
  /** Display name shown in header, footer, meta tags */
  name: string;
  /** Tagline / slogan */
  tagline: string;
  /** Legal entity name for footer */
  legalName: string;

  /** Logo URL (SVG or PNG recommended, height ~40px) */
  logoUrl: string | null;
  /** Favicon URL */
  faviconUrl: string | null;

  /** Primary brand color (hex) — used for buttons, links, header */
  primaryColor: string;
  /** Accent color (hex) — used for CTAs, highlights */
  accentColor: string;

  /** Google Fonts family name (or system font stack) */
  fontFamily: string;
  /** Display/heading font family */
  displayFont: string;

  /** Contact info */
  phone: string;
  email: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };

  /** Business hours */
  hours: {
    weekday: string;
    saturday: string;
    sunday: string;
  };

  /** Social media URLs (null = hidden) */
  social: {
    facebook: string | null;
    instagram: string | null;
    twitter: string | null;
    youtube: string | null;
    tiktok: string | null;
  };

  /** Google Maps embed URL or place ID */
  mapUrl: string | null;

  /** Website URL for canonical/OG tags */
  websiteUrl: string;
}

/**
 * Default branding — Wolfpack Motors placeholder.
 * Override via environment variables or database per-tenant.
 */
const DEFAULT_BRANDING: DealerBranding = {
  name: process.env.DEALER_NAME ?? "Wolfpack Motors",
  tagline: process.env.DEALER_TAGLINE ?? "Find Your Perfect Vehicle",
  legalName: process.env.DEALER_LEGAL_NAME ?? "Wolfpack Motors LLC",

  logoUrl: process.env.DEALER_LOGO_URL ?? null,
  faviconUrl: process.env.DEALER_FAVICON_URL ?? null,

  primaryColor: process.env.DEALER_PRIMARY_COLOR ?? "#0070c7",
  accentColor: process.env.DEALER_ACCENT_COLOR ?? "#f97316",

  fontFamily: process.env.DEALER_FONT ?? "Inter",
  displayFont: process.env.DEALER_DISPLAY_FONT ?? "Inter",

  phone: process.env.DEALER_PHONE ?? "(303) 555-0100",
  email: process.env.DEALER_EMAIL ?? "hello@wolfpackmotors.com",
  address: {
    street: process.env.DEALER_STREET ?? "4500 W Colfax Ave",
    city: process.env.DEALER_CITY ?? "Denver",
    state: process.env.DEALER_STATE ?? "CO",
    zip: process.env.DEALER_ZIP ?? "80204",
  },

  hours: {
    weekday: process.env.DEALER_HOURS_WEEKDAY ?? "9:00 AM - 7:00 PM",
    saturday: process.env.DEALER_HOURS_SAT ?? "9:00 AM - 6:00 PM",
    sunday: process.env.DEALER_HOURS_SUN ?? "Closed",
  },

  social: {
    facebook: process.env.DEALER_FACEBOOK ?? null,
    instagram: process.env.DEALER_INSTAGRAM ?? null,
    twitter: process.env.DEALER_TWITTER ?? null,
    youtube: process.env.DEALER_YOUTUBE ?? null,
    tiktok: process.env.DEALER_TIKTOK ?? null,
  },

  mapUrl: process.env.DEALER_MAP_URL ?? null,
  websiteUrl: process.env.DEALER_WEBSITE_URL ?? "https://wolfpackmotors.com",
};

/**
 * Get the current dealer's branding configuration.
 * In production, this will query the database for the active tenant.
 */
export function getDealerBranding(): DealerBranding {
  return DEFAULT_BRANDING;
}

/**
 * Generate CSS custom properties from branding config.
 * Inject this into <head> to override Tailwind's brand colors at runtime.
 */
export function brandingCssVars(branding: DealerBranding): string {
  const hex = branding.primaryColor;
  const accent = branding.accentColor;

  return `
    :root {
      --brand-primary: ${hex};
      --brand-accent: ${accent};
      --font-sans: '${branding.fontFamily}', system-ui, -apple-system, sans-serif;
      --font-display: '${branding.displayFont}', system-ui, -apple-system, sans-serif;
    }
  `.trim();
}
