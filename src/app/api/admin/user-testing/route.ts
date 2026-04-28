import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { createTest, type CreateTestConfig, type UserTest } from "@/lib/user-testing";
import { trackUserTest } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/*  Demo data (shadow mode — no DATABASE_URL)                                  */
/* -------------------------------------------------------------------------- */

const DEMO_TESTS: UserTest[] = [
  {
    id: "test-demo-001",
    dealer_id: "demo",
    title: "Find a vehicle under $30k",
    description: "Can visitors easily find affordable vehicles using the inventory search?",
    tasks: [
      {
        id: "task-demo-001-0",
        title: "Navigate to inventory",
        description: "Find the inventory page from the homepage",
        success_url_pattern: "/inventory*",
        max_duration_seconds: 30,
        order: 0,
      },
      {
        id: "task-demo-001-1",
        title: "Apply price filter",
        description: "Use the price filter to find vehicles under $30,000",
        success_url_pattern: "/inventory*",
        success_selector: ".price-filter",
        max_duration_seconds: 45,
        order: 1,
      },
      {
        id: "task-demo-001-2",
        title: "View a vehicle detail page",
        description: "Click on a vehicle to see its details",
        success_url_pattern: "/inventory/*",
        max_duration_seconds: 30,
        order: 2,
      },
    ],
    created_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-02T14:30:00Z",
    active: true,
    total_participants: 24,
  },
  {
    id: "test-demo-002",
    dealer_id: "demo",
    title: "Schedule a test drive",
    description: "How easily can visitors schedule a test drive for a vehicle?",
    tasks: [
      {
        id: "task-demo-002-0",
        title: "Find a vehicle",
        description: "Browse to any vehicle detail page",
        success_url_pattern: "/inventory/*",
        max_duration_seconds: 60,
        order: 0,
      },
      {
        id: "task-demo-002-1",
        title: "Click test drive button",
        description: "Find and click the schedule test drive button",
        success_url_pattern: "/inventory/*",
        success_selector: "#schedule-test-drive",
        max_duration_seconds: 30,
        order: 1,
      },
      {
        id: "task-demo-002-2",
        title: "Submit the form",
        description: "Fill out and submit the test drive form",
        success_url_pattern: "/test-drive/confirmation*",
        max_duration_seconds: 120,
        order: 2,
      },
    ],
    created_at: "2026-03-28T09:00:00Z",
    updated_at: "2026-04-01T16:00:00Z",
    active: true,
    total_participants: 18,
  },
  {
    id: "test-demo-003",
    dealer_id: "demo",
    title: "Complete a trade-in valuation",
    description: "Can visitors get a trade-in estimate without assistance?",
    tasks: [
      {
        id: "task-demo-003-0",
        title: "Navigate to trade-in page",
        description: "Find the trade-in valuation tool",
        success_url_pattern: "/trade-in*",
        max_duration_seconds: 45,
        order: 0,
      },
      {
        id: "task-demo-003-1",
        title: "Enter vehicle information",
        description: "Fill in year, make, model, and condition",
        success_url_pattern: "/trade-in*",
        success_selector: "#trade-in-submit",
        max_duration_seconds: 90,
        order: 1,
      },
    ],
    created_at: "2026-03-25T11:00:00Z",
    updated_at: "2026-03-30T09:00:00Z",
    active: false,
    total_participants: 31,
  },
];

