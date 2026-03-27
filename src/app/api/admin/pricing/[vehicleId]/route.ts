/**
 * PATCH /api/admin/pricing/[vehicleId]
 *
 * Apply or dismiss a pricing recommendation for a specific vehicle.
 *   body: { action: 'apply' | 'dismiss', new_price?: number }
 *
 * 'apply'  — updates the vehicle price in the vehicles table and marks the
 *            recommendation as applied.
 * 'dismiss' — marks the recommendation as dismissed (no price change).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { query } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ vehicleId: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const { vehicleId } = await params;

  if (!vehicleId) {
    return NextResponse.json({ error: "vehicleId is required" }, { status: 400 });
  }

  let body: { action?: unknown; new_price?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, new_price } = body;

  if (action !== "apply" && action !== "dismiss") {
    return NextResponse.json(
      { error: "action must be 'apply' or 'dismiss'" },
      { status: 400 },
    );
  }

  try {
    // Verify the vehicle belongs to this dealer
    const vehicleCheck = await query(
      `SELECT id, price FROM vehicles WHERE id = $1 AND dealer_id = $2`,
      [vehicleId, dealerId],
    );

    if (vehicleCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Vehicle not found or access denied" },
        { status: 404 },
      );
    }

    if (action === "apply") {
      // Determine the new price: caller-supplied or recommended price from rec
      let finalPrice: number | null = null;

      if (typeof new_price === "number" && new_price > 0) {
        finalPrice = new_price;
      } else {
        // Fall back to the recommended price from the latest recommendation
        const rec = await query(
          `SELECT recommended_price
             FROM pricing_recommendations
            WHERE vehicle_id = $1 AND dealer_id = $2
              AND applied_at IS NULL
            ORDER BY generated_at DESC
            LIMIT 1`,
          [vehicleId, dealerId],
        );

        if (rec.rows.length > 0) {
          finalPrice = Number((rec.rows[0] as any).recommended_price);
        }
      }

      if (!finalPrice || finalPrice <= 0) {
        return NextResponse.json(
          { error: "No valid new_price provided and no recommendation found" },
          { status: 400 },
        );
      }

      // Update vehicle price
      await query(
        `UPDATE vehicles
            SET price = $1, updated_at = NOW()
          WHERE id = $2 AND dealer_id = $3`,
        [finalPrice, vehicleId, dealerId],
      );

      // Mark recommendation applied
      await query(
        `UPDATE pricing_recommendations
            SET applied_at = NOW()
          WHERE vehicle_id = $1 AND dealer_id = $2
            AND applied_at IS NULL`,
        [vehicleId, dealerId],
      );

      return NextResponse.json({
        success: true,
        vehicleId,
        action: "applied",
        newPrice: finalPrice,
      });
    }

    // action === 'dismiss'
    await query(
      `UPDATE pricing_recommendations
          SET dismissed_at = NOW()
        WHERE vehicle_id = $1 AND dealer_id = $2
          AND dismissed_at IS NULL`,
      [vehicleId, dealerId],
    );

    return NextResponse.json({
      success: true,
      vehicleId,
      action: "dismissed",
    });
  } catch (err) {
    console.error(`[PATCH /api/admin/pricing/${vehicleId}] Error:`, err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
