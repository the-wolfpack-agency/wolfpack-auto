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
  // In DEMO_MODE, return a synthetic admin user so API routes work without login.
  // DEMO_MODE should NEVER be set in production with real customer data.
  if (process.env.DEMO_MODE === "true") {
    return {
      user: {
        id: "demo-user",
        email: "demo@wolfpackauto.com",
        name: "Demo Admin",
        dealer_id: process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001",
        role: "admin",
      },
    };
  }

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
