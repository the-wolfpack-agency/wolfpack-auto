/**
 * POST /api/privacy/export-data — CCPA data export (right to portability)
 *
 * Returns all data associated with a customer email as structured JSON.
 * Requires admin authentication.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { exportCustomerData } from "@/lib/privacy";
import { trackCompliance } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/* POST /api/privacy/export-data                                               */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const { dealer_id: dealerId } = authResult.user;

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.email || typeof body.email !== "string" || !body.email.includes("@")) {
    return NextResponse.json(
      { error: "A valid customer email is required" },
      { status: 400 },
    );
  }

  const email = body.email.toLowerCase().trim();

  try {
    const exportData = await exportCustomerData(email, dealerId);

    // Track compliance event — fire-and-forget (hash email, never log raw PII)
    try {
      const emailHash = createHash("sha256").update(email).digest("hex").slice(0, 16);
      trackCompliance("compliance.data_export", dealerId, {
        action: "data_export",
        email_hash: emailHash,
        categories_exported: Object.keys(exportData).length,
      });
    } catch { /* analytics must never throw */ }

    return NextResponse.json({
      success: true,
      export: exportData,
    });
  } catch (err) {
    console.error("[api/privacy/export-data] Error:", err);
    return NextResponse.json(
      { error: "Failed to export customer data" },
      { status: 500 },
    );
  }
}
