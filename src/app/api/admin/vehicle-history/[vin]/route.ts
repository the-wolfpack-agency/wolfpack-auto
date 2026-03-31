/**
 * GET /api/admin/vehicle-history/[vin] — Get the most recent report for a specific VIN
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";

/* -------------------------------------------------------------------------- */
/* VIN validation                                                             */
/* -------------------------------------------------------------------------- */

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

/* -------------------------------------------------------------------------- */
/* Shadow mock — same dataset as parent route                                 */
/* -------------------------------------------------------------------------- */

const MOCK_REPORTS: Record<string, {
  id: string;
  dealer_id: string;
  vin: string;
  provider: string;
  vehicle_description: string;
  pulled_at: string;
  expires_at: string;
  report_url: string;
  summary: {
    title_status: string;
    owners: number;
    accidents: number;
    service_records: number;
    open_recalls: number;
    odometer_status: string;
    structural_damage: boolean;
    airbag_deployed: boolean;
    theft_reported: boolean;
  };
  history_entries: { date: string; description: string; mileage: number; source: string; category: string }[];
  value_impact: { score: number; factors_positive: string[]; factors_negative: string[] };
}> = {
  "4T1G11AK5RU123456": {
    id: "vhr-001",
    dealer_id: "demo-dealer",
    vin: "4T1G11AK5RU123456",
    provider: "carfax",
    vehicle_description: "2024 Toyota Camry XSE",
    pulled_at: "2026-03-28T09:30:00Z",
    expires_at: "2026-04-27T09:30:00Z",
    report_url: "https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=4T1G11AK5RU123456",
    summary: { title_status: "clean", owners: 1, accidents: 0, service_records: 12, open_recalls: 0, odometer_status: "ok", structural_damage: false, airbag_deployed: false, theft_reported: false },
    history_entries: [
      { date: "2024-01-15", description: "Vehicle manufactured and shipped to dealer", mileage: 5, source: "Toyota Motor Corp", category: "title" },
      { date: "2024-02-01", description: "Title issued — TX — First owner reported", mileage: 12, source: "Texas DMV", category: "title" },
    ],
    value_impact: { score: 92, factors_positive: ["Clean title", "Single owner", "12 service records"], factors_negative: [] },
  },
  "7FARS6H79RE045678": {
    id: "vhr-002",
    dealer_id: "demo-dealer",
    vin: "7FARS6H79RE045678",
    provider: "carfax",
    vehicle_description: "2025 Honda CR-V Hybrid Sport-L",
    pulled_at: "2026-03-28T10:45:00Z",
    expires_at: "2026-04-27T10:45:00Z",
    report_url: "https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=7FARS6H79RE045678",
    summary: { title_status: "clean", owners: 0, accidents: 0, service_records: 0, open_recalls: 0, odometer_status: "ok", structural_damage: false, airbag_deployed: false, theft_reported: false },
    history_entries: [
      { date: "2025-01-08", description: "Vehicle manufactured", mileage: 0, source: "Honda Motor Co", category: "title" },
    ],
    value_impact: { score: 98, factors_positive: ["Brand new vehicle", "Clean title", "Factory warranty"], factors_negative: [] },
  },
  "1FTFW1E80RFA12345": {
    id: "vhr-003",
    dealer_id: "demo-dealer",
    vin: "1FTFW1E80RFA12345",
    provider: "carfax",
    vehicle_description: "2024 Ford F-150 XLT SuperCrew",
    pulled_at: "2026-03-25T08:15:00Z",
    expires_at: "2026-04-24T08:15:00Z",
    report_url: "https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=1FTFW1E80RFA12345",
    summary: { title_status: "clean", owners: 2, accidents: 1, service_records: 8, open_recalls: 0, odometer_status: "ok", structural_damage: false, airbag_deployed: false, theft_reported: false },
    history_entries: [
      { date: "2024-03-01", description: "Vehicle manufactured and shipped", mileage: 10, source: "Ford Motor Company", category: "title" },
      { date: "2024-09-22", description: "Minor rear-end collision reported", mileage: 12400, source: "Insurance Claim", category: "accident" },
    ],
    value_impact: { score: 71, factors_positive: ["Clean title", "Regular service history"], factors_negative: ["1 accident reported", "2 owners"] },
  },
  "5UX43DP05R9E78901": {
    id: "vhr-004",
    dealer_id: "demo-dealer",
    vin: "5UX43DP05R9E78901",
    provider: "autocheck",
    vehicle_description: "2025 BMW X3 xDrive30i",
    pulled_at: "2026-03-28T11:15:00Z",
    expires_at: "2026-04-27T11:15:00Z",
    report_url: "https://www.autocheck.com/members/report.do?vin=5UX43DP05R9E78901",
    summary: { title_status: "clean", owners: 1, accidents: 0, service_records: 3, open_recalls: 0, odometer_status: "ok", structural_damage: false, airbag_deployed: false, theft_reported: false },
    history_entries: [
      { date: "2024-11-01", description: "Vehicle manufactured — Spartanburg, SC", mileage: 0, source: "BMW AG", category: "title" },
      { date: "2026-03-15", description: "Lease return — vehicle transferred to dealer", mileage: 14500, source: "BMW of Austin", category: "sale" },
    ],
    value_impact: { score: 88, factors_positive: ["Clean title", "Single-owner lease return", "All dealer-serviced"], factors_negative: ["Lease return"] },
  },
  "2T2HZMDA4PC123456": {
    id: "vhr-005",
    dealer_id: "demo-dealer",
    vin: "2T2HZMDA4PC123456",
    provider: "carfax",
    vehicle_description: "2023 Lexus RX 350 F Sport",
    pulled_at: "2026-03-24T14:30:00Z",
    expires_at: "2026-04-23T14:30:00Z",
    report_url: "https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=2T2HZMDA4PC123456",
    summary: { title_status: "clean", owners: 1, accidents: 0, service_records: 18, open_recalls: 0, odometer_status: "ok", structural_damage: false, airbag_deployed: false, theft_reported: false },
    history_entries: [
      { date: "2022-10-01", description: "Vehicle manufactured — Miyawaka, Japan", mileage: 0, source: "Toyota Motor Corp", category: "title" },
      { date: "2026-03-01", description: "Vehicle listed as CPO", mileage: 18200, source: "Lexus of Austin", category: "sale" },
    ],
    value_impact: { score: 96, factors_positive: ["Clean title", "Single owner", "Lexus CPO", "18 service records"], factors_negative: [] },
  },
};

