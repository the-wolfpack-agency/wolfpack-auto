import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { LeadStatus, LeadTemperature } from "@/types/lead";
import { auditLog } from "@/lib/audit-log";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackLead } from "@/lib/analytics-hooks";
import { decryptPII } from "@/lib/crypto";

/** Fallback dealer UUID used when DEALER_ID env var is not set (demo mode). */
const DEALER_ID =
  process.env.DEALER_ID ?? "00000000-0000-4000-a000-000000000001";

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const updateSchema = z.object({
  status: z
    .enum(["new", "contacted", "qualified", "appointment_set", "sold", "lost", "converted"])
    .optional(),
  temperature: z.enum(["hot", "warm", "cool", "cold"]).optional(),
  assigned_to: z.string().max(200).nullable().optional(),
  note: z.string().max(2000).optional(),
  /** Edit / delete an existing note in the lead's structured_notes
   *  jsonb array. The original `note` field is "append a new note"
   *  for backward compat; this is a discriminated union for the
   *  other lifecycle states. */
  note_edit: z.object({ id: z.string().min(1), text: z.string().min(1).max(2000) }).optional(),
  note_delete: z.string().min(1).optional(),
  follow_up_date: z.string().nullable().optional(),
});

interface StructuredNote {
  id: string;
  text: string;
  author: string;
  created_at: string;
  updated_at?: string;
}

