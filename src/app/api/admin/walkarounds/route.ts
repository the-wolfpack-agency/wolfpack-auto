import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { trackWalkaround } from "@/lib/analytics-hooks";
import {
  createWalkaround,
  addSegment,
  publishWalkaround,
  listWalkarounds,
  getWalkaroundForVehicle,
  type SegmentType,
} from "@/lib/video-walkaround";

/* -------------------------------------------------------------------------- */
/* Demo data                                                                   */
/* -------------------------------------------------------------------------- */

const DEMO_WALKAROUNDS = [
  {
    id: "wk-demo-001",
    vin: "1HGCV1F34LA000001",
    dealerId: "demo",
    status: "published" as const,
    segments: [
      { id: "seg-1", segmentType: "exterior_front", url: "/videos/accord-front.mp4", thumbnailUrl: "/videos/accord-front-thumb.jpg", durationSeconds: 25, addedAt: "2026-04-01T10:00:00Z" },
      { id: "seg-2", segmentType: "interior", url: "/videos/accord-interior.mp4", thumbnailUrl: "/videos/accord-interior-thumb.jpg", durationSeconds: 45, addedAt: "2026-04-01T10:05:00Z" },
      { id: "seg-3", segmentType: "engine", url: "/videos/accord-engine.mp4", thumbnailUrl: "/videos/accord-engine-thumb.jpg", durationSeconds: 20, addedAt: "2026-04-01T10:10:00Z" },
    ],
    metadata: { totalDuration: 90, segmentCount: 3, completeness: 38, lastUpdated: "2026-04-01T10:10:00Z" },
    createdAt: "2026-04-01T10:00:00Z",
    publishedAt: "2026-04-01T11:00:00Z",
    createdBy: "demo-user",
  },
  {
    id: "wk-demo-002",
    vin: "5TFDY5F10LX000002",
    dealerId: "demo",
    status: "draft" as const,
    segments: [
      { id: "seg-4", segmentType: "exterior_front", url: "/videos/tundra-front.mp4", thumbnailUrl: null, durationSeconds: 30, addedAt: "2026-04-02T09:00:00Z" },
    ],
    metadata: { totalDuration: 30, segmentCount: 1, completeness: 13, lastUpdated: "2026-04-02T09:00:00Z" },
    createdAt: "2026-04-02T09:00:00Z",
    publishedAt: null,
    createdBy: "demo-user",
  },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/walkarounds?vin=xxx                                          */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;
  const vin = request.nextUrl.searchParams.get("vin");

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    if (vin) {
      const found = DEMO_WALKAROUNDS.find((w) => w.vin === vin);
      trackWalkaround("walkaround.viewed", dealerId, { vin });
      return NextResponse.json({ walkaround: found ?? null });
    }
    return NextResponse.json({ walkarounds: DEMO_WALKAROUNDS });
  }

  try {
    if (vin) {
      const walkaround = await getWalkaroundForVehicle(vin);
      trackWalkaround("walkaround.viewed", dealerId, { vin });
      return NextResponse.json({ walkaround });
    }

    const walkarounds = await listWalkarounds(dealerId);
    return NextResponse.json({ walkarounds });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ walkarounds: DEMO_WALKAROUNDS });
    }
    console.error("[walkarounds] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load walkarounds" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/walkarounds                                                 */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;

  let body: {
    action: "create" | "add_segment" | "publish";
    vin?: string;
    walkaroundId?: string;
    segmentType?: SegmentType;
    url?: string;
    durationSeconds?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.action === "create") {
      if (!body.vin) {
        return NextResponse.json({ error: "vin is required" }, { status: 400 });
      }
      const walkaround = await createWalkaround(body.vin, dealerId, auth.user.id);
      trackWalkaround("walkaround.started", dealerId, { vin: body.vin });
      return NextResponse.json({ walkaround });
    }

    if (body.action === "add_segment") {
      if (!body.walkaroundId || !body.segmentType || !body.url) {
        return NextResponse.json(
          { error: "walkaroundId, segmentType, and url are required" },
          { status: 400 },
        );
      }
      const walkaround = await addSegment(
        body.walkaroundId,
        body.segmentType,
        body.url,
        body.durationSeconds,
      );
      if (!walkaround) {
        return NextResponse.json(
          { error: "Walkaround not found or already published" },
          { status: 404 },
        );
      }
      trackWalkaround("walkaround.segment_added", dealerId, {
        walkaround_id: body.walkaroundId,
        segment_type: body.segmentType,
      });
      return NextResponse.json({ walkaround });
    }

    if (body.action === "publish") {
      if (!body.walkaroundId) {
        return NextResponse.json(
          { error: "walkaroundId is required" },
          { status: 400 },
        );
      }
      const walkaround = await publishWalkaround(body.walkaroundId);
      if (!walkaround) {
        return NextResponse.json(
          { error: "Walkaround not found or has no segments" },
          { status: 404 },
        );
      }
      trackWalkaround("walkaround.published", dealerId, {
        walkaround_id: body.walkaroundId,
        vin: walkaround.vin,
        segment_count: walkaround.segments.length,
      });
      return NextResponse.json({ walkaround });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ walkaround: null, error: "Table not migrated yet" });
    }
    console.error("[walkarounds] POST error:", err);
    return NextResponse.json(
      { error: "Failed to process walkaround action" },
      { status: 500 },
    );
  }
}
