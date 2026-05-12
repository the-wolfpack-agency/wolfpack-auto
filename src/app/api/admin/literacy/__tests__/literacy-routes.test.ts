/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for the /api/admin/literacy/* routes.
 *
 * Each route is covered for:
 *   - 200/201 happy path (wolfpack staff)
 *   - 401 anonymous + dealer session (NOT staff)
 *   - 403 wrong role on mutating endpoints (viewer trying to POST)
 *   - 400 validation errors (missing body, bad enum, bad uuid)
 */

const mockGetServerSession = jest.fn();
const mockQuery = jest.fn();
const mockExecuteNeo4j = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...a: any[]) => mockGetServerSession(...a),
}));
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
  pool: { connect: jest.fn(), query: jest.fn(), end: jest.fn() },
}));
jest.mock("@/lib/neo4j-client", () => ({
  executeNeo4jQueries: (...a: any[]) => mockExecuteNeo4j(...a),
  neo4jHealthCheck: jest.fn(),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackSecurity: jest.fn(),
  trackLiteracy: jest.fn(),
  trackSystem: jest.fn(),
}));
jest.mock("@/lib/wolfpack-staff-audit", () => ({
  logStaffAction: jest.fn().mockResolvedValue(1),
}));

import { NextRequest } from "next/server";

beforeEach(() => {
  mockGetServerSession.mockReset();
  mockQuery.mockReset();
  mockExecuteNeo4j.mockReset();
  mockExecuteNeo4j.mockResolvedValue({ executed: 1, failed: 0 });
  process.env.DATABASE_URL = "postgres://test";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

function staffSession(role: "admin" | "operator" | "viewer" = "operator") {
  return {
    user: {
      id: "staff-1",
      email: "ops@thewolfpack.agency",
      name: "Ops User",
      dealer_id: "wolfpack-staff",
      role: "wolfpack_admin",
    },
    kind: "wolfpack_staff",
    staff_id: "staff-1",
    staff_role: role,
  };
}

function dealerSession() {
  return {
    user: { id: "u", email: "u@d.com", name: "U", dealer_id: "d1", role: "admin" },
    kind: "dealer",
  };
}

function req(url: string, init?: { method?: string; body?: string }): NextRequest {
  return new NextRequest(
    `https://x.test${url}`,
    init as ConstructorParameters<typeof NextRequest>[1],
  );
}

const UUID_A = "11111111-1111-1111-1111-1111111111aa";
const UUID_B = "22222222-2222-2222-2222-2222222222bb";

// ---------------------------------------------------------------------------
// /api/admin/literacy/concepts
// ---------------------------------------------------------------------------
describe("GET /api/admin/literacy/concepts", () => {
  test("401 anonymous", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../concepts/route");
    const res = await GET(req("/api/admin/literacy/concepts"));
    expect(res.status).toBe(401);
  });

  test("401 dealer session (not staff)", async () => {
    mockGetServerSession.mockResolvedValue(dealerSession());
    const { GET } = await import("../concepts/route");
    const res = await GET(req("/api/admin/literacy/concepts"));
    expect(res.status).toBe(401);
  });

  test("200 + concepts list for staff", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("viewer"));
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: UUID_A,
          slug: "vdp",
          name: "VDP",
          domain: "digital",
          surface: "website",
          description: "",
          created_at: "",
          updated_at: "",
        },
      ],
    });
    const { GET } = await import("../concepts/route");
    const res = await GET(req("/api/admin/literacy/concepts"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.concepts).toHaveLength(1);
  });
});

