/**
 * Dealer onboarding utilities.
 *
 * Helpers for slug generation, default branding, and setup validation
 * used by the onboarding wizard and API route.
 */

import type { DealerBranding } from "./dealer-branding";

/* -------------------------------------------------------------------------- */
/* Slug generation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Generate a URL-safe slug from a dealer name.
 *
 * "Wolfpack Motors LLC" -> "wolfpack-motors-llc"
 */
export function generateDealerSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/* -------------------------------------------------------------------------- */
/* Default branding                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Create a default branding configuration for a new dealer.
 * Returns sensible defaults that can be customized during onboarding.
 */
export function createDefaultBranding(
  dealerName: string,
): Pick<
  DealerBranding,
  "primaryColor" | "accentColor" | "fontFamily" | "displayFont" | "tagline" | "logoUrl" | "faviconUrl"
> {
  return {
    primaryColor: "#0070c7",
    accentColor: "#f97316",
    fontFamily: "Inter",
    displayFont: "Inter",
    tagline: `Welcome to ${dealerName}`,
    logoUrl: null,
    faviconUrl: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Setup validation                                                           */
/* -------------------------------------------------------------------------- */

export interface SetupValidationResult {
  complete: boolean;
  missing: string[];
}

interface DealerRecord {
  name?: string;
  phone?: string;
  email?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  branding_config?: Record<string, unknown> | null;
  inventory_count?: number;
  team_count?: number;
}

/**
 * Check whether all required onboarding steps are complete for a dealer.
 *
 * Returns `{ complete: true, missing: [] }` when everything is set up,
 * or lists the missing steps otherwise.
 */
export function validateDealerSetup(dealer: DealerRecord): SetupValidationResult {
  const missing: string[] = [];

  // Step 1: Dealership info
  if (!dealer.name?.trim()) missing.push("dealership_name");
  if (!dealer.phone?.trim()) missing.push("phone_number");
  if (!dealer.email?.trim()) missing.push("email_address");
  if (!dealer.address_street?.trim()) missing.push("street_address");
  if (!dealer.address_city?.trim()) missing.push("city");
  if (!dealer.address_state?.trim()) missing.push("state");
  if (!dealer.address_zip?.trim()) missing.push("zip_code");

  // Step 2: Branding
  if (!dealer.branding_config) missing.push("branding_configuration");

  // Step 3: Inventory
  if (typeof dealer.inventory_count === "number" && dealer.inventory_count < 1) {
    missing.push("inventory");
  } else if (dealer.inventory_count === undefined) {
    missing.push("inventory");
  }

  // Step 4: Team
  if (typeof dealer.team_count === "number" && dealer.team_count < 1) {
    missing.push("team_members");
  } else if (dealer.team_count === undefined) {
    missing.push("team_members");
  }

  return {
    complete: missing.length === 0,
    missing,
  };
}

/* -------------------------------------------------------------------------- */
/* Types shared between wizard and API                                        */
/* -------------------------------------------------------------------------- */

export interface OnboardingPayload {
  /** Step 1 */
  dealership: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    email: string;
    website: string;
  };

  /** Step 2 */
  branding: {
    logoFile: string | null; // base64 data URI or null
    primaryColor: string;
    tagline: string;
  };

  /** Step 3 */
  inventory: {
    method: "csv" | "dms" | "manual";
    dmsProvider?: "cdk" | "reynolds" | "dealertrack" | "tekion";
    csvData?: string; // base64-encoded CSV
  };

  /** Step 4 */
  team: Array<{
    email: string;
    role: "admin" | "manager" | "staff";
  }>;
}
