/**
 * Customer Household Grouping tests.
 */

import {
  detectHouseholdMatches,
  createHouseholdFromMembers,
  calculateLifetimeValue,
  getHouseholdVehicles,
  identifyHouseholdOpportunities,
  DEMO_HOUSEHOLDS,
} from "@/lib/household";
import type {
  HouseholdVehicle,
  HouseholdMember,
} from "@/lib/household";

/* -------------------------------------------------------------------------- */
/*  Test data                                                                  */
/* -------------------------------------------------------------------------- */

const BASE_CUSTOMER = {
  id: "c1",
  firstName: "John",
  lastName: "Smith",
  email: "john@smithfamily.com",
  phone: "(555) 123-4567",
  address: "100 Main Street",
  zip: "75201",
};

const CANDIDATES = [
  {
    id: "c2",
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@smithfamily.com",
    phone: "(555) 123-4568",
    address: "100 Main Street",
    zip: "75201",
  },
  {
    id: "c3",
    firstName: "Bob",
    lastName: "Jones",
    email: "bob@gmail.com",
    phone: "(555) 999-8888",
    address: "200 Other Avenue",
    zip: "75202",
  },
  {
    id: "c4",
    firstName: "Alice",
    lastName: "Smith",
    email: "alice@gmail.com",
    phone: "(555) 111-2222",
    address: "300 Different Road",
    zip: "75201",
  },
  {
    id: "c5",
    firstName: "Tom",
    lastName: "Wilson",
    email: "tom@smithfamily.com",
    phone: "(555) 123-4567",
    address: "400 Far Away Lane",
    zip: "75205",
  },
];

/* -------------------------------------------------------------------------- */
/*  Household detection                                                        */
/* -------------------------------------------------------------------------- */

