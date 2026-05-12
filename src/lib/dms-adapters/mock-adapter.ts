/**
 * Mock DMS adapter — deterministic synthetic data for development, E2E
 * tests, and pre-sales demo motions when the dealer has not yet connected
 * a real DMS.
 *
 * Every payload sets `isMock: true` so downstream UI code can render a
 * clear "Demo data" banner. Never strip that flag before the data leaves
 * the adapter boundary — confusing mock data for real data is the kind of
 * production bug that costs trust.
 *
 * Determinism: the dataset is the same on every call (subject to filter).
 * No randomness, no timestamps that drift between requests. Tests can
 * assert exact shapes.
 */

import type { DMSAdapter } from "./adapter-interface";
import {
  ALL_CAPABILITIES,
  type AdapterCapability,
  type AdapterPingStatus,
  type AdapterResult,
  type DealFilter,
  type DMSDeal,
  type DMSLead,
  type DMSServiceOrder,
  type DMSVehicle,
  type LeadFilter,
  type ServiceOrderFilter,
  type VehicleFilter,
} from "./types";

const FIXED_NOW = "2026-05-12T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Synthetic fixtures
// ---------------------------------------------------------------------------

const VEHICLES: DMSVehicle[] = [
  v("MK-0001", "1HGCM82633A100001", "ST-1001", 2024, "Honda", "Accord", "EX-L", "Sedan", "Crystal Black", "Black", 8, "new", 32990, 34000, "available"),
  v("MK-0002", "1HGCM82633A100002", "ST-1002", 2023, "Honda", "CR-V", "EX", "SUV", "Modern Steel", "Gray", 15234, "used", 27450, null, "available"),
  v("MK-0003", "1HGCM82633A100003", "ST-1003", 2024, "Toyota", "Camry", "XSE", "Sedan", "Wind Chill Pearl", "Black", 12, "new", 31250, 32500, "available"),
  v("MK-0004", "1HGCM82633A100004", "ST-1004", 2022, "Toyota", "RAV4", "XLE", "SUV", "Silver Sky", "Gray", 28114, "cpo", 29900, null, "available"),
  v("MK-0005", "1HGCM82633A100005", "ST-1005", 2024, "Ford", "F-150", "Lariat", "Truck", "Antimatter Blue", "Black", 22, "new", 58900, 61000, "available"),
  v("MK-0006", "1HGCM82633A100006", "ST-1006", 2023, "Ford", "Mustang", "GT", "Coupe", "Race Red", "Black", 8412, "used", 44900, null, "available"),
  v("MK-0007", "1HGCM82633A100007", "ST-1007", 2024, "Chevrolet", "Silverado", "LT", "Truck", "Summit White", "Gray", 33, "new", 49850, 52000, "available"),
  v("MK-0008", "1HGCM82633A100008", "ST-1008", 2021, "Chevrolet", "Equinox", "Premier", "SUV", "Mosaic Black", "Black", 41203, "used", 22500, null, "pending_sale"),
  v("MK-0009", "1HGCM82633A100009", "ST-1009", 2024, "Subaru", "Outback", "Touring", "Wagon", "Crimson Red", "Tan", 17, "new", 41200, 42500, "available"),
  v("MK-0010", "1HGCM82633A100010", "ST-1010", 2023, "Nissan", "Altima", "SR", "Sedan", "Glacier White", "Charcoal", 9824, "cpo", 25900, null, "available"),
];

const LEADS: DMSLead[] = [
  l("MKL-0001", "Alice", "Garcia", "alice.garcia@example.com", "555-0101", "website", "new", "1HGCM82633A100001", "2026-05-11T14:22:00.000Z", "2026-05-11T15:10:00.000Z"),
  l("MKL-0002", "Brian", "Chen", "brian.chen@example.com", "555-0102", "phone", "contacted", "1HGCM82633A100005", "2026-05-10T10:05:00.000Z", "2026-05-11T09:30:00.000Z"),
  l("MKL-0003", "Carla", "Singh", null, "555-0103", "walk_in", "qualified", "1HGCM82633A100003", "2026-05-09T16:45:00.000Z", "2026-05-10T11:00:00.000Z"),
  l("MKL-0004", "Devon", "Murphy", "devon.murphy@example.com", null, "trade-in", "test_drive_scheduled", "1HGCM82633A100009", "2026-05-08T12:15:00.000Z", "2026-05-09T13:20:00.000Z"),
  l("MKL-0005", "Elena", "Park", "elena.park@example.com", "555-0105", "referral", "negotiating", "1HGCM82633A100007", "2026-05-07T09:00:00.000Z", "2026-05-11T16:00:00.000Z"),
];

const DEALS: DMSDeal[] = [
  d("MKD-0001", "Alice Garcia", "1HGCM82633A100001", "ST-1001", "funded", "retail", 32500, "2026-05-10T19:30:00.000Z", true, "2026-05-09T13:00:00.000Z"),
  d("MKD-0002", "Brian Chen", "1HGCM82633A100005", "ST-1005", "in_finance", "retail", 58200, null, false, "2026-05-11T11:00:00.000Z"),
  d("MKD-0003", "Frank Liu", "1HGCM82633A100008", "ST-1008", "delivered", "lease", 22500, "2026-05-08T17:00:00.000Z", true, "2026-05-07T10:00:00.000Z"),
];

const SERVICE_ORDERS: DMSServiceOrder[] = [
  s("MKS-0001", "George Patel", "1HGCM82633A200001", "in_progress", "oil_change_and_inspection", "2026-05-11T08:30:00.000Z", null),
  s("MKS-0002", "Helena Brooks", "1HGCM82633A200002", "open", "warranty_repair_brakes", "2026-05-12T07:45:00.000Z", null),
];

