/**
 * Operator-side auth guard for Wolfpack staff routes.
 *
 * Mirrors `requireAuth` in `auth-guard.ts` but enforces that the session
 * was issued by the "wolfpack-staff" NextAuth provider (kind === "wolfpack_staff").
 *
 * A dealer session — even a dealer "owner" — must NOT pass this guard. That
 * separation is the whole point of the operator console: dealers manage
 * their own dealership, Wolfpack staff manage the agency.
 */

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { trackSecurity } from "@/lib/analytics-hooks";

export type WolfpackRole = "admin" | "operator" | "viewer";

export interface WolfpackStaffSession {
  staff: {
    id: string;
    email: string;
    name: string;
    role: WolfpackRole;
  };
}

const ROLE_RANK: Record<WolfpackRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
};

/**
 * Require a valid Wolfpack staff session. Returns the staff record or a
 * 401/403 NextResponse.
 *
 * @param request    request object for analytics/audit metadata
 * @param minRole    minimum required role — default "viewer". Use "operator"
 *                   for mutating actions and "admin" for invite issuance.
 */
export async function requireWolfpackStaff(
  request?: NextRequest,
  minRole: WolfpackRole = "viewer",
): Promise<WolfpackStaffSession | NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || session.kind !== "wolfpack_staff") {
    try {
      const ip =
        request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        request?.headers.get("x-real-ip") ??
        "unknown";
      const route = request?.nextUrl?.pathname ?? "unknown";
      trackSecurity("security.unauthorized_access_attempt", "system", {
        route,
        ip,
        kind: session?.kind ?? "anonymous",
        timestamp: new Date().toISOString(),
      });
    } catch { /* analytics must never block */ }

    return NextResponse.json(
      { error: "Wolfpack staff authentication required" },
      { status: 401 },
    );
  }

  const staffRole = (session.staff_role ?? "viewer") as WolfpackRole;

  if (ROLE_RANK[staffRole] < ROLE_RANK[minRole]) {
    return NextResponse.json(
      { error: `Insufficient permissions — requires ${minRole}` },
      { status: 403 },
    );
  }

  return {
    staff: {
      id: session.staff_id ?? session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: staffRole,
    },
  };
}

/**
 * Type guard — true if `result` is a session, not a NextResponse error.
 */
export function isWolfpackStaff(
  result: WolfpackStaffSession | NextResponse,
): result is WolfpackStaffSession {
  return !(result instanceof NextResponse);
}

/**
 * Extract the request IP for audit logging. Returns "unknown" when not
 * resolvable (which is fine — the audit row is still written).
 */
export function getRequestIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}