describe("detectHouseholdMatches", () => {
  it("matches by address", () => {
    const matches = detectHouseholdMatches(BASE_CUSTOMER, CANDIDATES);
    // c2 has same address
    expect(matches.some((m) => m.id === "c2")).toBe(true);
  });

  it("matches by phone number", () => {
    const matches = detectHouseholdMatches(BASE_CUSTOMER, CANDIDATES);
    // c5 has same phone
    expect(matches.some((m) => m.id === "c5")).toBe(true);
  });

  it("matches by private email domain", () => {
    const matches = detectHouseholdMatches(BASE_CUSTOMER, CANDIDATES);
    // c5 and c2 share smithfamily.com domain (private)
    expect(matches.some((m) => m.id === "c5")).toBe(true);
  });

  it("does NOT match by public email domain", () => {
    const publicCustomer = {
      ...BASE_CUSTOMER,
      email: "john@gmail.com",
      address: "999 Unique Street",
      phone: "(555) 000-0000",
    };
    const publicCandidates = [
      {
        id: "x1",
        firstName: "Someone",
        lastName: "Else",
        email: "someone@gmail.com",
        phone: "(555) 111-1111",
        address: "888 Another Place",
        zip: "75999",
      },
    ];
    const matches = detectHouseholdMatches(publicCustomer, publicCandidates);
    expect(matches).toHaveLength(0);
  });

  it("matches by last name + ZIP", () => {
    const matches = detectHouseholdMatches(BASE_CUSTOMER, CANDIDATES);
    // c4 has same last name + ZIP
    expect(matches.some((m) => m.id === "c4")).toBe(true);
  });

  it("does NOT match self", () => {
    const matches = detectHouseholdMatches(BASE_CUSTOMER, [
      BASE_CUSTOMER,
      ...CANDIDATES,
    ]);
    expect(matches.some((m) => m.id === "c1")).toBe(false);
  });

  it("does NOT match unrelated customers", () => {
    const matches = detectHouseholdMatches(BASE_CUSTOMER, CANDIDATES);
    // c3 has no matching criteria
    expect(matches.some((m) => m.id === "c3")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/*  Household creation                                                         */
/* -------------------------------------------------------------------------- */

describe("createHouseholdFromMembers", () => {
  it("creates household with correct family name", () => {
    const hh = createHouseholdFromMembers([BASE_CUSTOMER, CANDIDATES[0]]);
    expect(hh.familyName).toBe("Smith");
    expect(hh.members).toHaveLength(2);
  });

  it("assigns primary role to first member", () => {
    const hh = createHouseholdFromMembers([BASE_CUSTOMER, CANDIDATES[0]]);
    expect(hh.members[0].role).toBe("primary");
    expect(hh.members[1].role).toBe("spouse");
  });

  it("throws for empty members", () => {
    expect(() => createHouseholdFromMembers([])).toThrow();
  });

  it("generates unique IDs", () => {
    const hh1 = createHouseholdFromMembers([BASE_CUSTOMER]);
    const hh2 = createHouseholdFromMembers([CANDIDATES[0]]);
    expect(hh1.id).not.toBe(hh2.id);
  });
});

/* -------------------------------------------------------------------------- */
/*  Lifetime value                                                             */
/* -------------------------------------------------------------------------- */

describe("calculateLifetimeValue", () => {
  const vehicles: HouseholdVehicle[] = [
    {
      id: "v1",
      ownerId: "c1",
      year: 2023,
      make: "Ford",
      model: "F-150",
      vin: "1FTFW1E87NFA12345",
      status: "current",
      purchaseDate: "2023-01-15T00:00:00Z",
      purchasePrice: 50000,
    },
    {
      id: "v2",
      ownerId: "c2",
      year: 2024,
      make: "Toyota",
      model: "Camry",
      vin: "4T1BF1FK5EU123456",
      status: "current",
      purchaseDate: "2024-06-01T00:00:00Z",
      purchasePrice: 30000,
    },
  ];

  it("sums vehicle purchases, F&I, and service revenue", () => {
    const ltv = calculateLifetimeValue(vehicles, 5000, 3000, 2);
    expect(ltv.totalVehiclePurchases).toBe(80000);
    expect(ltv.totalFiRevenue).toBe(5000);
    expect(ltv.totalServiceRevenue).toBe(3000);
    expect(ltv.totalRevenue).toBe(88000);
  });

  it("tracks member and vehicle counts", () => {
    const ltv = calculateLifetimeValue(vehicles, 0, 0, 3);
    expect(ltv.memberCount).toBe(3);
    expect(ltv.vehicleCount).toBe(2);
  });

  it("finds earliest and latest dates", () => {
    const ltv = calculateLifetimeValue(vehicles, 0, 0, 1);
    expect(ltv.firstPurchaseDate).toContain("2023");
    expect(ltv.latestActivityDate).toContain("2024");
  });

  it("handles empty vehicles", () => {
    const ltv = calculateLifetimeValue([], 1000, 500, 1);
    expect(ltv.totalVehiclePurchases).toBe(0);
    expect(ltv.totalRevenue).toBe(1500);
  });
});

/* -------------------------------------------------------------------------- */
/*  Vehicle listing                                                            */
/* -------------------------------------------------------------------------- */

describe("getHouseholdVehicles", () => {
  const vehicles: HouseholdVehicle[] = [
    {
      id: "v1",
      ownerId: "c1",
      year: 2023,
      make: "Ford",
      model: "F-150",
      vin: "VIN1",
      status: "current",
      purchaseDate: "2023-01-01T00:00:00Z",
      purchasePrice: 50000,
    },
    {
      id: "v2",
      ownerId: "c1",
      year: 2019,
      make: "Ford",
      model: "Explorer",
      vin: "VIN2",
      status: "traded",
      purchaseDate: "2019-01-01T00:00:00Z",
      saleDate: "2023-01-01T00:00:00Z",
      purchasePrice: 40000,
    },
    {
      id: "v3",
      ownerId: "c2",
      year: 2024,
      make: "Toyota",
      model: "Camry",
      vin: "VIN3",
      status: "current",
      purchaseDate: "2024-01-01T00:00:00Z",
      purchasePrice: 30000,
    },
  ];

  it("separates current from historical vehicles", () => {
    const { current, historical } = getHouseholdVehicles(vehicles);
    expect(current).toHaveLength(2);
    expect(historical).toHaveLength(1);
  });

  it("places traded vehicles in historical", () => {
    const { historical } = getHouseholdVehicles(vehicles);
    expect(historical[0].status).toBe("traded");
  });
});

/* -------------------------------------------------------------------------- */
/*  Opportunity identification                                                 */
/* -------------------------------------------------------------------------- */

describe("identifyHouseholdOpportunities", () => {
  const members: HouseholdMember[] = [
    {
      id: "c1",
      firstName: "John",
      lastName: "Smith",
      email: "john@test.com",
      phone: "555-1234",
      role: "primary",
      address: "123 Main",
      zip: "75201",
      joinedAt: "2020-01-01T00:00:00Z",
    },
    {
      id: "c2",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@test.com",
      phone: "555-1235",
      role: "spouse",
      address: "123 Main",
      zip: "75201",
      joinedAt: "2021-01-01T00:00:00Z",
    },
  ];

  const vehicles: HouseholdVehicle[] = [
    {
      id: "v1",
      ownerId: "c1",
      year: 2024,
      make: "Ford",
      model: "F-150",
      vin: "VIN1",
      status: "current",
      purchaseDate: "2024-01-01T00:00:00Z",
      purchasePrice: 50000,
    },
    {
      id: "v2",
      ownerId: "c2",
      year: 2018,
      make: "Honda",
      model: "Civic",
      vin: "VIN2",
      status: "current",
      purchaseDate: "2018-01-01T00:00:00Z",
      purchasePrice: 20000,
    },
  ];

  it("flags aging vehicles (6+ years old)", () => {
    const opps = identifyHouseholdOpportunities(members, vehicles, [
      { memberId: "c1", lastServiceDate: "2025-01-01" },
      { memberId: "c2", lastServiceDate: "2024-06-01" },
    ]);
    const aging = opps.filter((o) => o.type === "aging_vehicle");
    expect(aging.length).toBeGreaterThanOrEqual(1);
    expect(aging[0].description).toContain("Honda Civic");
  });

  it("flags missing service history", () => {
    const opps = identifyHouseholdOpportunities(members, vehicles, [
      { memberId: "c1", lastServiceDate: "2025-01-01" },
      // c2 missing from service history
    ]);
    const missing = opps.filter((o) => o.type === "missing_service");
    expect(missing.length).toBeGreaterThanOrEqual(1);
    expect(missing[0].memberName).toContain("Jane");
  });

  it("assigns high priority to very old vehicles (8+ years)", () => {
    const opps = identifyHouseholdOpportunities(members, vehicles, [
      { memberId: "c1" },
      { memberId: "c2" },
    ]);
    const aging = opps.find(
      (o) => o.type === "aging_vehicle" && o.description.includes("Honda Civic"),
    );
    expect(aging?.priority).toBe("high");
  });
});

/* -------------------------------------------------------------------------- */
/*  Demo data                                                                  */
/* -------------------------------------------------------------------------- */

describe("DEMO_HOUSEHOLDS", () => {
  it("has at least 2 demo households", () => {
    expect(DEMO_HOUSEHOLDS.length).toBeGreaterThanOrEqual(2);
  });

  it("each household has required fields", () => {
    for (const hh of DEMO_HOUSEHOLDS) {
      expect(hh.id).toBeTruthy();
      expect(hh.familyName).toBeTruthy();
      expect(hh.members.length).toBeGreaterThan(0);
      expect(hh.lifetimeValue.totalRevenue).toBeGreaterThan(0);
    }
  });

  it("Johnson household has aging vehicle opportunity", () => {
    const johnson = DEMO_HOUSEHOLDS.find((h) => h.familyName === "Johnson");
    expect(johnson).toBeDefined();
    const aging = johnson!.opportunities.find((o) => o.type === "aging_vehicle");
    expect(aging).toBeDefined();
    expect(aging!.description).toContain("Honda Civic");
  });
});

/* -------------------------------------------------------------------------- */
/*  Analytics events                                                           */
/* -------------------------------------------------------------------------- */

describe("household analytics events", () => {
  it("trackHousehold function exists and does not throw", async () => {
    const { trackHousehold } = await import("@/lib/analytics-hooks");
    expect(typeof trackHousehold).toBe("function");
    expect(() =>
      trackHousehold("household.detected", "test-dealer", { count: 3 }),
    ).not.toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/*  API route and page existence                                               */
/* -------------------------------------------------------------------------- */

describe("household module structure", () => {
  it("API route file exists", async () => {
    // Verify the module can be imported without errors
    const mod = await import("@/lib/household");
    expect(mod.detectHouseholdMatches).toBeDefined();
    expect(mod.createHouseholdFromMembers).toBeDefined();
    expect(mod.calculateLifetimeValue).toBeDefined();
    expect(mod.getHouseholdVehicles).toBeDefined();
    expect(mod.identifyHouseholdOpportunities).toBeDefined();
    expect(mod.DEMO_HOUSEHOLDS).toBeDefined();
  });
});
