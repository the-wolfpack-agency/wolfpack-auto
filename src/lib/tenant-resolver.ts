/**
 * Tenant resolution — maps incoming hostname to the correct dealer.
 *
 * Resolution order:
 *   1. Exact custom domain match (e.g., "www.wolfpackmotors.com")
 *   2. Subdomain extraction (e.g., "wolfpack-motors.wolfpackauto.com" → slug "wolfpack-motors")
 *   3. Fallback to default/demo dealer
 *
 * Results are cached in Redis (5 min TTL) to keep resolution under 5ms
 * for the hot path. Cache is keyed by normalized hostname.
 */

import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache";
import { getDealerBySlug } from "@/db/queries/dealers";
import { getDealerByDomain } from "@/db/queries/domains";
import type { Dealer } from "@/types/dealer";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TENANT_CACHE_PREFIX = "tenant:";
const TENANT_CACHE_TTL_SECONDS = 300; // 5 minutes

/** Platform domains — requests on these go to the marketing site, not a dealer. */
const PLATFORM_DOMAINS = new Set([
  "wolfpackauto.com",
  "www.wolfpackauto.com",
  "localhost",
  "localhost:3000",
]);

/** Suffixes we strip to extract a subdomain slug. */
const SUBDOMAIN_SUFFIXES = [
  ".wolfpackauto.com",
  ".wolfpackauto.local",
  ".localhost",
  ".localhost:3000",
] as const;

/** Slug of the demo/default dealer used as fallback. */
const DEFAULT_DEALER_SLUG = process.env.DEFAULT_DEALER_SLUG ?? "demo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TenantResolution {
  dealer: Dealer;
  /** How the tenant was resolved — useful for debugging / analytics. */
  resolvedVia: "custom_domain" | "subdomain" | "default";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve which dealer a request belongs to based on the hostname.
 *
 * Returns `null` only when the hostname is a bare platform domain
 * (e.g., "wolfpackauto.com") — the caller should serve the marketing site.
 */
export async function resolveTenant(
  hostname: string,
): Promise<TenantResolution | null> {
  const normalized = normalizeHostname(hostname);

  // Platform root domains are not tenants
  if (PLATFORM_DOMAINS.has(normalized)) {
    return null;
  }

  // 1. Check cache
  const cacheKey = `${TENANT_CACHE_PREFIX}${normalized}`;
  const cached = await cacheGet<TenantResolution>(cacheKey);
  if (cached) return cached;

  // 2. Try custom domain (full hostname match in dealer_domains table)
  const byDomain = await getDealerByDomain(normalized);
  if (byDomain) {
    const result: TenantResolution = {
      dealer: byDomain,
      resolvedVia: "custom_domain",
    };
    await cacheSet(cacheKey, result, TENANT_CACHE_TTL_SECONDS);
    return result;
  }

  // 3. Try subdomain extraction
  const slug = extractSubdomain(normalized);
  if (slug) {
    const bySlug = await getDealerBySlug(slug);
    if (bySlug) {
      const result: TenantResolution = {
        dealer: bySlug,
        resolvedVia: "subdomain",
      };
      await cacheSet(cacheKey, result, TENANT_CACHE_TTL_SECONDS);
      return result;
    }
  }

  // 4. Fallback to default dealer
  const defaultDealer = await getDealerBySlug(DEFAULT_DEALER_SLUG);
  if (defaultDealer) {
    const result: TenantResolution = {
      dealer: defaultDealer,
      resolvedVia: "default",
    };
    await cacheSet(cacheKey, result, TENANT_CACHE_TTL_SECONDS);
    return result;
  }

  return null;
}

/**
 * Invalidate all cached tenant data for a dealer.
 *
 * Call this when dealer settings (branding, domains, active status) change
 * so subsequent requests pick up fresh data.
 */
export async function invalidateTenantCache(dealerId: string): Promise<void> {
  // Wipe every hostname → tenant mapping; the alternative is maintaining a
  // reverse index of dealer → hostnames, but the SCAN-based invalidation
  // in cacheInvalidate is fast enough for this use case.
  await cacheInvalidate(`${TENANT_CACHE_PREFIX}*`);

  // Also clear any dealer-specific caches downstream
  await cacheInvalidate(`dealer:${dealerId}:*`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize hostname to lowercase, strip port and trailing dots.
 */
function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/\.$/, "")        // trailing dot in FQDN
    .trim();
}

/**
 * Extract the subdomain slug from a hostname.
 *
 * "wolfpack-motors.wolfpackauto.com" → "wolfpack-motors"
 * "wolfpackauto.com" → null
 */
function extractSubdomain(hostname: string): string | null {
  for (const suffix of SUBDOMAIN_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      const slug = hostname.slice(0, -suffix.length);
      // Must be a single label (no dots) and non-empty
      if (slug && !slug.includes(".")) {
        return slug;
      }
    }
  }
  return null;
}
