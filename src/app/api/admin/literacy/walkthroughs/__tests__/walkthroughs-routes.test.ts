/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for /api/admin/literacy/walkthroughs/* and /tooltips/*.
 *
 * For each route we cover:
 *   - 200/201 happy path with a wolfpack-staff session
 *   - 401 anonymous + dealer session (NOT staff)
 *   - 403 viewer trying to mutate (operator+ required for write)
 *   - 400 validation errors (missing body, bad enum)
 *
 * Plus a single test for the public route
 * (/api/literacy/walkthrough/[concept_slug]) that asserts requireAuth gate.
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

function dealerSession(role: "owner" | "admin" | "manager" | "staff" = "admin") {
  return {
    user: {
      id: "u1",
      email: "u@d.com",
      name: "U",
      dealer_id: "11111111-2222-4333-8444-555555555555",
      role,
    },
    kind: "dealer",
  };
}

function req(
  url: string,
  init?: { method?: string; body?: string },
): NextRequest {
  return new NextRequest(
    `https://x.test${url}`,
    init as ConstructorParameters<typeof NextRequest>[1],
  );
}

const WALK_ID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const CONCEPT_ID = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const TIP_ID = "cccccccc-3333-4333-8333-cccccccccccc";

const validWalkthroughBody = {
  slug: "salesperson_dash_intro",
  name: "Salesperson intro",
  role: "salesperson",
  surface: "dashboard",
  trigger_condition: "first_visit",
  steps: [
    { selector: "[data-x]", template: "Welcome", position: "bottom" },
  ],
};

// ---------------------------------------------------------------------------
// /api/admin/literacy/walkthroughs (GET / POST)
// ---------------------------------------------------------------------------
describe("GET /api/admin/literacy/walkthroughs", () => {
  test("401 anonymous", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(req("/api/admin/literacy/walkthroughs"));
    expect(res.status).toBe(401);
  });

  test("401 dealer session (not staff)", async () => {
    mockGetServerSession.mockResolvedValue(dealerSession());
    const { GET } = await import("../route");
    const res = await GET(req("/api/admin/literacy/walkthroughs"));
    expect(res.status).toBe(401);
  });

  test("200 + walkthroughs list for staff viewer", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("viewer"));
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: WALK_ID,
          slug: "x",
          name: "Walk",
          role: "salesperson",
          surface: "dashboard",
          trigger_condition: "first_visit",
          steps: JSON.stringify([{ selector: "[x]", template: "y" }]),
          source: "ai_proposed",
          quality_score: 0.5,
          active: true,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    const { GET } = await import("../route");
    const res = await GET(req("/api/admin/literacy/walkthroughs"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.walkthroughs).toHaveLength(1);
  });
});

describe("POST /api/admin/literacy/walkthroughs", () => {
  test("403 viewer cannot create", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("viewer"));
    const { POST } = await import("../route");
    const res = await POST(
      req("/api/admin/literacy/walkthroughs", {
        method: "POST",
        body: JSON.stringify(validWalkthroughBody),
      }),
    );
    expect(res.status).toBe(403);
  });

  test("400 missing fields", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { POST } = await import("../route");
    const res = await POST(
      req("/api/admin/literacy/walkthroughs", {
        method: "POST",
        body: JSON.stringify({ name: "x" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("400 invalid step selector", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery.mockResolvedValueOnce({ rows: [] }); // dupe check
    const { POST } = await import("../route");
    const res = await POST(
      req("/api/admin/literacy/walkthroughs", {
        method: "POST",
        body: JSON.stringify({
          ...validWalkthroughBody,
          steps: [{ template: "no selector" }],
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("201 + walkthrough body for operator", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // dupe check
      .mockResolvedValueOnce({
        rows: [
          {
            id: WALK_ID,
            slug: validWalkthroughBody.slug,
            name: validWalkthroughBody.name,
            role: validWalkthroughBody.role,
            surface: validWalkthroughBody.surface,
            trigger_condition: validWalkthroughBody.trigger_condition,
            steps: JSON.stringify(validWalkthroughBody.steps),
            source: "ai_proposed",
            quality_score: 0.5,
            active: true,
            created_at: "",
            updated_at: "",
          },
        ],
      });
    const { POST } = await import("../route");
    const res = await POST(
      req("/api/admin/literacy/walkthroughs", {
        method: "POST",
        body: JSON.stringify(validWalkthroughBody),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.walkthrough.id).toBe(WALK_ID);
    expect(body.walkthrough.source).toBe("ai_proposed");
  });
});

// ---------------------------------------------------------------------------
// /api/admin/literacy/walkthroughs/[id] (PATCH / DELETE)
// ---------------------------------------------------------------------------
describe("PATCH /api/admin/literacy/walkthroughs/[id]", () => {
  test("400 invalid uuid", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      req("/api/admin/literacy/walkthroughs/x", {
        method: "PATCH",
        body: "{}",
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(res.status).toBe(400);
  });

  test("200 + walkthrough body for operator", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: WALK_ID,
          slug: "x",
          name: "Renamed",
          role: "salesperson",
          surface: null,
          trigger_condition: null,
          steps: [{ selector: "[x]", template: "y" }],
          source: "ai_approved",
          quality_score: 0.7,
          active: true,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    const mod = await import("../[id]/route");
    const res = await mod.PATCH(
      req(`/api/admin/literacy/walkthroughs/${WALK_ID}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed" }),
      }),
      { params: Promise.resolve({ id: WALK_ID }) },
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/literacy/walkthroughs/[id]", () => {
  test("403 operator cannot delete (admin required)", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const mod = await import("../[id]/route");
    const res = await mod.DELETE(
      req(`/api/admin/literacy/walkthroughs/${WALK_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: WALK_ID }) },
    );
    expect(res.status).toBe(403);
  });

  test("200 admin can delete", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("admin"));
    mockQuery.mockResolvedValueOnce({ rows: [{ id: WALK_ID }] });
    const mod = await import("../[id]/route");
    const res = await mod.DELETE(
      req(`/api/admin/literacy/walkthroughs/${WALK_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: WALK_ID }) },
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// /api/admin/literacy/tooltips (GET / POST)
// ---------------------------------------------------------------------------
describe("/api/admin/literacy/tooltips", () => {
  test("401 anonymous on GET", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const mod = await import("../../tooltips/route");
    const res = await mod.GET(req("/api/admin/literacy/tooltips"));
    expect(res.status).toBe(401);
  });

  test("400 missing body fields on POST", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const mod = await import("../../tooltips/route");
    const res = await mod.POST(
      req("/api/admin/literacy/tooltips", {
        method: "POST",
        body: JSON.stringify({ role: "salesperson" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("201 + tooltip body for operator", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // dupe check
      .mockResolvedValueOnce({
        rows: [
          {
            id: TIP_ID,
            concept_id: CONCEPT_ID,
            role: "salesperson",
            short_text: "short",
            expanded_text: "long",
            source: "ai_proposed",
            quality_score: 0.5,
            created_at: "",
          },
        ],
      });
    const mod = await import("../../tooltips/route");
    const res = await mod.POST(
      req("/api/admin/literacy/tooltips", {
        method: "POST",
        body: JSON.stringify({
          concept_id: CONCEPT_ID,
          role: "salesperson",
          short_text: "short",
          expanded_text: "long",
        }),
      }),
    );
    expect(res.status).toBe(201);
  });
});

describe("/api/admin/literacy/tooltips/[id]", () => {
  test("400 invalid uuid on PATCH", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const mod = await import("../../tooltips/[id]/route");
    const res = await mod.PATCH(
      req("/api/admin/literacy/tooltips/x", {
        method: "PATCH",
        body: "{}",
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(res.status).toBe(400);
  });

  test("403 operator cannot delete (admin required)", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const mod = await import("../../tooltips/[id]/route");
    const res = await mod.DELETE(
      req(`/api/admin/literacy/tooltips/${TIP_ID}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: TIP_ID }) },
    );
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// /api/literacy/walkthrough/[concept_slug] (public)
// ---------------------------------------------------------------------------
describe("GET /api/literacy/walkthrough/[concept_slug]", () => {
  test("401 anonymous", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const mod = await import(
      "../../../../literacy/walkthrough/[concept_slug]/route"
    );
    const res = await mod.GET(
      req("/api/literacy/walkthrough/some_slug"),
      { params: Promise.resolve({ concept_slug: "some_slug" }) },
    );
    expect(res.status).toBe(401);
  });

  test("200 + walkthrough body for authenticated dealer", async () => {
    mockGetServerSession.mockResolvedValue(dealerSession("manager"));
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: WALK_ID,
          slug: "first_visit_dash",
          name: "Intro",
          role: "gm",
          surface: "dashboard",
          trigger_condition: "first_visit",
          steps: JSON.stringify([{ selector: "[x]", template: "y" }]),
          source: "ai_proposed",
          quality_score: 0.5,
          active: true,
          created_at: "",
          updated_at: "",
        },
      ],
    });
    const mod = await import(
      "../../../../literacy/walkthrough/[concept_slug]/route"
    );
    const res = await mod.GET(
      req("/api/literacy/walkthrough/first_visit_dash"),
      { params: Promise.resolve({ concept_slug: "first_visit_dash" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.walkthrough.id).toBe(WALK_ID);
    expect(body.resolved_role).toBe("gm");
  });

  test("404 when no walkthrough exists for the role", async () => {
    mockGetServerSession.mockResolvedValue(dealerSession("manager"));
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const mod = await import(
      "../../../../literacy/walkthrough/[concept_slug]/route"
    );
    const res = await mod.GET(
      req("/api/literacy/walkthrough/nope"),
      { params: Promise.resolve({ concept_slug: "nope" }) },
    );
    expect(res.status).toBe(404);
  });
});
