/**
 * Customer Household Grouping — Links multiple family members and vehicles
 * to a single household for Customer 360 insights.
 *
 * Matching heuristics: shared address, phone, email domain, or last name + ZIP.
 */

import { trackHousehold } from "@/lib/analytics-hooks";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface HouseholdMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "primary" | "spouse" | "child" | "other";
  address: string;
  zip: string;
  joinedAt: string;
}

export interface HouseholdVehicle {
  id: string;
  ownerId: string;
  year: number;
  make: string;
  model: string;
  vin: string;
  status: "current" | "traded" | "sold";
  purchaseDate: string;
  saleDate?: string;
  purchasePrice: number;
}

export interface HouseholdLifetimeValue {
  totalVehiclePurchases: number;
  totalFiRevenue: number;
  totalServiceRevenue: number;
  totalRevenue: number;
  memberCount: number;
  vehicleCount: number;
  firstPurchaseDate: string;
  latestActivityDate: string;
}

export interface HouseholdOpportunity {
  type: "aging_vehicle" | "missing_service" | "fi_cross_sell" | "conquest";
  description: string;
  memberId: string;
  memberName: string;
  priority: "high" | "medium" | "low";
}

export interface Household {
  id: string;
  familyName: string;
  members: HouseholdMember[];
  vehicles: HouseholdVehicle[];
  lifetimeValue: HouseholdLifetimeValue;
  opportunities: HouseholdOpportunity[];
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Detection heuristics                                                       */
/* -------------------------------------------------------------------------- */

interface CustomerRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  zip: string;
}

/**
 * Detect potential household matches for a given customer.
 * Matches by: address, phone, email domain, or last name + ZIP.
 */
export function detectHouseholdMatches(
  target: CustomerRecord,
  candidates: CustomerRecord[],
): CustomerRecord[] {
  const targetDomain = target.email.split("@")[1]?.toLowerCase();
  const normalizedPhone = target.phone.replace(/\D/g, "");
  const normalizedAddress = target.address.trim().toLowerCase();

  return candidates.filter((c) => {
    if (c.id === target.id) return false;

    // Address match (exact, case-insensitive)
    if (
      normalizedAddress &&
      c.address.trim().toLowerCase() === normalizedAddress
    ) {
      return true;
    }

    // Phone match (digits only)
    const cPhone = c.phone.replace(/\D/g, "");
    if (normalizedPhone.length >= 10 && cPhone === normalizedPhone) {
      return true;
    }

    // Email domain match (same non-public domain)
    const cDomain = c.email.split("@")[1]?.toLowerCase();
    if (
      targetDomain &&
      cDomain === targetDomain &&
      !isPublicEmailDomain(targetDomain)
    ) {
      return true;
    }

    // Last name + ZIP match
    if (
      target.lastName.toLowerCase() === c.lastName.toLowerCase() &&
      target.zip === c.zip &&
      target.zip.length >= 5
    ) {
      return true;
    }

    return false;
  });
}

const PUBLIC_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "icloud.com",
  "mail.com",
  "protonmail.com",
  "live.com",
  "msn.com",
]);

function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_DOMAINS.has(domain);
}

/* -------------------------------------------------------------------------- */
/*  Household creation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Create a household from a set of member records.
 */
