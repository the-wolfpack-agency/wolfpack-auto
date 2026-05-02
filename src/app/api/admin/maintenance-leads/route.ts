/**
 * GET /api/admin/maintenance-leads — list leads with filters
 *
 * Query params: status, urgency, lead_type, limit.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-guard";
import { getDealerId } from "@/lib/get-dealer-id";
import { trackServerEvent } from "@/lib/analytics";
import {
  type LeadStatus,
  type LeadType,
  type Urgency,
  listLeadsForDealer,
} from "@/lib/connected-vehicle";

export const runtime = "nodejs";

const VALID_STATUSES: LeadStatus[] = [
  "open",
  "contacted",
  "scheduled",
  "completed",
  "dismissed",
];
const VALID_URGENCIES: Urgency[] = [
  "immediate",
  "soon",
  "scheduled",
  "monitoring",
];
const VALID_LEAD_TYPES: LeadType[] = [
  "oil_change",
  "brake_service",
  "tire_replacement",
  "battery_replacement",
  "recall",
  "general_dtc",
  "mileage_milestone",
];

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const dealerId = getDealerId(auth);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const urgency = url.searchParams.get("urgency");
  const lead_type = url.searchParams.get("lead_type");
  const limit = Number(url.searchParams.get("limit") ?? "200");

  if (status && !VALID_STATUSES.includes(status as LeadStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (urgency && !VALID_URGENCIES.includes(urgency as Urgency)) {
    return NextResponse.json({ error: "Invalid urgency" }, { status: 400 });
  }
  if (lead_type && !VALID_LEAD_TYPES.includes(lead_type as LeadType)) {
    return NextResponse.json({ error: "Invalid lead_type" }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ leads: [], mode: "shadow" });
  }

  try {
    const leads = await listLeadsForDealer(dealerId, {
      status: (status as LeadStatus) ?? undefined,
      urgency: (urgency as Urgency) ?? undefined,
      lead_type: (lead_type as LeadType) ?? undefined,
      limit: Number.isFinite(limit) ? limit : 200,
    });
    try {
      await trackServerEvent("maintenance.leads_listed", {
        dealer_id: dealerId,
        count: leads.length,
      });
    } catch {
      /* analytics never blocks */
    }
    return NextResponse.json({ leads });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("does not exist")) {
      return NextResponse.json({ leads: [], mode: "shadow" });
    }
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }
}
