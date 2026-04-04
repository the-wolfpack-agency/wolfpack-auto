import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { trackAnnotation } from "@/lib/analytics-hooks";
import {
  createAnnotation,
  getAnnotationsForRange,
  getAnnotationsForDashboard,
  deleteAnnotation,
  type AnnotationType,
} from "@/lib/dashboard-annotations";

/* -------------------------------------------------------------------------- */
/* Demo data                                                                   */
/* -------------------------------------------------------------------------- */

const DEMO_ANNOTATIONS = [
  { id: "ann-demo-1", dashboardId: "main", date: "2026-03-15", text: "Spring sale campaign launched", type: "campaign" as const, createdBy: "admin", createdAt: "2026-03-15T09:00:00Z", metadata: {} },
  { id: "ann-demo-2", dashboardId: "main", date: "2026-03-20", text: "Website redesign went live", type: "milestone" as const, createdBy: "admin", createdAt: "2026-03-20T14:00:00Z", metadata: {} },
  { id: "ann-demo-3", dashboardId: "main", date: "2026-03-25", text: "Inventory system outage — 2hr downtime", type: "alert" as const, createdBy: "system", createdAt: "2026-03-25T16:00:00Z", metadata: {} },
  { id: "ann-demo-4", dashboardId: "leads", date: "2026-03-28", text: "New Facebook ad set started, expect lead volume spike", type: "note" as const, createdBy: "admin", createdAt: "2026-03-28T08:00:00Z", metadata: {} },
];

/* -------------------------------------------------------------------------- */
/* GET /api/admin/annotations?dashboardId=xxx&start=&end=                      */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;
  const dashboardId = request.nextUrl.searchParams.get("dashboardId") ?? "main";
  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");

  // Shadow mode
  if (!process.env.DATABASE_URL) {
    let filtered = DEMO_ANNOTATIONS.filter((a) => a.dashboardId === dashboardId);
    if (start && end) {
      const s = new Date(start).getTime();
      const e = new Date(end).getTime();
      filtered = filtered.filter((a) => {
        const d = new Date(a.date).getTime();
        return d >= s && d <= e;
      });
    }
    trackAnnotation("annotation.viewed", dealerId, {
      dashboard_id: dashboardId,
      count: filtered.length,
    });
    return NextResponse.json({ annotations: filtered });
  }

  try {
    let annotations;
    if (start && end) {
      annotations = await getAnnotationsForRange(dashboardId, start, end);
    } else {
      annotations = await getAnnotationsForDashboard(dashboardId);
    }

    trackAnnotation("annotation.viewed", dealerId, {
      dashboard_id: dashboardId,
      count: annotations.length,
    });

    return NextResponse.json({ annotations });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ annotations: DEMO_ANNOTATIONS });
    }
    console.error("[annotations] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load annotations" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/annotations                                                 */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;

  let body: {
    dashboardId: string;
    date: string;
    text: string;
    type: AnnotationType;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.dashboardId || !body.date || !body.text || !body.type) {
    return NextResponse.json(
      { error: "dashboardId, date, text, and type are required" },
      { status: 400 },
    );
  }

  try {
    const annotation = await createAnnotation({
      dashboardId: body.dashboardId,
      date: body.date,
      text: body.text,
      type: body.type,
      createdBy: auth.user.name,
    }, dealerId);

    trackAnnotation("annotation.created", dealerId, {
      dashboard_id: body.dashboardId,
      annotation_type: body.type,
    });

    return NextResponse.json({ annotation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ annotation: null, error: "Table not migrated yet" });
    }
    console.error("[annotations] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create annotation" },
      { status: 500 },
    );
  }
}

/* -------------------------------------------------------------------------- */
/* DELETE /api/admin/annotations?id=xxx                                        */
/* -------------------------------------------------------------------------- */

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const dealerId = auth.user.dealer_id;
  const annotationId = request.nextUrl.searchParams.get("id");

  if (!annotationId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const deleted = await deleteAnnotation(annotationId);

    if (deleted) {
      trackAnnotation("annotation.deleted", dealerId, {
        annotation_id: annotationId,
      });
    }

    return NextResponse.json({ deleted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ deleted: false });
    }
    console.error("[annotations] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete annotation" },
      { status: 500 },
    );
  }
}
