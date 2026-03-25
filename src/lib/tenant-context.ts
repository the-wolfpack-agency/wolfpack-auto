/**
 * React Server Component context for the current dealer/tenant.
 *
 * Uses Next.js `headers()` to read the tenant metadata set by middleware
 * on every request. Each request is isolated — no shared mutable state.
 */

import { headers } from "next/headers";
import type { Dealer, DealerBranding } from "@/types/dealer";

// ---------------------------------------------------------------------------
// Header keys — set by middleware, read here
// ---------------------------------------------------------------------------

export const HEADER_DEALER_ID = "x-dealer-id";
export const HEADER_DEALER_SLUG = "x-dealer-slug";
export const HEADER_DEALER_NAME = "x-dealer-name";
export const HEADER_DEALER_BRANDING = "x-dealer-branding";
export const HEADER_DEALER_JSON = "x-dealer-json";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the full Dealer object for the current request.
 *
 * This reads from request headers set by middleware — it does NOT hit the
 * database. If no tenant was resolved (e.g., marketing site), returns null.
 */
export async function getCurrentDealer(): Promise<Dealer | null> {
  const headerStore = await headers();
  const raw = headerStore.get(HEADER_DEALER_JSON);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Dealer;
  } catch {
    return null;
  }
}

/**
 * Returns just the dealer ID for the current request.
 *
 * Prefer this over `getCurrentDealer()` when you only need the ID for
 * database queries — it avoids parsing the full JSON payload.
 */
export async function getCurrentDealerId(): Promise<string | null> {
  const headerStore = await headers();
  return headerStore.get(HEADER_DEALER_ID) ?? null;
}

/**
 * Returns the dealer slug for the current request.
 */
export async function getCurrentDealerSlug(): Promise<string | null> {
  const headerStore = await headers();
  return headerStore.get(HEADER_DEALER_SLUG) ?? null;
}

/**
 * Returns the dealer branding config for the current request.
 */
export async function getCurrentBranding(): Promise<DealerBranding | null> {
  const headerStore = await headers();
  const raw = headerStore.get(HEADER_DEALER_BRANDING);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as DealerBranding;
  } catch {
    return null;
  }
}
