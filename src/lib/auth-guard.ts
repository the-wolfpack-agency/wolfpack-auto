import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { trackSecurity } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  dealer_id: string;
  role: "owner" | "admin" | "manager" | "staff";
}

export interface AuthResult {
  user: AuthenticatedUser;
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Require a valid session for an API route.
 *
 * Returns the authenticated user or a 401 NextResponse.
 * When a request object is provided, the caller's IP and the route path are
 * included in the emitted analytics event.
 */
export async function requireAuth(
  request?: NextRequest,
): Promise<AuthResult | NextResponse> {
  // DEMO_MODE must NEVER bypass authentication. It only enables the demo
  // *credential* (demo@wolfpackauto.com / demo) in src/lib/auth.ts — the user
  // still has to log in and receives a real session. A previous DEMO_MODE bypass
  // here returned a synthetic admin with no login, which left the deployed admin
  // panel + all dealer data (incl. lead PII) served unauthenticated on a public
  // URL (platform-scan critical, 2026-06). Authentication is always enforced.
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    try {
      const ip =
        request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request?.headers.get("x-real-ip") ??
        "unknown";
      const route = request?.nextUrl?.pathname ?? "unknown";
      trackSecurity("security.unauthorized_access_attempt", "system", {
        route,
        ip,
        timestamp: new Date().toISOString(),
      });
    } catch { /* analytics must never block */ }

    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  return {
    user: session.user as AuthenticatedUser,
  };
}

/**
 * Require a valid session with one of the specified roles.
 *
 * Returns the authenticated user, or a 401/403 NextResponse.
 */
export async function requireRole(
  roles: string[],
): Promise<AuthResult | NextResponse> {
  const result = await requireAuth();

  // If requireAuth returned a NextResponse (error), pass it through
  if (result instanceof NextResponse) {
    return result;
  }

  if (!roles.includes(result.user.role)) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 },
    );
  }

  return result;
}

/**
 * Type guard to check if the result is an authenticated user (not an error response).
 */
export function isAuthenticated(
  result: AuthResult | NextResponse,
): result is AuthResult {
  return !(result instanceof NextResponse);
}
