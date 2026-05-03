import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { auditLog } from "@/lib/audit-log";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackSystem } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface Task {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  assigned_by: string;
  due_date: string | null;
  status: "pending" | "in_progress" | "completed";
  priority: "high" | "medium" | "low";
  created_at: string;
  recognition_note: string | null;
}

/* -------------------------------------------------------------------------- */
/* Shadow / mock data                                                          */
/* -------------------------------------------------------------------------- */

const MOCK_TASKS: Task[] = [
  {
    id: "task-001",
    title: "Follow up with high-priority leads",
    description: "Call back all hot leads that came in this week before end of day.",
    assigned_to: "Sarah Chen",
    assigned_by: "Mike Reynolds",
    due_date: "2026-03-28T17:00:00Z",
    status: "in_progress",
    priority: "high",
    created_at: "2026-03-25T09:00:00Z",
    recognition_note: null,
  },
  {
    id: "task-002",
    title: "Update vehicle pricing spreadsheet",
    description: "Refresh all pre-owned prices based on current market data.",
    assigned_to: "James Kowalski",
    assigned_by: "Mike Reynolds",
    due_date: "2026-03-27T12:00:00Z",
    status: "completed",
    priority: "medium",
    created_at: "2026-03-24T10:00:00Z",
    recognition_note: null,
  },
  {
    id: "task-003",
    title: "Prepare Saturday event signage",
    description: "Print and position all promotional banners for the weekend sale event.",
    assigned_to: "Priya Patel",
    assigned_by: "Mike Reynolds",
    due_date: "2026-03-29T08:00:00Z",
    status: "pending",
    priority: "medium",
    created_at: "2026-03-25T14:00:00Z",
    recognition_note: null,
  },
  {
    id: "task-004",
    title: "Complete compliance training module",
    description: "Finish the annual state compliance certification before the quarter ends.",
    assigned_to: "Tom Bradley",
    assigned_by: "Mike Reynolds",
    due_date: "2026-03-31T23:59:00Z",
    status: "pending",
    priority: "high",
    created_at: "2026-03-20T08:00:00Z",
    recognition_note: null,
  },
  {
    id: "rec-001",
    title: "Recognition: Outstanding Customer Service",
    description: "",
    assigned_to: "Sarah Chen",
    assigned_by: "Mike Reynolds",
    due_date: null,
    status: "completed",
    priority: "low",
    created_at: "2026-03-24T16:00:00Z",
    recognition_note:
      "Sarah went above and beyond helping a customer navigate their first EV purchase — incredible patience and product knowledge!",
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function dbAvailable(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

async function writeAudit(
  action: string,
  meta: Record<string, unknown>,
  userId: string,
  dealerId: string,
): Promise<void> {
  void auditLog(action, meta, userId, dealerId);
}

/* -------------------------------------------------------------------------- */
/* GET /api/admin/tasks                                                        */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type"); // "tasks" | "recognitions" | null = all

  if (dbAvailable()) {
    try {
      const { query } = await import("@/lib/db");
      const conditions = ["dealer_id = $1"];
      const params: unknown[] = [dealerId];

      if (type === "tasks") {
        conditions.push("recognition_note IS NULL");
      } else if (type === "recognitions") {
        conditions.push("recognition_note IS NOT NULL");
      }

      const result = await /* audit-safe: A4 reason="dealer_id = $1 is the first entry in conditions[] above; cannot be omitted" */ query(
        `SELECT id, title, description, assigned_to, assigned_by, due_date,
                status, priority, created_at, recognition_note
         FROM employee_tasks
         WHERE ${conditions.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT 100`,
        params,
      );

      return NextResponse.json({ tasks: result.rows });
    } catch (err) {
      console.error("[api/admin/tasks] DB error, falling back:", err);
    }
  }

  // Shadow mode fallback
  let filtered = [...MOCK_TASKS];
  if (type === "tasks") filtered = filtered.filter((t) => !t.recognition_note);
  else if (type === "recognitions") filtered = filtered.filter((t) => t.recognition_note);

  return NextResponse.json({ tasks: filtered });
}

/* -------------------------------------------------------------------------- */
/* POST /api/admin/tasks                                                       */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);
  const { user } = authResult;

  let body: {
    action: "create_task" | "recognize";
    title?: string;
    description?: string;
    assigned_to?: string;
    due_date?: string;
    priority?: "high" | "medium" | "low";
    recognition_note?: string;
    employee_name?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action } = body;
  if (!action || !["create_task", "recognize"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const newId = `task-${Date.now()}`;
  const now = new Date().toISOString();

  if (dbAvailable()) {
    try {
      const { query } = await import("@/lib/db");

      if (action === "create_task") {
        await query(
          `INSERT INTO employee_tasks
             (id, dealer_id, title, description, assigned_to, assigned_by, due_date, status, priority, created_at, recognition_note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,NULL)`,
          [
            newId,
            dealerId,
            body.title ?? "Untitled Task",
            body.description ?? "",
            body.assigned_to ?? "",
            user.name ?? user.email,
            body.due_date ?? null,
            body.priority ?? "medium",
            now,
          ],
        );

        await writeAudit(
          "task.create",
          { task_id: newId, priority: body.priority, assigned_to: body.assigned_to },
          user.id,
          user.dealer_id,
        );

        try { trackSystem("system.task_created", authResult?.user?.dealer_id ?? "system", { action: "task_created", priority: body.priority ?? "medium" }); } catch {}
        return NextResponse.json({ success: true, id: newId });
      } else {
        // recognize
        await query(
          `INSERT INTO employee_tasks
             (id, dealer_id, title, description, assigned_to, assigned_by, due_date, status, priority, created_at, recognition_note)
           VALUES ($1,$2,$3,'','$4',$5,NULL,'completed','low',$6,$7)`,
          [
            newId,
            dealerId,
            `Recognition: ${body.employee_name ?? "Team Member"}`,
            body.employee_name ?? "",
            user.name ?? user.email,
            now,
            body.recognition_note ?? "",
          ],
        );

        await writeAudit(
          "employee.recognize",
          { employee_name: body.employee_name },
          user.id,
          user.dealer_id,
        );

        return NextResponse.json({ success: true, id: newId });
      }
    } catch (err) {
      console.error("[api/admin/tasks] POST DB error:", err);
    }
  }

  // Shadow mode: return success with mock id
  await writeAudit(
    action === "create_task" ? "task.create" : "employee.recognize",
    action === "create_task"
      ? { task_id: newId, priority: body.priority, assigned_to: body.assigned_to }
      : { employee_name: body.employee_name },
    user.id,
    user.dealer_id,
  );

  try { trackSystem("system.task_created", authResult?.user?.dealer_id ?? "system", { action: action === "create_task" ? "task_created" : "recognition_given" }); } catch {}
  return NextResponse.json({ success: true, id: newId, mode: "shadow" });
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/tasks                                                      */
/* -------------------------------------------------------------------------- */

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);
  const { user } = authResult;

  let body: { id: string; status: "pending" | "in_progress" | "completed" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, status } = body;
  if (!id || !["pending", "in_progress", "completed"].includes(status)) {
    return NextResponse.json({ error: "Missing id or invalid status" }, { status: 400 });
  }

  if (dbAvailable()) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `UPDATE employee_tasks SET status = $1 WHERE id = $2 AND dealer_id = $3`,
        [status, id, dealerId],
      );

      await writeAudit(
        "task.status_update",
        { task_id: id, status },
        user.id,
        user.dealer_id,
      );

      return NextResponse.json({ success: true });
    } catch (err) {
      console.error("[api/admin/tasks] PATCH DB error:", err);
    }
  }

  return NextResponse.json({ success: true, mode: "shadow" });
}
