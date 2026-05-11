/**
 * POST /api/operator/auth/logout
 *
 * Logs the staff session out by clearing NextAuth session cookies.
 * Writes an audit row if there was an active staff session.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireWolfpackStaff, isWolfpackStaff, getRequestIp } from "@/lib/operator-auth";
import { logStaffAction } from "@/lib/wolfpack-staff-audit";

const SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export async function POST(request: NextRequest) {
  const auth = await requireWolfpackStaff(request);

  // Always clear cookies — even unauthenticated logout is harmless.
  const response = NextResponse.json({ ok: true });
  for (const name of SESSION_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }

  if (isWolfpackStaff(auth)) {
    await logStaffAction({
      staffId: auth.staff.id,
      action: "operator.logout",
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
  }

  return response;
}