/* -------------------------------------------------------------------------- */
/*  GET /api/admin/user-testing                                                */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ tests: DEMO_TESTS });
  }

  // --- Live mode ---
  const dealerId = getDealerId(authResult);
  try {
    const { query } = await import("@/lib/db");

    const rows = await query(
      `SELECT t.*,
              COALESCE(r.cnt, 0) AS total_participants
       FROM user_tests t
       LEFT JOIN (
         SELECT test_id, COUNT(DISTINCT participant_id) AS cnt
         FROM test_recordings
         GROUP BY test_id
       ) r ON r.test_id = t.id
       WHERE t.dealer_id = $1
       ORDER BY t.created_at DESC`,
      [dealerId],
    );

    const tests = rows.rows.map((row: Record<string, unknown>) => ({
      ...row,
      tasks: typeof row.tasks === "string" ? JSON.parse(row.tasks as string) : row.tasks,
    }));

    trackUserTest("usertest.report_generated", dealerId, { test_count: tests.length });
    return NextResponse.json({ tests });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ tests: DEMO_TESTS });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*  POST /api/admin/user-testing                                               */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json();
  const { title, description, tasks } = body;

  if (!title || !tasks || !Array.isArray(tasks)) {
    return NextResponse.json(
      { error: "title and tasks[] are required" },
      { status: 400 },
    );
  }

  const dealerId = getDealerId(authResult);

  const config: CreateTestConfig = {
    dealer_id: dealerId,
    title,
    description: description ?? "",
    tasks,
  };

  const test = createTest(config);

  // --- Shadow mode ---
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ test, mode: "shadow" }, { status: 201 });
  }

  // --- Live mode ---
  try {
    const { query } = await import("@/lib/db");

    await query(
      `INSERT INTO user_tests (id, dealer_id, title, description, tasks, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        test.id,
        test.dealer_id,
        test.title,
        test.description,
        JSON.stringify(test.tasks),
        test.active,
        test.created_at,
        test.updated_at,
      ],
    );

    trackUserTest("usertest.created", dealerId, { test_id: test.id, title: test.title, task_count: test.tasks.length });
    return NextResponse.json({ test }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ test, mode: "shadow" }, { status: 201 });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*  PATCH /api/admin/user-testing?id=<id> — edit a user test                  */
/* -------------------------------------------------------------------------- */
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dealerId = getDealerId(authResult);
  const allowed: Record<string, string> = {
    title: "title",
    description: "description",
    tasks: "tasks",
    active: "active",
  };
  const setClauses: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  let idx = 1;
  for (const [k, col] of Object.entries(allowed)) {
    if (body[k] === undefined) continue;
    setClauses.push(`${col} = $${idx++}`);
    params.push(k === "tasks" ? JSON.stringify(body[k]) : body[k]);
  }
  if (setClauses.length === 1) {
    return NextResponse.json({ error: "No editable fields supplied" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    trackUserTest("usertest.updated", dealerId, { test_id: id, mode: "shadow" });
    return NextResponse.json({ id, updated: true, mode: "shadow" });
  }

  try {
    const { query } = await import("@/lib/db");
    const result = await query(
      `UPDATE user_tests SET ${setClauses.join(", ")} WHERE id = $${idx} AND dealer_id = $${idx + 1} RETURNING *`,
      [...params, id, dealerId],
    );
    if ((result.rows as unknown[]).length === 0) {
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }
    trackUserTest("usertest.updated", dealerId, { test_id: id });
    return NextResponse.json({ test: result.rows[0], updated: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/does not exist/i.test(msg)) {
      trackUserTest("usertest.updated", dealerId, { test_id: id, mode: "shadow" });
      return NextResponse.json({ id, updated: true, mode: "shadow", warning: "user_tests table missing — edit recorded in shadow mode only" });
    }
    return NextResponse.json({ error: "Database error", cause: msg.slice(0, 200) }, { status: 500 });
  }
}

/* -------------------------------------------------------------------------- */
/*  DELETE /api/admin/user-testing?id=<id> — soft-delete a user test          */
/* -------------------------------------------------------------------------- */
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  const dealerId = getDealerId(authResult);

  if (!process.env.DATABASE_URL) {
    trackUserTest("usertest.deleted", dealerId, { test_id: id, mode: "shadow" });
    return NextResponse.json({ id, deleted: true, mode: "shadow" });
  }

  try {
    const { query } = await import("@/lib/db");
    await query(
      `UPDATE user_tests SET active = false, updated_at = NOW()
        WHERE id = $1 AND dealer_id = $2`,
      [id, dealerId],
    );
    try {
      await query(
        `INSERT INTO audit_log (dealer_id, action, resource_type, resource_id)
         VALUES ($1, 'usertest.deleted', 'user_test', $2)`,
        [dealerId, id],
      );
    } catch {}
    trackUserTest("usertest.deleted", dealerId, { test_id: id });
    return NextResponse.json({ id, deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/does not exist/i.test(msg)) {
      trackUserTest("usertest.deleted", dealerId, { test_id: id, mode: "shadow" });
      return NextResponse.json({ id, deleted: true, mode: "shadow" });
    }
    return NextResponse.json({ error: "Database error", cause: msg.slice(0, 200) }, { status: 500 });
  }
}
