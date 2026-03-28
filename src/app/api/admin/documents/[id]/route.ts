import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackDocument } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* GET /api/admin/documents/[id]                                              */
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
        `SELECT * FROM documents WHERE id = $1 AND dealer_id = $2 AND deleted_at IS NULL`,
        [id, authResult.user.dealer_id],
      );
      if ((result.rows as unknown[]).length === 0) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }
      return NextResponse.json({ document: result.rows[0] });
    } catch (err) {
      console.error("[api/admin/documents/[id]] DB error:", err);
    }
  }

  // Shadow mock
  return NextResponse.json({
    document: {
      id,
      dealer_id: authResult.user.dealer_id,
      deal_id: "deal-2026-001",
      lead_id: "lead-101",
      vehicle_vin: "1HGBH41JXMN109186",
      doc_type: "purchase_agreement",
      name: "Purchase Agreement - Rodriguez 2025 Accord",
      file_url: null,
      file_size_bytes: 245_760,
      mime_type: "application/pdf",
      uploaded_by: "Sarah Mitchell",
      signed: true,
      signed_at: "2026-03-25T15:30:00Z",
      notes: "Signed at delivery",
      tags: ["completed", "retail"],
      created_at: "2026-03-24T10:00:00Z",
    },
  });
}

/* -------------------------------------------------------------------------- */
/* PATCH /api/admin/documents/[id]                                            */
/* -------------------------------------------------------------------------- */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const dealerId = authResult.user.dealer_id;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const setClauses: string[] = [];
      const queryParams: unknown[] = [];
      let idx = 1;

      const allowedFields = ["name", "doc_type", "notes", "deal_id", "lead_id", "vehicle_vin"];
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          setClauses.push(`${field} = $${idx++}`);
          queryParams.push(body[field]);
        }
      }

      // Handle signing
      if (body.signed === true) {
        setClauses.push(`signed = true`);
        setClauses.push(`signed_at = NOW()`);
        if (body.signature_data) {
          setClauses.push(`signature_data = $${idx++}`);
          queryParams.push(body.signature_data);
        }
      }

      if (body.tags !== undefined) {
        setClauses.push(`tags = $${idx++}`);
        queryParams.push(body.tags);
      }

      if (setClauses.length === 0) {
        return NextResponse.json({ error: "No valid fields to update" }, { status: 422 });
      }

      const result = await query(
        `UPDATE documents SET ${setClauses.join(", ")} WHERE id = $${idx} AND dealer_id = $${idx + 1} AND deleted_at IS NULL RETURNING *`,
        [...queryParams, id, dealerId],
      );

      if ((result.rows as unknown[]).length === 0) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }

      if (body.signed === true) {
        try { trackDocument("document.signed", dealerId, { document_id: id }); } catch {}
      }

      return NextResponse.json({ document: result.rows[0], updated: true });
    } catch (err) {
      console.error("[api/admin/documents/[id]] DB update error:", err);
    }
  }

  // Shadow mode
  if (body.signed === true) {
    try { trackDocument("document.signed", dealerId, { document_id: id }); } catch {}
  }

  return NextResponse.json({
    document: { id, ...body, dealer_id: dealerId, updated_at: new Date().toISOString() },
    updated: true,
  });
}

/* -------------------------------------------------------------------------- */
/* DELETE /api/admin/documents/[id] (soft-delete)                             */
/* -------------------------------------------------------------------------- */

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  const { id } = await params;
  const dealerId = authResult.user.dealer_id;

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      await query(
        `UPDATE documents SET deleted_at = NOW() WHERE id = $1 AND dealer_id = $2`,
        [id, dealerId],
      );

      try { trackDocument("document.deleted", dealerId, { document_id: id }); } catch {}

      return NextResponse.json({ deleted: true, id });
    } catch (err) {
      console.error("[api/admin/documents/[id]] DELETE error:", err);
    }
  }

  // Shadow mode
  try { trackDocument("document.deleted", dealerId, { document_id: id }); } catch {}

  return NextResponse.json({ deleted: true, id });
}
