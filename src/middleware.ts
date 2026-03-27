import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { SECURITY_HEADERS } from "@/lib/security-headers";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  generateCSRFToken,
  validateCSRFToken,
} from "@/lib/csrf";

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

/**
 * OEM ID for this deployment. Set via OEM_ID env var per-deployment so
 * OEM-scoped admin portals always query the correct OEM partition without
 * a DB round-trip in Edge middleware.
 */
const OEM_ID = process.env.OEM_ID ?? "";

/** Routes that bypass tenant resolution (admin panel, API health, etc.). */
const ADMIN_ROUTE_PREFIXES = ["/admin", "/api/admin", "/api/health", "/_next"];

/** Platform domains — serve the marketing site, not a dealer. */
const PLATFORM_DOMAINS = new Set([
  "wolfpackauto.com",
  "www.wolfpackauto.com",
  // Vercel deployment domains (dev + preview)
  "wolfpack-auto.vercel.app",
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

  // Vercel preview/branch deploy URLs — treat as platform, not a dealer tenant.
  // Covers wolfpack-auto-git-branch-org.vercel.app, etc.
  if (normalized.endsWith(".vercel.app")) {
    return null;
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

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "localhost";
  const { pathname } = request.nextUrl;
  const method = request.method;

  // --- CSRF protection for mutating requests to public form endpoints ---
  // Skip: GET/HEAD/OPTIONS, NextAuth routes (has its own CSRF), requests
  // with Bearer auth (API clients), and non-form API routes.
  const isMutating = !["GET", "HEAD", "OPTIONS"].includes(method);
  const isPublicFormRoute = pathname === "/api/contact";
  const isAuthApiRoute = pathname.startsWith("/api/auth");
  const hasBearerAuth = request.headers
    .get("authorization")
    ?.startsWith("Bearer ");

  if (isMutating && isPublicFormRoute && !isAuthApiRoute && !hasBearerAuth) {
    const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
    const headerToken = request.headers.get(CSRF_HEADER_NAME);

    if (!validateCSRFToken(headerToken, cookieToken)) {
      return applyHeaders(
        NextResponse.json(
          { error: "Invalid or missing CSRF token" },
          { status: 403 },
        ),
        hostname,
      );
    }
  }

  // --- Authentication check for admin routes ---
  // Login page and NextAuth API routes are always accessible.
  // All other /admin and /api/admin routes require a valid session.
  const isLogin = pathname === "/admin/login";
  const isAuthApi = pathname.startsWith("/api/auth");

  // Auth check for admin routes.
  // Controlled by DEMO_MODE env var — set to "true" only for public demos.
  // Production deployments must NOT set DEMO_MODE=true.
  const isDemoMode = process.env.DEMO_MODE === "true";
  if (!isDemoMode && isAdminRoute(pathname) && !isLogin && !isAuthApi) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET || "wolfpack-dev-secret-change-in-production" });

    if (!token) {
      // Redirect browser requests to login; return 401 for API calls
      if (pathname.startsWith("/api/")) {
        return applyHeaders(
          NextResponse.json({ error: "Authentication required" }, { status: 401 }),
          hostname,
          request,
        );
      }

      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return applyHeaders(NextResponse.redirect(loginUrl), hostname, request);
    }

    // Authenticated admin route — continue without tenant resolution
    return applyHeaders(NextResponse.next(), hostname, request);
  }

  // Unauthenticated admin routes (login page, auth API) bypass tenant resolution
  if (isAdminRoute(pathname) || isAuthApi) {
    const adminReqHeaders = new Headers(request.headers);
    adminReqHeaders.set("x-is-admin", "1");
    // Propagate OEM context for admin routes — read by server components via headers()
    adminReqHeaders.set("x-oem-id", OEM_ID);
    const adminResponse = NextResponse.next({ request: { headers: adminReqHeaders } });
    return applyHeaders(adminResponse, hostname, request);
  }

  const tenantSlug = extractTenantSlug(hostname);

  // If this is a platform domain (no tenant), let it through — serves
  // the marketing / landing page at the app root.
  if (tenantSlug === null) {
    return applyHeaders(NextResponse.next(), hostname, request);
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

  // OEM context for public tenant routes (dealer sub-pages, inventory, etc.)
  requestHeaders.set("x-oem-id", OEM_ID);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  return applyHeaders(response, hostname, request);
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

function applyHeaders(
  response: NextResponse,
  _hostname: string,
  request?: NextRequest,
): NextResponse {
  // Apply security headers
  for (const { key, value } of SECURITY_HEADERS) {
    response.headers.set(key, value);
  }

  // Strip server identification
  response.headers.delete("X-Powered-By");
  response.headers.delete("Server");

  // Propagate OEM ID as a response header so server components can read it.
  // The request-side header is set above; this ensures it surfaces on the
  // response object as well (useful for debugging and Edge->Node handoff).
  if (OEM_ID) {
    response.headers.set("x-oem-id", OEM_ID);
  }

  // Ensure a CSRF double-submit cookie is always set. The client reads
  // this cookie and sends it back as a header on mutating requests.
  if (request && !request.cookies.has(CSRF_COOKIE_NAME)) {
    response.cookies.set(CSRF_COOKIE_NAME, generateCSRFToken(), {
      httpOnly: false, // Must be readable by client JS
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });
  }

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