export function createHouseholdFromMembers(
  members: CustomerRecord[],
): Omit<Household, "vehicles" | "lifetimeValue" | "opportunities"> {
  if (members.length === 0) throw new Error("Cannot create household with no members");

  const familyName = members[0].lastName;
  const now = new Date().toISOString();

  return {
    id: `hh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    familyName,
    members: members.map((m, i) => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      phone: m.phone,
      role: (i === 0 ? "primary" : "spouse") as HouseholdMember["role"],
      address: m.address,
      zip: m.zip,
      joinedAt: now,
    })),
    createdAt: now,
  };
}

/* -------------------------------------------------------------------------- */
/*  Lifetime value                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Calculate lifetime value for a household from vehicle and service data.
 */
export function calculateLifetimeValue(
  vehicles: HouseholdVehicle[],
  fiRevenue: number,
  serviceRevenue: number,
  memberCount: number,
): HouseholdLifetimeValue {
  const totalVehiclePurchases = vehicles.reduce(
    (sum, v) => sum + v.purchasePrice,
    0,
  );

  const dates = vehicles
    .map((v) => new Date(v.purchaseDate).getTime())
    .filter((t) => !isNaN(t));

  return {
    totalVehiclePurchases,
    totalFiRevenue: fiRevenue,
    totalServiceRevenue: serviceRevenue,
    totalRevenue: totalVehiclePurchases + fiRevenue + serviceRevenue,
    memberCount,
    vehicleCount: vehicles.length,
    firstPurchaseDate: dates.length
      ? new Date(Math.min(...dates)).toISOString()
      : new Date().toISOString(),
    latestActivityDate: dates.length
      ? new Date(Math.max(...dates)).toISOString()
      : new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/*  Vehicle listing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Separate vehicles into current and historical.
 */
export function getHouseholdVehicles(vehicles: HouseholdVehicle[]): {
  current: HouseholdVehicle[];
  historical: HouseholdVehicle[];
} {
  return {
    current: vehicles.filter((v) => v.status === "current"),
    historical: vehicles.filter((v) => v.status !== "current"),
  };
}

/* -------------------------------------------------------------------------- */
/*  Opportunity identification                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Identify sales and service opportunities within a household.
 */
export function identifyHouseholdOpportunities(
  members: HouseholdMember[],
  vehicles: HouseholdVehicle[],
  serviceHistory: { memberId: string; lastServiceDate?: string }[],
): HouseholdOpportunity[] {
  const opportunities: HouseholdOpportunity[] = [];
  const currentYear = new Date().getFullYear();

  // Aging vehicles due for replacement (6+ years old)
  for (const v of vehicles) {
    if (v.status !== "current") continue;
    const age = currentYear - v.year;
    if (age >= 6) {
      const owner = members.find((m) => m.id === v.ownerId);
      opportunities.push({
        type: "aging_vehicle",
        description: `${v.year} ${v.make} ${v.model} is ${age} years old — due for replacement`,
        memberId: v.ownerId,
        memberName: owner ? `${owner.firstName} ${owner.lastName}` : "Unknown",
        priority: age >= 8 ? "high" : "medium",
      });
    }
  }

  // Members without service history
  const serviceByMember = new Set(serviceHistory.map((s) => s.memberId));
  for (const m of members) {
    if (!serviceByMember.has(m.id)) {
      const hasVehicle = vehicles.some(
        (v) => v.ownerId === m.id && v.status === "current",
      );
      if (hasVehicle) {
        opportunities.push({
          type: "missing_service",
          description: `No service history for ${m.firstName} ${m.lastName}`,
          memberId: m.id,
          memberName: `${m.firstName} ${m.lastName}`,
          priority: "medium",
        });
      }
    }
  }

  return opportunities;
}

/* -------------------------------------------------------------------------- */
/*  Full household profile (DB or demo)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Get a full household profile by ID.
 * In shadow mode, returns demo data.
 */
export async function getHouseholdProfile(
  householdId: string,
  dealerId: string,
): Promise<Household | null> {
  trackHousehold("household.profile_viewed", dealerId, { householdId });

  // Shadow mode — return demo data
  if (!process.env.DATABASE_URL) {
    const demo = DEMO_HOUSEHOLDS.find((h) => h.id === householdId);
    return demo ?? null;
  }

  const { query } = await import("@/lib/db");
  const result = await query(
    `SELECT * FROM households WHERE id = $1 AND dealer_id = $2`,
    [householdId, dealerId],
  );

  if (result.rows.length === 0) return null;

  // In production, assemble from joined tables
  return result.rows[0] as unknown as Household;
}

/* -------------------------------------------------------------------------- */
/*  Demo data                                                                  */
/* -------------------------------------------------------------------------- */

export const DEMO_HOUSEHOLDS: Household[] = [
  {
    id: "hh-001",
    familyName: "Johnson",
    members: [
      {
        id: "cust-001",
        firstName: "Robert",
        lastName: "Johnson",
        email: "robert.johnson@johnsonfamily.com",
        phone: "(555) 123-4567",
        role: "primary",
        address: "123 Oak Street",
        zip: "75201",
        joinedAt: "2019-03-15T00:00:00Z",
      },
      {
        id: "cust-002",
        firstName: "Sarah",
        lastName: "Johnson",
        email: "sarah.johnson@johnsonfamily.com",
        phone: "(555) 123-4568",
        role: "spouse",
        address: "123 Oak Street",
        zip: "75201",
        joinedAt: "2020-06-20T00:00:00Z",
      },
      {
        id: "cust-003",
        firstName: "Michael",
        lastName: "Johnson",
        email: "michael.j@gmail.com",
        phone: "(555) 123-4569",
        role: "child",
        address: "123 Oak Street",
        zip: "75201",
        joinedAt: "2023-09-01T00:00:00Z",
      },
    ],
    vehicles: [
      {
        id: "veh-001",
        ownerId: "cust-001",
        year: 2023,
        make: "Ford",
        model: "F-150 Lariat",
        vin: "1FTFW1E87NFA12345",
        status: "current",
        purchaseDate: "2023-01-15T00:00:00Z",
        purchasePrice: 58900,
      },
      {
        id: "veh-002",
        ownerId: "cust-002",
        year: 2024,
        make: "Toyota",
        model: "Highlander XLE",
        vin: "5TDKK5EH3RS123456",
        status: "current",
        purchaseDate: "2024-03-20T00:00:00Z",
        purchasePrice: 44500,
      },
      {
        id: "veh-003",
        ownerId: "cust-003",
        year: 2018,
        make: "Honda",
        model: "Civic EX",
        vin: "2HGFC2F59JH567890",
        status: "current",
        purchaseDate: "2023-09-01T00:00:00Z",
        purchasePrice: 18200,
      },
      {
        id: "veh-004",
        ownerId: "cust-001",
        year: 2019,
        make: "Ford",
        model: "Explorer XLT",
        vin: "1FM5K8D85KGA98765",
        status: "traded",
        purchaseDate: "2019-03-15T00:00:00Z",
        saleDate: "2023-01-15T00:00:00Z",
        purchasePrice: 42300,
      },
    ],
    lifetimeValue: {
      totalVehiclePurchases: 163900,
      totalFiRevenue: 12400,
      totalServiceRevenue: 8750,
      totalRevenue: 185050,
      memberCount: 3,
      vehicleCount: 4,
      firstPurchaseDate: "2019-03-15T00:00:00Z",
      latestActivityDate: "2024-03-20T00:00:00Z",
    },
    opportunities: [
      {
        type: "aging_vehicle",
        description:
          "2018 Honda Civic EX is 8 years old — due for replacement",
        memberId: "cust-003",
        memberName: "Michael Johnson",
        priority: "high",
      },
      {
        type: "missing_service",
        description: "No service history for Michael Johnson",
        memberId: "cust-003",
        memberName: "Michael Johnson",
        priority: "medium",
      },
    ],
    createdAt: "2023-09-15T00:00:00Z",
  },
  {
    id: "hh-002",
    familyName: "Martinez",
    members: [
      {
        id: "cust-010",
        firstName: "Carlos",
        lastName: "Martinez",
        email: "carlos@martinez-consulting.com",
        phone: "(555) 987-6543",
        role: "primary",
        address: "456 Elm Avenue",
        zip: "75202",
        joinedAt: "2021-05-10T00:00:00Z",
      },
      {
        id: "cust-011",
        firstName: "Maria",
        lastName: "Martinez",
        email: "maria@martinez-consulting.com",
        phone: "(555) 987-6544",
        role: "spouse",
        address: "456 Elm Avenue",
        zip: "75202",
        joinedAt: "2022-02-14T00:00:00Z",
      },
    ],
    vehicles: [
      {
        id: "veh-010",
        ownerId: "cust-010",
        year: 2025,
        make: "BMW",
        model: "X5 xDrive40i",
        vin: "5UXCR6C09R9A11111",
        status: "current",
        purchaseDate: "2025-01-10T00:00:00Z",
        purchasePrice: 67800,
      },
      {
        id: "veh-011",
        ownerId: "cust-011",
        year: 2024,
        make: "Mercedes-Benz",
        model: "GLC 300",
        vin: "W1N0J8DB5RF222222",
        status: "current",
        purchaseDate: "2024-06-15T00:00:00Z",
        purchasePrice: 52400,
      },
    ],
    lifetimeValue: {
      totalVehiclePurchases: 120200,
      totalFiRevenue: 9800,
      totalServiceRevenue: 4200,
      totalRevenue: 134200,
      memberCount: 2,
      vehicleCount: 2,
      firstPurchaseDate: "2024-06-15T00:00:00Z",
      latestActivityDate: "2025-01-10T00:00:00Z",
    },
    opportunities: [],
    createdAt: "2024-06-20T00:00:00Z",
  },
  {
    id: "hh-003",
    familyName: "Williams",
    members: [
      {
        id: "cust-020",
        firstName: "David",
        lastName: "Williams",
        email: "david.williams@email.com",
        phone: "(555) 555-1234",
        role: "primary",
        address: "789 Pine Road",
        zip: "75203",
        joinedAt: "2020-11-22T00:00:00Z",
      },
      {
        id: "cust-021",
        firstName: "Lisa",
        lastName: "Williams",
        email: "lisa.williams@email.com",
        phone: "(555) 555-1235",
        role: "spouse",
        address: "789 Pine Road",
        zip: "75203",
        joinedAt: "2021-08-05T00:00:00Z",
      },
      {
        id: "cust-022",
        firstName: "Emma",
        lastName: "Williams",
        email: "emma.w@college.edu",
        phone: "(555) 555-1236",
        role: "child",
        address: "789 Pine Road",
        zip: "75203",
        joinedAt: "2024-08-15T00:00:00Z",
      },
      {
        id: "cust-023",
        firstName: "Jake",
        lastName: "Williams",
        email: "jake.w@college.edu",
        phone: "(555) 555-1237",
        role: "child",
        address: "789 Pine Road",
        zip: "75203",
        joinedAt: "2025-01-20T00:00:00Z",
      },
    ],
    vehicles: [
      {
        id: "veh-020",
        ownerId: "cust-020",
        year: 2024,
        make: "Chevrolet",
        model: "Tahoe Z71",
        vin: "1GNSKBKD3RR333333",
        status: "current",
        purchaseDate: "2024-02-28T00:00:00Z",
        purchasePrice: 62500,
      },
      {
        id: "veh-021",
        ownerId: "cust-021",
        year: 2023,
        make: "Lexus",
        model: "RX 350",
        vin: "2T2HZMDA8PC444444",
        status: "current",
        purchaseDate: "2023-04-12T00:00:00Z",
        purchasePrice: 51200,
      },
      {
        id: "veh-022",
        ownerId: "cust-022",
        year: 2019,
        make: "Toyota",
        model: "Corolla LE",
        vin: "JTDEPRAE5LJ555555",
        status: "current",
        purchaseDate: "2024-08-15T00:00:00Z",
        purchasePrice: 16800,
      },
      {
        id: "veh-023",
        ownerId: "cust-023",
        year: 2020,
        make: "Honda",
        model: "Accord Sport",
        vin: "1HGCV1F34LA666666",
        status: "current",
        purchaseDate: "2025-01-20T00:00:00Z",
        purchasePrice: 22100,
      },
      {
        id: "veh-024",
        ownerId: "cust-020",
        year: 2020,
        make: "Chevrolet",
        model: "Suburban LT",
        vin: "1GNSKCKD3LR777777",
        status: "traded",
        purchaseDate: "2020-11-22T00:00:00Z",
        saleDate: "2024-02-28T00:00:00Z",
        purchasePrice: 55800,
      },
    ],
    lifetimeValue: {
      totalVehiclePurchases: 208400,
      totalFiRevenue: 18200,
      totalServiceRevenue: 14300,
      totalRevenue: 240900,
      memberCount: 4,
      vehicleCount: 5,
      firstPurchaseDate: "2020-11-22T00:00:00Z",
      latestActivityDate: "2025-01-20T00:00:00Z",
    },
    opportunities: [
      {
        type: "aging_vehicle",
        description:
          "2019 Toyota Corolla LE is 7 years old — due for replacement",
        memberId: "cust-022",
        memberName: "Emma Williams",
        priority: "medium",
      },
      {
        type: "aging_vehicle",
        description:
          "2020 Honda Accord Sport is 6 years old — due for replacement",
        memberId: "cust-023",
        memberName: "Jake Williams",
        priority: "medium",
      },
      {
        type: "missing_service",
        description: "No service history for Jake Williams",
        memberId: "cust-023",
        memberName: "Jake Williams",
        priority: "medium",
      },
    ],
    createdAt: "2024-08-20T00:00:00Z",
  },
];
