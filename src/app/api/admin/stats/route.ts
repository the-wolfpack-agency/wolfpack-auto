/**
 * GET /api/admin/stats
 *
 * Returns dashboard statistics for the admin portal.
 * In production this would be scoped to the authenticated dealer.
 */

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";

export async function GET() {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = getDealerId(authResult);

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      vehicles: { total: 47, available: 38, pending: 3, sold: 5, in_transit: 1 },
      leads: { total: 195, new: 47, contacted: 38, qualified: 22, appointment_set: 14, sold: 8, lost: 66 },
      avg_days_on_lot: 34,
      conversion_rate: 6,
      recent_leads: [],
    });
  }

  try {
    const [vehicleStats, leadStats, avgDaysResult, recentLeadsResult] =
      await Promise.all([
        // Vehicle counts by status
        query<{ status: string; count: string }>(
          `SELECT status, COUNT(*)::text AS count
           FROM vehicles
           WHERE dealer_id = $1
           GROUP BY status`,
          [dealerId],
        ),

        // Lead counts by status
        query<{ status: string; count: string }>(
          `SELECT status, COUNT(*)::text AS count
           FROM leads
           WHERE dealer_id = $1
           GROUP BY status`,
          [dealerId],
        ),

        // Average days on lot for available vehicles
        query<{ avg_days: string }>(
          `SELECT COALESCE(
             ROUND(AVG(EXTRACT(EPOCH FROM (now() - created_at)) / 86400))::text,
             '0'
           ) AS avg_days
           FROM vehicles
           WHERE dealer_id = $1 AND status = 'available'`,
          [dealerId],
        ),

        // Recent leads (last 10)
        query(
          `SELECT id, first_name, last_name, email, phone,
                  vehicle_interest, source, status, created_at
           FROM leads
           WHERE dealer_id = $1
           ORDER BY created_at DESC
           LIMIT 10`,
          [dealerId],
        ),
      ]);

    // Parse vehicle counts
    const vehicles = {
      total: 0,
      available: 0,
      pending: 0,
      sold: 0,
      in_transit: 0,
    };
    for (const row of vehicleStats.rows as any[]) {
      const count = parseInt(row.count, 10);
      vehicles.total += count;
      if (row.status in vehicles) {
        vehicles[row.status as keyof typeof vehicles] = count;
      }
    }

    // Parse lead counts
    const leads = {
      total: 0,
      new: 0,
      contacted: 0,
      qualified: 0,
      appointment_set: 0,
      sold: 0,
      lost: 0,
    };
    for (const row of leadStats.rows as any[]) {
      const count = parseInt(row.count, 10);
      leads.total += count;
      if (row.status in leads) {
        leads[row.status as keyof typeof leads] = count;
      }
    }

    // Conversion rate: sold / total leads (excluding lost)
    const convertible = leads.total - leads.lost;
    const conversionRate =
      convertible > 0
        ? Math.round((leads.sold / convertible) * 100)
        : 0;

    return NextResponse.json({
      vehicles,
      leads,
      avg_days_on_lot: parseInt(
        (avgDaysResult.rows as any[])[0]?.avg_days ?? "0",
        10,
      ),
      conversion_rate: conversionRate,
      recent_leads: recentLeadsResult.rows,
    });
  } catch (error) {
    console.error("[api/admin/stats] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 },
    );
  }
}
