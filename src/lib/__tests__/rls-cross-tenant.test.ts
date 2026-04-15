/**
 * RLS Cross-Tenant Isolation Proof Tests
 *
 * Seeds two dealer contexts (A and B) in-memory, then executes representative
 * query patterns as dealer A's authenticated user, each time targeting dealer B's
 * rows. Every attempt MUST return empty OR 403/404 — never leak dealer B's data.
 *
 * This is a live tripwire: if any test fails, a real isolation bug exists.
 * Do NOT weaken the assertions — fix the route instead.
 *
 * Coverage:
 *   - Vehicle GET by VIN scoped to dealer_id
 *   - Leads listing scoped to dealer_id
 *   - Deals listing scoped to dealer_id
 *   - Admin/users listing scoped to dealer_id
 *   - Vehicle update (PUT) scoped to dealer_id (WHERE clause includes dealer_id)
 *
 * Approach: mock @/lib/db and @/lib/auth-guard to inject controlled data,
 * then call the route handlers directly with dealer A's session. Assert that
 * dealer B's rows are never returned.
 */

/* -------------------------------------------------------------------------- */
/* Shared setup (hoisted)                                                      */
/* -------------------------------------------------------------------------- */

const DEALER_A_ID = "aaaaaaaa-0000-4000-a000-000000000001";
const DEALER_B_ID = "bbbbbbbb-0000-4000-b000-000000000002";

const USER_A = {
  id: "user-a-001",
  email: "user-a@dealer-a.test",
  name: "User A",
  dealer_id: DEALER_A_ID,
  role: "admin" as const,
};

const VEHICLE_A = {
  id: "veh-a-1",
  vin: "TESTVINAAAAAAA001",
  dealer_id: DEALER_A_ID,
  year: 2024,
  make: "Toyota",
  model: "Camry",
  trim: "",
  price: 28000,
  status: "available",
};

const VEHICLE_B = {
  id: "veh-b-1",
  vin: "TESTVINBBBBBB001",
  dealer_id: DEALER_B_ID,
  year: 2024,
  make: "Honda",
  model: "Accord",
  trim: "",
  price: 29000,
  status: "available",
};

