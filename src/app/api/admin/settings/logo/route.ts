/**
 * POST   /api/admin/settings/logo — upload a dealer logo
 * DELETE /api/admin/settings/logo — remove the current logo
 *
 * Accepts multipart/form-data with a "logo" file field.
 * Stores the logo as a base64 data URL in the dealers.logo_url column.
 * When Vercel Blob or S3 is configured, swap the storage here without
 * changing the client component.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackSystem } from "@/lib/analytics-hooks";

export const runtime = "nodejs";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/svg+xml"]);

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ logo_url: null, message: "Shadow mode — logo not persisted" });
  }

  const dealerId = authResult.user.dealer_id;

  try {
    const formData = await req.formData();
    const file = formData.get("logo");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only PNG, JPG, or SVG files are accepted" },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File must be under 2 MB" },
        { status: 400 },
      );
    }

    // Convert to base64 data URL for DB storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    const { query } = await import("@/lib/db");
    await /* audit-safe: A4 reason="dealers.id IS the dealer_id; parameter is from session, so this updates only the calling tenant's row" */ query(
      `UPDATE dealers SET logo_url = $1, updated_at = NOW() WHERE id = $2`,
      [dataUrl, dealerId],
    );

    try {
      trackSystem("system.settings_updated", dealerId, {
        action: "logo_uploaded",
        file_type: file.type,
        file_size: file.size,
      });
    } catch { /* analytics must not break upload */ }

    return NextResponse.json({ logo_url: dataUrl });
  } catch (err) {
    console.error("[POST /api/admin/settings/logo] Error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

export async function DELETE() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ logo_url: null });
  }

  const dealerId = authResult.user.dealer_id;

  try {
    const { query } = await import("@/lib/db");
    await /* audit-safe: A4 reason="dealers.id IS the dealer_id; parameter is from session, so this updates only the calling tenant's row" */ query(
      `UPDATE dealers SET logo_url = NULL, updated_at = NOW() WHERE id = $1`,
      [dealerId],
    );

    try {
      trackSystem("system.settings_updated", dealerId, { action: "logo_removed" });
    } catch { /* analytics must not break */ }

    return NextResponse.json({ logo_url: null });
  } catch (err) {
    console.error("[DELETE /api/admin/settings/logo] Error:", err);
    return NextResponse.json({ error: "Remove failed" }, { status: 500 });
  }
}
