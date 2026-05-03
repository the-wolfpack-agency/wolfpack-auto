import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { encode } from "next-auth/jwt";
import { trackSystem } from "@/lib/analytics-hooks";

/**
 * POST /api/admin/switch-dealer — switch session to a different dealer context
 *
 * Only allowed for:
 *   - demo users (demo-dealer)
 *   - users with 'owner' role
 *
 * Updates the session JWT with the new dealer_id and returns the new dealer info.
 */

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const isDemoUser = session.user.id === "demo-user";
  const isOwner = session.user.role === "admin" || session.user.role === "manager";

  // Only agency-level users can switch dealers
  if (!isDemoUser && !isOwner) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { dealer_id } = body as { dealer_id?: string };

  if (!dealer_id) {
    return NextResponse.json({ error: "dealer_id is required" }, { status: 400 });
  }

  // Verify dealer exists (shadow mode returns mock data)
  let dealerName = dealer_id;
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await /* audit-safe: A4 reason="dealer-switch-target-validation" */ query(
        `SELECT id, name, slug FROM dealers WHERE id = $1 AND is_active = true`,
        [dealer_id],
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ error: "Dealer not found" }, { status: 404 });
      }
      dealerName = (result.rows[0] as { name: string }).name;
    } catch (err) {
      console.error("[switch-dealer] DB error:", err);
    }
  }

  // Create a new JWT with the updated dealer_id
  const secret = process.env.NEXTAUTH_SECRET || (() => {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[SWITCH-DEALER] NEXTAUTH_SECRET must be set in production. " +
        "Generate one with: openssl rand -base64 32"
      );
    }
    return "wolfpack-dev-secret-do-not-use-in-production";
  })();

  try {
    const newToken = await encode({
      token: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        dealer_id: dealer_id,
        role: session.user.role,
        lastActivity: Date.now(),
        mfa_pending: false,
        mfa_verified: true,
      },
      secret,
    });

    try {
      trackSystem("agency.dealer_switched", dealer_id, {
        from_dealer: session.user.dealer_id,
        to_dealer: dealer_id,
        user: session.user.email,
      });
    } catch { /* analytics never blocks */ }

    // Set the new session cookie
    const response = NextResponse.json({
      success: true,
      dealer: {
        id: dealer_id,
        name: dealerName,
      },
    });

    // Set the session token cookie (next-auth default cookie name)
    const cookieName = process.env.NODE_ENV === "production"
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token";

    response.cookies.set(cookieName, newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60, // match session maxAge
    });

    return response;
  } catch (err) {
    console.error("[switch-dealer] JWT encode error:", err);
    return NextResponse.json({ error: "Failed to switch dealer context" }, { status: 500 });
  }
}