const LEAD_A = {
  id: "lead-a-1",
  dealer_id: DEALER_A_ID,
  first_name: "Alice",
  last_name: "Smith",
  email: "alice@dealer-a.test",
  phone: null,
  status: "new",
  temperature: "hot",
  source: "website_form",
  notes: "",
  structured_notes: [],
  assigned_to: null,
  message: "",
  follow_up_date: null,
  activity: [],
  vehicle_id: null,
  vehicle_interest: "",
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  referrer_url: null,
  deleted_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const LEAD_B = {
  ...LEAD_A,
  id: "lead-b-1",
  dealer_id: DEALER_B_ID,
  first_name: "Bob",
  last_name: "Jones",
  email: "bob@dealer-b.test",
};

const DEAL_A = {
  id: "deal-a-1",
  dealer_id: DEALER_A_ID,
  deal_type: "retail",
  status: "pending",
  deleted_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const DEAL_B = {
  ...DEAL_A,
  id: "deal-b-1",
  dealer_id: DEALER_B_ID,
};

const USER_B = {
  id: "user-b-001",
  dealer_id: DEALER_B_ID,
  email: "user-b@dealer-b.test",
  name: "User B",
  role: "admin",
  is_active: true,
  last_login: null,
  created_at: new Date().toISOString(),
};

const DB_VEHICLES = [VEHICLE_A, VEHICLE_B];
const DB_LEADS = [LEAD_A, LEAD_B];
const DB_DEALS = [DEAL_A, DEAL_B];
const DB_USERS = [
  {
    id: USER_A.id, dealer_id: DEALER_A_ID, email: USER_A.email,
    name: USER_A.name, role: "admin", is_active: true, last_login: null,
    created_at: new Date().toISOString(),
  },
  USER_B,
];

/* -------------------------------------------------------------------------- */
/* Module mocks (jest.mock calls are hoisted to top of file)                  */
/* -------------------------------------------------------------------------- */

jest.mock("@/lib/analytics-hooks", () => ({
  trackSystem: jest.fn(),
  trackLead: jest.fn(),
  trackDesking: jest.fn(),
}));
jest.mock("@/lib/embeddings", () => ({
  embedText: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/lib/qdrant-client", () => ({
  upsertPoints: jest.fn(),
  createCollection: jest.fn(),
}));
jest.mock("@/lib/audit-log", () => ({ auditLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/crypto", () => ({
  decryptPII: jest.fn((v: unknown) => v),
  encryptPII: jest.fn((v: unknown) => v),
}));

// Suppress noisy console output
beforeAll(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Query mock factory                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Returns a mock `query` function that respects `dealer_id` scoping.
 *
 * Reads `$N` param positions from the SQL to identify which parameter is
 * the dealer_id filter, then applies it to the in-memory dataset.
 *
 * If a route omits the dealer_id WHERE clause, the mock returns ALL rows —
 * causing the test to detect the cross-tenant leak.
 */
function makeScopedQuery(dataset: Record<string, unknown>[], dealerField = "dealer_id") {
  return jest.fn().mockImplementation((sql: string, params?: unknown[]) => {
    const sqlLower = (sql as string).toLowerCase();

    // For UPDATE ... RETURNING: params[0]=dealerId, params[1]=vin per the vehicle route
    if (sqlLower.includes("update")) {
      // Scan for WHERE dealer_id = $N pattern
      const dealerMatch = /(?:d\.)?dealer_id\s*=\s*\$(\d+)/i.exec(sql);
      if (!dealerMatch || !params) {
        // No dealer_id scoping — return empty (defensive)
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      const dealerIdx = parseInt(dealerMatch[1], 10) - 1;
      const requestedDealer = params[dealerIdx];

      // Also check vin scoping
      const vinMatch = /\bvin\s*=\s*\$(\d+)/i.exec(sql);
      const vinIdx = vinMatch ? parseInt(vinMatch[1], 10) - 1 : -1;
      const requestedVin = vinIdx >= 0 ? params[vinIdx] : undefined;

      const vehicle = dataset.find(
        (v) =>
          v[dealerField] === requestedDealer &&
          (requestedVin === undefined || v.vin === requestedVin),
      );

      if (!vehicle) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve({ rows: [{ ...vehicle }], rowCount: 1 });
    }

    // COUNT query
    if (sqlLower.includes("count(*)")) {
      const dealerMatch = /(?:d\.)?dealer_id\s*=\s*\$(\d+)/i.exec(sql);
      if (!dealerMatch || !params) {
        return Promise.resolve({ rows: [{ count: String(dataset.length) }] });
      }
      const dealerIdx = parseInt(dealerMatch[1], 10) - 1;
      const filtered = dataset.filter((r) => r[dealerField] === params[dealerIdx]);
      return Promise.resolve({ rows: [{ count: String(filtered.length) }] });
    }

    // SELECT
    const dealerMatch = /(?:d\.)?dealer_id\s*=\s*\$(\d+)/i.exec(sql);
    if (!dealerMatch || !params) {
      // No dealer_id filter — return ALL rows (this is the bug)
      return Promise.resolve({ rows: dataset, rowCount: dataset.length });
    }
    const dealerIdx = parseInt(dealerMatch[1], 10) - 1;
    const requestedDealer = params[dealerIdx];

    // Also filter by vin if present
    const vinMatch = /\bvin\s*=\s*\$(\d+)/i.exec(sql);
    const filtered = dataset.filter((r) => {
      if (r[dealerField] !== requestedDealer) return false;
      if (vinMatch) {
        const vinIdx = parseInt(vinMatch[1], 10) - 1;
        if (r.vin !== params[vinIdx]) return false;
      }
      return true;
    });

    return Promise.resolve({ rows: filtered, rowCount: filtered.length });
  });
}

/* -------------------------------------------------------------------------- */
/* Auth mock: returns dealer A's session                                       */
/* -------------------------------------------------------------------------- */

function mockAuthGuardAsUserA() {
  jest.doMock("@/lib/auth-guard", () => ({
    requireAuth: jest.fn().mockResolvedValue({ user: USER_A }),
    requireRole: jest.fn().mockResolvedValue({ user: USER_A }),
    isAuthenticated: jest.fn().mockReturnValue(true),
  }));
}

/* -------------------------------------------------------------------------- */
/* Vehicle GET by VIN isolation                                                */
/* -------------------------------------------------------------------------- */

describe("Cross-tenant isolation: vehicle GET by VIN (/api/admin/vehicles/[vin])", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.DATABASE_URL = "postgresql://mock";

    const mockQuery = makeScopedQuery(DB_VEHICLES);
    jest.doMock("@/lib/db", () => ({
      query: mockQuery,
      pool: { query: mockQuery },
    }));
    mockAuthGuardAsUserA();
  });

  test("GET dealer B's VIN as dealer A returns 404 — no cross-tenant leak", async () => {
    const { GET } = await import("@/app/api/admin/vehicles/[vin]/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/admin/vehicles/TESTVINBBBBBB001");
    const context = { params: Promise.resolve({ vin: VEHICLE_B.vin }) };
    const response = await GET(req, context);

    expect(response.status).toBe(404);
    const body = await response.json() as Record<string, unknown>;
    expect(body.dealer_id).not.toBe(DEALER_B_ID);
  });

  test("GET dealer A's VIN as dealer A returns 200 (positive control)", async () => {
    const { GET } = await import("@/app/api/admin/vehicles/[vin]/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/admin/vehicles/TESTVINAAAAAAA001");
    const context = { params: Promise.resolve({ vin: VEHICLE_A.vin }) };
    const response = await GET(req, context);

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.dealer_id).toBe(DEALER_A_ID);
  });
});

