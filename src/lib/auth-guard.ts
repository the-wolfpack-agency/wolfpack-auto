import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

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
 */
export async function requireAuth(): Promise<AuthResult | NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
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