function v(
  externalId: string, vin: string, stockNumber: string, year: number, make: string,
  model: string, trim: string, bodyStyle: string, exteriorColor: string, interiorColor: string,
  mileage: number, condition: DMSVehicle["condition"], price: number | null, msrp: number | null,
  status: string,
): DMSVehicle {
  return {
    externalId, vin, stockNumber, year, make, model, trim, bodyStyle,
    exteriorColor, interiorColor, mileage, condition, price, msrp, status,
    inStockDate: FIXED_NOW, isMock: true,
  };
}

function l(
  externalId: string, firstName: string | null, lastName: string | null,
  email: string | null, phone: string | null, source: string, status: string,
  vehicleOfInterestVin: string | null, createdAt: string, lastActivityAt: string | null,
): DMSLead {
  return { externalId, firstName, lastName, email, phone, source, status, vehicleOfInterestVin, createdAt, lastActivityAt, isMock: true };
}

function d(
  externalId: string, customerName: string | null, vehicleVin: string,
  stockNumber: string | null, status: string, dealType: DMSDeal["dealType"],
  salePrice: number | null, fundedAt: string | null, funded: boolean, createdAt: string,
): DMSDeal {
  return { externalId, customerName, vehicleVin, stockNumber, status, dealType, salePrice, fundedAt, funded, createdAt, isMock: true };
}

function s(
  externalId: string, customerName: string | null, vehicleVin: string | null,
  status: DMSServiceOrder["status"], serviceType: string | null,
  openedAt: string, closedAt: string | null,
): DMSServiceOrder {
  return { externalId, customerName, vehicleVin, status, serviceType, openedAt, closedAt, isMock: true };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class MockDMSAdapter implements DMSAdapter {
  public readonly provider = "mock" as const;
  public readonly capabilities: ReadonlySet<AdapterCapability>;

  constructor() {
    // Mock adapter declares ALL capabilities so the registry passes through.
    this.capabilities = new Set(ALL_CAPABILITIES);
  }

  async ping(): Promise<AdapterResult<AdapterPingStatus>> {
    return { ok: true, data: { healthy: true, vendor_version: "mock-1.0.0" } };
  }

  async listVehicles(filter?: VehicleFilter): Promise<AdapterResult<DMSVehicle[]>> {
    let rows = VEHICLES.slice();
    if (filter?.vin) {
      const vin = filter.vin.toUpperCase();
      rows = rows.filter((r) => r.vin.toUpperCase() === vin);
    }
    if (filter?.stock) {
      const stock = filter.stock.toUpperCase();
      rows = rows.filter((r) => (r.stockNumber ?? "").toUpperCase() === stock);
    }
    if (typeof filter?.limit === "number" && filter.limit >= 0) {
      rows = rows.slice(0, filter.limit);
    }
    return { ok: true, data: rows };
  }

  async updateVehiclePrice(vin: string, newPrice: number): Promise<AdapterResult<void>> {
    if (typeof newPrice !== "number" || newPrice < 0) {
      return { ok: false, error: "upstream_error", detail: "price must be a non-negative number" };
    }
    const v = VEHICLES.find((row) => row.vin.toUpperCase() === vin.toUpperCase());
    if (!v) {
      return { ok: false, error: "upstream_error", detail: `vin not found: ${vin}` };
    }
    return { ok: true, data: undefined };
  }

  async listLeads(filter?: LeadFilter): Promise<AdapterResult<DMSLead[]>> {
    let rows = LEADS.slice();
    if (filter?.status) {
      rows = rows.filter((r) => r.status === filter.status);
    }
    if (filter?.since instanceof Date) {
      const since = filter.since.getTime();
      rows = rows.filter((r) => new Date(r.createdAt).getTime() >= since);
    }
    if (typeof filter?.limit === "number" && filter.limit >= 0) {
      rows = rows.slice(0, filter.limit);
    }
    return { ok: true, data: rows };
  }

  async updateLeadStatus(leadId: string, status: string): Promise<AdapterResult<void>> {
    if (!status) {
      return { ok: false, error: "upstream_error", detail: "status required" };
    }
    const lead = LEADS.find((r) => r.externalId === leadId);
    if (!lead) {
      return { ok: false, error: "upstream_error", detail: `lead not found: ${leadId}` };
    }
    return { ok: true, data: undefined };
  }

  async listDeals(filter?: DealFilter): Promise<AdapterResult<DMSDeal[]>> {
    let rows = DEALS.slice();
    if (typeof filter?.funded === "boolean") {
      rows = rows.filter((r) => r.funded === filter.funded);
    }
    if (filter?.since instanceof Date) {
      const since = filter.since.getTime();
      rows = rows.filter((r) => new Date(r.createdAt).getTime() >= since);
    }
    if (typeof filter?.limit === "number" && filter.limit >= 0) {
      rows = rows.slice(0, filter.limit);
    }
    return { ok: true, data: rows };
  }

  async listServiceOrders(
    filter?: ServiceOrderFilter,
  ): Promise<AdapterResult<DMSServiceOrder[]>> {
    let rows = SERVICE_ORDERS.slice();
    if (typeof filter?.open === "boolean") {
      rows = filter.open
        ? rows.filter((r) => r.status === "open" || r.status === "in_progress")
        : rows.filter((r) => r.status === "complete" || r.status === "closed");
    }
    if (typeof filter?.limit === "number" && filter.limit >= 0) {
      rows = rows.slice(0, filter.limit);
    }
    return { ok: true, data: rows };
  }
}

/** Factory used by the registry. Mock adapter ignores credentials. */
export function createMockAdapter(): MockDMSAdapter {
  return new MockDMSAdapter();
}