describe("POST /api/admin/literacy/concepts", () => {
  test("403 viewer (operator+ required)", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("viewer"));
    const { POST } = await import("../concepts/route");
    const res = await POST(
      req("/api/admin/literacy/concepts", {
        method: "POST",
        body: JSON.stringify({ slug: "vdp", name: "VDP", domain: "digital" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  test("400 when body is missing required fields", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { POST } = await import("../concepts/route");
    const res = await POST(
      req("/api/admin/literacy/concepts", {
        method: "POST",
        body: JSON.stringify({ slug: "vdp" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("400 invalid JSON", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { POST } = await import("../concepts/route");
    const res = await POST(
      req("/api/admin/literacy/concepts", { method: "POST", body: "not-json" }),
    );
    expect(res.status).toBe(400);
  });

  test("400 invalid domain enum", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { POST } = await import("../concepts/route");
    const res = await POST(
      req("/api/admin/literacy/concepts", {
        method: "POST",
        body: JSON.stringify({ slug: "vdp", name: "VDP", domain: "outerspace" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("201 happy path — calls trackLiteracy + audit log", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // dupe check
      .mockResolvedValueOnce({
        rows: [
          {
            id: UUID_A,
            slug: "vdp",
            name: "VDP",
            domain: "digital",
            surface: "website",
            description: "",
            created_at: "",
            updated_at: "",
          },
        ],
      });
    const { POST } = await import("../concepts/route");
    const res = await POST(
      req("/api/admin/literacy/concepts", {
        method: "POST",
        body: JSON.stringify({ slug: "vdp", name: "VDP", domain: "digital" }),
      }),
    );
    expect(res.status).toBe(201);
    const analytics = await import("@/lib/analytics-hooks");
    expect((analytics.trackLiteracy as jest.Mock)).toHaveBeenCalledWith(
      "literacy.concept_created",
      "wolfpack-ontology",
      expect.objectContaining({ slug: "vdp" }),
    );
    const audit = await import("@/lib/wolfpack-staff-audit");
    expect((audit.logStaffAction as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "literacy.concept_created" }),
    );
  });
});

// ---------------------------------------------------------------------------
// /api/admin/literacy/concepts/[id] PATCH / DELETE
// ---------------------------------------------------------------------------
describe("PATCH /api/admin/literacy/concepts/[id]", () => {
  test("400 invalid uuid", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { PATCH } = await import("../concepts/[id]/route");
    const res = await PATCH(req("/x", { method: "PATCH", body: "{}" }), {
      params: Promise.resolve({ id: "bogus" }),
    });
    expect(res.status).toBe(400);
  });

  test("404 not found", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { PATCH } = await import("../concepts/[id]/route");
    const res = await PATCH(
      req("/x", { method: "PATCH", body: JSON.stringify({ name: "X" }) }),
      { params: Promise.resolve({ id: UUID_A }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/literacy/concepts/[id]", () => {
  test("403 operator (admin required)", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { DELETE } = await import("../concepts/[id]/route");
    const res = await DELETE(req("/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: UUID_A }),
    });
    expect(res.status).toBe(403);
  });

  test("200 happy path (admin)", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("admin"));
    mockQuery.mockResolvedValueOnce({ rows: [{ id: UUID_A }] });
    const { DELETE } = await import("../concepts/[id]/route");
    const res = await DELETE(req("/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: UUID_A }),
    });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// /api/admin/literacy/mappings
// ---------------------------------------------------------------------------
describe("POST /api/admin/literacy/mappings", () => {
  test("401 anonymous", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../mappings/route");
    const res = await POST(
      req("/api/admin/literacy/mappings", {
        method: "POST",
        body: JSON.stringify({
          source_concept_id: UUID_A,
          target_concept_id: UUID_B,
          relation: "equivalent_to",
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("400 missing fields", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { POST } = await import("../mappings/route");
    const res = await POST(
      req("/api/admin/literacy/mappings", {
        method: "POST",
        body: JSON.stringify({ source_concept_id: UUID_A }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("400 invalid relation enum", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { POST } = await import("../mappings/route");
    const res = await POST(
      req("/api/admin/literacy/mappings", {
        method: "POST",
        body: JSON.stringify({
          source_concept_id: UUID_A,
          target_concept_id: UUID_B,
          relation: "magic",
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("201 success", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          source_concept_id: UUID_A,
          target_concept_id: UUID_B,
          relation: "equivalent_to",
          confidence: 1,
          source: "curated",
          created_at: "",
        },
      ],
    });
    const { POST } = await import("../mappings/route");
    const res = await POST(
      req("/api/admin/literacy/mappings", {
        method: "POST",
        body: JSON.stringify({
          source_concept_id: UUID_A,
          target_concept_id: UUID_B,
          relation: "equivalent_to",
        }),
      }),
    );
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// /api/admin/literacy/metrics
// ---------------------------------------------------------------------------
describe("POST /api/admin/literacy/metrics", () => {
  test("403 viewer", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("viewer"));
    const { POST } = await import("../metrics/route");
    const res = await POST(
      req("/x", {
        method: "POST",
        body: JSON.stringify({ slug: "x", name: "x" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  test("400 missing slug", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { POST } = await import("../metrics/route");
    const res = await POST(
      req("/x", {
        method: "POST",
        body: JSON.stringify({ name: "x" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("201 success", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "m1",
            slug: "x",
            name: "X",
            concept_id: null,
            unit: null,
            good_direction: null,
            description: null,
            created_at: "",
          },
        ],
      });
    const { POST } = await import("../metrics/route");
    const res = await POST(
      req("/x", {
        method: "POST",
        body: JSON.stringify({ slug: "x", name: "X" }),
      }),
    );
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// /api/admin/literacy/translations
// ---------------------------------------------------------------------------
describe("POST /api/admin/literacy/translations", () => {
  test("400 missing template", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { POST } = await import("../translations/route");
    const res = await POST(
      req("/x", {
        method: "POST",
        body: JSON.stringify({ metric_id: UUID_A, role: "salesperson" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("400 bad role enum", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { POST } = await import("../translations/route");
    const res = await POST(
      req("/x", {
        method: "POST",
        body: JSON.stringify({
          metric_id: UUID_A,
          role: "ceo",
          template: "x",
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("201 success", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "t1",
          metric_id: UUID_A,
          role: "salesperson",
          context: null,
          template: "x",
          source: "curated",
          quality_score: 0.5,
          created_at: "",
        },
      ],
    });
    const { POST } = await import("../translations/route");
    const res = await POST(
      req("/x", {
        method: "POST",
        body: JSON.stringify({
          metric_id: UUID_A,
          role: "salesperson",
          template: "x",
        }),
      }),
    );
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// /api/admin/literacy/actions
// ---------------------------------------------------------------------------
describe("POST /api/admin/literacy/actions", () => {
  test("400 missing required field", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { POST } = await import("../actions/route");
    const res = await POST(
      req("/x", {
        method: "POST",
        body: JSON.stringify({ metric_id: UUID_A, role: "fi_manager" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("400 invalid role (any not allowed for actions)", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { POST } = await import("../actions/route");
    const res = await POST(
      req("/x", {
        method: "POST",
        body: JSON.stringify({
          metric_id: UUID_A,
          role: "any",
          trigger_condition: "below_benchmark",
          recommendation_template: "do stuff",
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("201 success", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "a1",
          metric_id: UUID_A,
          trigger_condition: "below_benchmark",
          role: "fi_manager",
          recommendation_template: "do stuff",
          expected_outcome: "",
          source: "curated",
          created_at: "",
        },
      ],
    });
    const { POST } = await import("../actions/route");
    const res = await POST(
      req("/x", {
        method: "POST",
        body: JSON.stringify({
          metric_id: UUID_A,
          role: "fi_manager",
          trigger_condition: "below_benchmark",
          recommendation_template: "do stuff",
        }),
      }),
    );
    expect(res.status).toBe(201);
  });
});
