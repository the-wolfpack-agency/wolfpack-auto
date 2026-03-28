import { NextRequest, NextResponse } from "next/server";
import { auditLog } from "@/lib/audit-log";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackDeal } from "@/lib/analytics-hooks";

/**
 * POST /api/admin/deals/sign
 *
 * Records a signed deal / buyer's order with e-signature data.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;

  let body: { lead_id?: string; vehicle_vin?: string; signature_data?: string; agreed_price?: number };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { lead_id, vehicle_vin, signature_data, agreed_price } = body;

  // Basic validation
  if (!lead_id || !vehicle_vin || !signature_data || agreed_price === undefined) {
    return NextResponse.json(
      { error: "Missing required fields: lead_id, vehicle_vin, signature_data, agreed_price" },
      { status: 422 },
    );
  }

  if (typeof agreed_price !== "number" || agreed_price <= 0) {
    return NextResponse.json(
      { error: "agreed_price must be a positive number" },
      { status: 422 },
    );
  }

  if (!signature_data.startsWith("data:image/png;base64,")) {
    return NextResponse.json(
      { error: "signature_data must be a base64 PNG data URL" },
      { status: 422 },
    );
  }

  // Cap signature at ~500 KB base64 (roughly 375 KB decoded image)
  if (signature_data.length > 500_000) {
    return NextResponse.json(
      { error: "signature_data exceeds maximum allowed size (500 KB)" },
      { status: 413 },
    );
  }

  const dealId = `deal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const signedAt = new Date().toISOString();

  // Audit log entry
  const auditEntry = {
    event: "deal.signed",
    deal_id: dealId,
    lead_id,
    vehicle_vin,
    agreed_price,
    signed_at: signedAt,
    ip: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown",
    user_agent: request.headers.get("user-agent") ?? "unknown",
  };

  // Attempt DB storage if available, otherwise log
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      await query(
        `INSERT INTO deals (id, lead_id, vehicle_vin, agreed_price, signature_data, status, signed_at, created_at)
         VALUES ($1, $2, $3, $4, $5, 'signed', $6, NOW())`,
        [dealId, lead_id, vehicle_vin, agreed_price, signature_data, signedAt],
      );

      // Audit log: record deal signing (fire-and-forget)
      void auditLog("deal.signed", {
        deal_id: dealId,
        vin: vehicle_vin,
        price: agreed_price,
      }).catch(() => {});

      try { trackDeal("deal.signed", authResult?.user?.dealer_id ?? "system", { action: "deal_signed", deal_id: dealId, agreed_price }); } catch {}
      return NextResponse.json(
        { deal_id: dealId, status: "signed", signed_at: signedAt },
        { status: 201 },
      );
    } catch (err) {
      console.error("[api/deals/sign] DB insert failed, falling back to log:", err);
    }
  }

  // No DB — log the deal and return success
  console.log("[api/deals/sign] Deal recorded (no DB):", JSON.stringify(auditEntry));

  try { trackDeal("deal.signed", authResult?.user?.dealer_id ?? "system", { action: "deal_signed", deal_id: dealId, agreed_price }); } catch {}
  return NextResponse.json(
    { deal_id: dealId, status: "signed", signed_at: signedAt },
    { status: 201 },
  );
}
