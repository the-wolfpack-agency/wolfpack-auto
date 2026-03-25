import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SECURITY_HEADERS } from "@/lib/security-headers";

/**
 * Next.js Edge Middleware — runs on every request.
 *
 * Responsibilities:
 *   1. Resolve the current tenant (dealer) from the hostname.
 *   2. Set dealer identity headers for downstream consumption.
 *   3. Apply security headers to all responses.
 *   4. Redirect unknown tenants (non-admin) to the marketing site.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARKETING_SITE_URL =
  process.env.MARKETING_SITE_URL ?? "https://wolfpackauto.com";

/** Routes that bypass tenant resolution (admin panel, API health, etc.). */
const ADMIN_ROUTE_PREFIXES = ["/admin", "/api/admin", "/api/health", "/_next"];

/** Platform domains — serve the marketing site, not a dealer. */
const PLATFORM_DOMAINS = new Set([
  "wolfpackauto.com",
  "www.wolfpackauto.com",
]);

/** Subdomain suffixes to strip when extracting a dealer slug. */
const SUBDOMAIN_SUFFIXES = [
  ".wolfpackauto.com",
  ".wolfpackauto.local",
  ".localhost",
];

// ---------------------------------------------------------------------------
// Tenant resolution (Edge-compatible — no Node.js APIs)
// ---------------------------------------------------------------------------

/**
 * Lightweight tenant resolution for Edge Runtime.
 *
 * The full `tenant-resolver.ts` (with Redis cache + DB lookup) runs in
 * Node.js API routes and server components. In middleware we do a fast
 * subdomain extraction and set headers. The first server component or
 * API route that needs the full dealer object loads it via the resolver.
 */
function extractTenantSlug(hostname: string): string | null {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  // Platform root domains — no tenant
  if (PLATFORM_DOMAINS.has(normalized)) return null;

  // Try subdomain extraction
  for (const suffix of SUBDOMAIN_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      const slug = normalized.slice(0, -suffix.length);
      if (slug && !slug.includes(".")) return slug;
    }
  }

  // Custom domain — pass the full hostname as the slug hint so the
  // server-side resolver can do a DB lookup. We prefix with "domain:"
  // to distinguish from subdomain slugs.
  if (!normalized.includes("localhost")) {
    return `domain:${normalized}`;
  }

  // localhost without subdomain — use default
  return null;
}

function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "localhost";
  const { pathname } = request.nextUrl;

  // Admin routes bypass tenant resolution entirely
  if (isAdminRoute(pathname)) {
    return applyHeaders(NextResponse.next(), hostname);
  }

  const tenantSlug = extractTenantSlug(hostname);

  // If this is a platform domain (no tenant), let it through — serves
  // the marketing / landing page at the app root.
  if (tenantSlug === null) {
    return applyHeaders(NextResponse.next(), hostname);
  }

  // Set tenant identity headers for server components and API routes.
  // The full dealer object is loaded lazily by tenant-context.ts via
  // the tenant-resolver.ts (Redis-cached DB lookup).
  const requestHeaders = new Headers(request.headers);

  if (tenantSlug.startsWith("domain:")) {
    // Custom domain — pass raw domain for DB lookup
    const domain = tenantSlug.slice("domain:".length);
    requestHeaders.set("x-dealer-domain", domain);
    requestHeaders.set("x-tenant-type", "custom_domain");
  } else {
    // Subdomain-based tenant
    requestHeaders.set("x-dealer-slug", tenantSlug);
    requestHeaders.set("x-tenant-type", "subdomain");
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  return applyHeaders(response, hostname);
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

function applyHeaders(response: NextResponse, _hostname: string): NextResponse {
  // Apply security headers
  for (const { key, value } of SECURITY_HEADERS) {
    response.headers.set(key, value);
  }

  // Strip server identification
  response.headers.delete("X-Powered-By");
  response.headers.delete("Server");

  return response;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *   - _next/static (static files)
     *   - _next/image (image optimization)
     *   - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