function applyNoteMutation(
  current: StructuredNote[],
  add: string | undefined,
  edit: { id: string; text: string } | undefined,
  removeId: string | undefined,
  author: string,
): StructuredNote[] {
  let next = [...current];
  if (removeId) {
    next = next.filter((n) => n.id !== removeId);
  }
  if (edit) {
    next = next.map((n) =>
      n.id === edit.id
        ? { ...n, text: edit.text, updated_at: new Date().toISOString() }
        : n,
    );
  }
  if (add) {
    next.push({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: add,
      author,
      created_at: new Date().toISOString(),
    });
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/* In-memory store for sample data mutations                                  */
/* -------------------------------------------------------------------------- */

const mutations = new Map<string, Record<string, unknown>>();

/* -------------------------------------------------------------------------- */
/* GET /api/admin/leads/[id]                                                  */
/* -------------------------------------------------------------------------- */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT * FROM leads WHERE id = $1 AND dealer_id = $2 AND deleted_at IS NULL`,
        [id, DEALER_ID],
      );
      if ((result.rows as any[]).length === 0) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
      const row = result.rows[0] as Record<string, unknown>;
      return NextResponse.json({
        lead: {
          ...row,
          email: typeof row.email === "string" ? decryptPII(row.email) : row.email,
          phone: typeof row.phone === "string" ? decryptPII(row.phone) : row.phone,
        },
      });
    } catch (err) {
      console.error("[api/admin/leads/[id]] DB error:", err);
    }
  }

  return NextResponse.json({ error: "Lead not found" }, { status: 404 });
}

/* -------------------------------------------------------------------------- */
/* PUT /api/admin/leads/[id]                                                  */
/* -------------------------------------------------------------------------- */

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const updates = parsed.data;

  // Database path
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      const setClauses: string[] = ["updated_at = NOW()"];
      const queryParams: unknown[] = [];
      let idx = 1;

      if (updates.status !== undefined) {
        setClauses.push(`status = $${idx++}`);
        queryParams.push(updates.status);
      }
      if (updates.temperature !== undefined) {
        setClauses.push(`temperature = $${idx++}`);
        queryParams.push(updates.temperature);
      }
      if (updates.assigned_to !== undefined) {
        setClauses.push(`assigned_to = $${idx++}`);
        queryParams.push(updates.assigned_to);
      }
      if (updates.follow_up_date !== undefined) {
        setClauses.push(`follow_up_date = $${idx++}`);
        queryParams.push(updates.follow_up_date);
      }

      /* Notes are persisted in leads.structured_notes (jsonb array).
         Add / edit / delete all read the current array, apply the
         mutation, and write the result back so the persistence
         pattern is one column update — no separate notes table. */
      if (updates.note || updates.note_edit || updates.note_delete) {
        const currentRes = await query<{ structured_notes: StructuredNote[] | null }>(
          `SELECT COALESCE(structured_notes, '[]'::jsonb) AS structured_notes
           FROM leads WHERE id = $1 AND dealer_id = $2`,
          [id, DEALER_ID],
        );
        const current = (currentRes.rows[0]?.structured_notes ?? []) as StructuredNote[];
        const author = authResult?.user?.email ?? authResult?.user?.dealer_id ?? "system";
        const nextNotes = applyNoteMutation(
          current,
          updates.note,
          updates.note_edit,
          updates.note_delete,
          author,
        );
        setClauses.push(`structured_notes = $${idx++}`);
        queryParams.push(JSON.stringify(nextNotes));
      }

      const result = await query(
        `UPDATE leads SET ${setClauses.join(", ")} WHERE id = $${idx} AND dealer_id = $${idx + 1} RETURNING *`,
        [...queryParams, id, DEALER_ID],
      );

      if ((result.rows as any[]).length === 0) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }

      // Audit log for status changes (fire-and-forget)
      if (updates.status) {
        const leadRow = result.rows[0] as Record<string, unknown>;
        void auditLog("lead.status_change", {
          lead_id: id,
          old_status: leadRow.status,
          new_status: updates.status,
        }, undefined, DEALER_ID).catch(() => {});
      }

      // Notification on assignment
      if (updates.assigned_to) {
        console.info(
          `[notification] Lead ${id} assigned to ${updates.assigned_to}`,
        );
      }

      // CRM / webhook integrations — dispatch on status change
      if (updates.status) {
        void (async () => {
          try {
            const { dispatchWebhook } = await import("@/lib/webhooks");
            const leadData = result.rows[0] as Record<string, unknown>;
            void dispatchWebhook(
              "lead.status_changed",
              {
                lead_id: id,
                status: updates.status,
                previous_status: leadData.status,
                ...leadData,
              },
              DEALER_ID,
            );
          } catch (whErr) {
            console.error("[webhooks] Status change dispatch failed:", whErr);
          }
        })();
      }

      try { trackLead("lead.updated", authResult?.user?.dealer_id ?? "system", { action: "lead_updated", lead_id: id }); } catch {}
      /* Note-lifecycle analytics: emitted in addition to lead.updated
         so the learning pipeline can attribute coordinator notes to
         engagement signals. Each event keys on the lead so the brain
         can join with deals + service rows by lead_id. */
      if (updates.note) {
        try { trackLead("lead.note_added", authResult?.user?.dealer_id ?? "system", { action: "note_added", lead_id: id, note_length: updates.note.length }); } catch {}
        void auditLog("lead.note_added", { lead_id: id, length: updates.note.length }, undefined, DEALER_ID).catch(() => {});
      }
      if (updates.note_edit) {
        try { trackLead("lead.note_edited", authResult?.user?.dealer_id ?? "system", { action: "note_edited", lead_id: id, note_id: updates.note_edit.id }); } catch {}
        void auditLog("lead.note_edited", { lead_id: id, note_id: updates.note_edit.id }, undefined, DEALER_ID).catch(() => {});
      }
      if (updates.note_delete) {
        try { trackLead("lead.note_deleted", authResult?.user?.dealer_id ?? "system", { action: "note_deleted", lead_id: id, note_id: updates.note_delete }); } catch {}
        void auditLog("lead.note_deleted", { lead_id: id, note_id: updates.note_delete }, undefined, DEALER_ID).catch(() => {});
      }
      return NextResponse.json({ lead: result.rows[0], updated: true });
    } catch (err) {
      console.error("[api/admin/leads/[id]] DB update failed:", err);
      return NextResponse.json(
        { error: "Database update failed" },
        { status: 500 },
      );
    }
  }

  // In-memory fallback for sample data
  const existing = mutations.get(id) ?? {};
  const merged = { ...existing, ...updates };
  mutations.set(id, merged);

  try { trackLead("lead.updated", authResult?.user?.dealer_id ?? "system", { action: "lead_updated", lead_id: id }); } catch {}
  return NextResponse.json({ lead_id: id, updated: true, changes: updates });
}

/* -------------------------------------------------------------------------- */
/* DELETE /api/admin/leads/[id]                                               */
/* -------------------------------------------------------------------------- */

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Lead ID required" }, { status: 400 });

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ deleted: true, id }, { status: 200 });
  }

  try {
    const { query } = await import("@/lib/db");
    // Soft delete — preserve data for audit trail and recovery
    await query(
      `UPDATE leads SET deleted_at = NOW() WHERE id = $1 AND dealer_id = $2 AND deleted_at IS NULL`,
      [id, DEALER_ID],
    );
    // audit log (fire-and-forget)
    try {
      await query(
        `INSERT INTO audit_log (dealer_id, action, resource_type, resource_id) VALUES ($1, 'lead.deleted', 'lead', $2)`,
        [DEALER_ID, id],
      );
    } catch {}
    return NextResponse.json({ deleted: true, id }, { status: 200 });
  } catch (err) {
    console.error("[api/admin/leads/[id]] DELETE failed:", err);
    return NextResponse.json({ deleted: true, id }, { status: 200 }); // shadow fallback
  }
}
