/**
 * POST /api/admin/resources/analytics
 *
 * Tracks resource view events (PDFs, guides, training materials).
 * Called from the admin Resources page when a dealer user opens a resource.
 * Feeds into the learning system so we know which resources are most used.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  try {
    const body = await req.json();
    const eventType = body.event_type ?? "resource_viewed";
    const metadata = body.metadata ?? {};

    if (process.env.DATABASE_URL) {
      trackSystem("system.engagement_logged", authResult.user.dealer_id, {
        action: eventType,
        ...metadata,
      });
    }

    return NextResponse.json({ tracked: true });
  } catch {
    return NextResponse.json({ tracked: false, error: "Invalid request body" }, { status: 400 });
  }
}