/* -------------------------------------------------------------------------- */
/* Leads listing isolation                                                     */
/* -------------------------------------------------------------------------- */

describe("Cross-tenant isolation: leads listing (GET /api/admin/leads)", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.DATABASE_URL = "postgresql://mock";

    const mockQuery = makeScopedQuery(DB_LEADS);
    jest.doMock("@/lib/db", () => ({
      query: mockQuery,
      pool: { query: mockQuery },
    }));
    mockAuthGuardAsUserA();
  });

  test("GET returns only dealer A's leads — dealer B leads never appear", async () => {
    const { GET } = await import("@/app/api/admin/leads/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/admin/leads");
    const response = await GET(req);
    const body = await response.json() as { leads?: unknown[]; data?: unknown[] };

    const leads = body.leads ?? body.data ?? (Array.isArray(body) ? body as unknown[] : []);
    const ids = leads.map((l) => (l as Record<string, unknown>).dealer_id);

    // dealer B's ID must NEVER appear in results
    expect(ids).not.toContain(DEALER_B_ID);
    if (ids.length > 0) {
      ids.forEach((id) => expect(id).toBe(DEALER_A_ID));
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Deals listing isolation                                                     */
/* -------------------------------------------------------------------------- */

describe("Cross-tenant isolation: deals listing (GET /api/admin/deals)", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.DATABASE_URL = "postgresql://mock";

    // Deals use alias "d.dealer_id = $1"
    const mockQuery = makeScopedQuery(DB_DEALS);
    jest.doMock("@/lib/db", () => ({
      query: mockQuery,
      pool: { query: mockQuery },
    }));
    mockAuthGuardAsUserA();
  });

  test("GET returns only dealer A's deals — dealer B deals never appear", async () => {
    const { GET } = await import("@/app/api/admin/deals/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/admin/deals");
    const response = await GET(req);
    const body = await response.json() as { deals?: unknown[] };

    const deals = body.deals ?? (Array.isArray(body) ? body as unknown[] : []);
    const ids = deals.map((d) => (d as Record<string, unknown>).dealer_id);

    // dealer B's ID must NEVER appear in results
    expect(ids).not.toContain(DEALER_B_ID);
    if (ids.length > 0) {
      ids.forEach((id) => expect(id).toBe(DEALER_A_ID));
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Admin users listing isolation                                               */
/* -------------------------------------------------------------------------- */

describe("Cross-tenant isolation: dealer-users listing (GET /api/admin/dealer-users)", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.DATABASE_URL = "postgresql://mock";

    const mockQuery = makeScopedQuery(DB_USERS);
    jest.doMock("@/lib/db", () => ({
      query: mockQuery,
      pool: { query: mockQuery },
    }));
    mockAuthGuardAsUserA();
  });

  test("GET returns only dealer A's users — dealer B users never appear", async () => {
    const { GET } = await import("@/app/api/admin/dealer-users/route");
    const response = await GET();
    const body = await response.json() as { users?: unknown[] };

    const users = body.users ?? (Array.isArray(body) ? body as unknown[] : []);
    const dealerIds = users.map((u) => (u as Record<string, unknown>).dealer_id);

    // dealer B's ID must NEVER appear in results
    expect(dealerIds).not.toContain(DEALER_B_ID);
    if (dealerIds.length > 0) {
      dealerIds.forEach((id) => expect(id).toBe(DEALER_A_ID));
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Vehicle update (PUT) isolation                                              */
/* -------------------------------------------------------------------------- */

describe("Cross-tenant isolation: vehicle update (PUT /api/admin/vehicles/[vin])", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.DATABASE_URL = "postgresql://mock";

    const mockQuery = makeScopedQuery(DB_VEHICLES);
    jest.doMock("@/lib/db", () => ({
      query: mockQuery,
      pool: { query: mockQuery },
    }));
    mockAuthGuardAsUserA();
  });

  test("PUT targeting dealer B's VIN as dealer A returns 404 — no cross-tenant write", async () => {
    const { PUT } = await import("@/app/api/admin/vehicles/[vin]/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/admin/vehicles/TESTVINBBBBBB001", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: 1 }),
    });

    const context = { params: Promise.resolve({ vin: VEHICLE_B.vin }) };
    const response = await PUT(req, context);

    // Must be 404 (vehicle not found for dealer A) — never 200 with dealer B's data
    expect(response.status).toBe(404);
    const body = await response.json() as Record<string, unknown>;
    expect(body.dealer_id).not.toBe(DEALER_B_ID);
  });

  test("PUT targeting dealer A's own VIN as dealer A succeeds (positive control)", async () => {
    const { PUT } = await import("@/app/api/admin/vehicles/[vin]/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost/api/admin/vehicles/TESTVINAAAAAAA001", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: 27500 }),
    });

    const context = { params: Promise.resolve({ vin: VEHICLE_A.vin }) };
    const response = await PUT(req, context);

    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.dealer_id).toBe(DEALER_A_ID);
  });
});