/* -------------------------------------------------------------------------- */
/* GET /api/admin/vehicle-history/[vin]                                       */
/* -------------------------------------------------------------------------- */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ vin: string }> },
) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  const { vin: rawVin } = await params;
  const vin = rawVin.toUpperCase().trim();

  if (!VIN_REGEX.test(vin)) {
    return NextResponse.json(
      { error: "Invalid VIN. Must be 17 alphanumeric characters (excluding I, O, Q)." },
      { status: 422 },
    );
  }

  /* ---- DB path ---- */
  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const result = await query(
        `SELECT vhr.*
           FROM vehicle_history_reports vhr
          WHERE vhr.dealer_id = $1 AND vhr.vin = $2
          ORDER BY vhr.pulled_at DESC
          LIMIT 1`,
        [dealerId, vin],
      );

      if ((result.rows as unknown[]).length === 0) {
        return NextResponse.json(
          { report: null, message: "No report found for this VIN. Pull a new report to get started." },
          { status: 404 },
        );
      }

      const report = result.rows[0] as { expires_at: string };
      const expired = new Date(report.expires_at) < new Date();

      return NextResponse.json({
        report: result.rows[0],
        expired,
        message: expired ? "Report has expired. Consider pulling a fresh report." : undefined,
      });
    } catch (err) {
      console.error("[api/admin/vehicle-history/[vin]] DB error, falling back to mock:", err);
      /* fall through to mock */
    }
  }

  /* ---- Shadow mode ---- */
  const report = MOCK_REPORTS[vin];
  if (!report) {
    return NextResponse.json(
      { report: null, message: "No report found for this VIN. Pull a new report to get started." },
      { status: 404 },
    );
  }

  const expired = new Date(report.expires_at) < new Date();

  return NextResponse.json({
    report,
    expired,
    message: expired ? "Report has expired. Consider pulling a fresh report." : undefined,
  });
}
