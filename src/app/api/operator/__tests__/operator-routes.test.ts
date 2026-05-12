/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for the Wolfpack operator API surface.
 *
 * Each route is covered for:
 *   - 200/201 happy path (authenticated staff)
 *   - 401 anonymous
 *   - 403 wrong-role (where applicable)
 *   - 400 validation errors
 */

const mockGetServerSession = jest.fn();
const mockQuery = jest.fn();
const mockHash = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...a: any[]) => mockGetServerSession(...a),
}));
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
  pool: { connect: jest.fn(), query: jest.fn(), end: jest.fn() },
}));
jest.mock("bcryptjs", () => ({
  hash: (...a: any[]) => mockHash(...a),
  compare: jest.fn(),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackSystem: jest.fn(),
  trackSecurity: jest.fn(),
}));

import { NextRequest } from "next/server";

beforeEach(() => {
  mockGetServerSession.mockReset();
  mockQuery.mockReset();
  mockHash.mockReset();
  mockHash.mockResolvedValue("hashed-password");
  process.env.DATABASE_URL = "postgres://test";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

function staffSession(role: "admin" | "operator" | "viewer" = "admin") {
  return {
    user: {
      id: "staff-1",
      email: "staff@thewolfpack.agency",
      name: "Test Staff",
      dealer_id: "wolfpack-staff",
      role: "wolfpack_admin",
    },
    kind: "wolfpack_staff",
    staff_id: "staff-1",
    staff_role: role,
  };
}

function req(url: string, init?: { method?: string; body?: string }): NextRequest {
  return new NextRequest(`https://x.test${url}`, init as ConstructorParameters<typeof NextRequest>[1]);
}

// ---------------------------------------------------------------------------
// /api/operator/stats
// ---------------------------------------------------------------------------
describe("GET /api/operator/stats", () => {
  test("returns 401 for anonymous", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../stats/route");
    const res = await GET(req("/api/operator/stats"));
    expect(res.status).toBe(401);
  });

  test("returns 401 for a dealer session (not staff)", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "dealer-1", email: "u@d.com", name: "U", dealer_id: "d1", role: "admin" },
      kind: "dealer",
    });
    const { GET } = await import("../stats/route");
    const res = await GET(req("/api/operator/stats"));
    expect(res.status).toBe(401);
  });

  test("returns 200 + stats shape for staff", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("viewer"));
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total_dealers: 3, dealers_active: 2, dealers_suspended: 1, dealers_active_7d: 1 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const { GET } = await import("../stats/route");
    const res = await GET(req("/api/operator/stats"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      total_dealers: 3,
      dealers_active: 2,
      dealers_in_onboarding: 1,
      recent_actions: [],
    });
  });
});

// ---------------------------------------------------------------------------
// /api/operator/dealers GET + POST
// ---------------------------------------------------------------------------
describe("GET /api/operator/dealers", () => {
  test("401 anonymous", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../dealers/route");
    const res = await GET(req("/api/operator/dealers"));
    expect(res.status).toBe(401);
  });

  test("200 + dealers list for staff (DB path)", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("viewer"));
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: "d1",
            name: "ACME Motors",
            slug: "acme-motors",
            phone: "",
            email: "",
            is_active: true,
            created_at: "2026-01-01T00:00:00Z",
            leads_count: 0,
            inventory_count: 0,
            user_count: 1,
            last_activity_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] });

    const { GET } = await import("../dealers/route");
    const res = await GET(req("/api/operator/dealers"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.dealers).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});

describe("POST /api/operator/dealers", () => {
  test("401 anonymous", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../dealers/route");
    const res = await POST(
      req("/api/operator/dealers", { method: "POST", body: JSON.stringify({ name: "X", slug: "x" }) }),
    );
    expect(res.status).toBe(401);
  });

  test("403 for viewer role", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("viewer"));
    const { POST } = await import("../dealers/route");
    const res = await POST(
      req("/api/operator/dealers", { method: "POST", body: JSON.stringify({ name: "X", slug: "x" }) }),
    );
    expect(res.status).toBe(403);
  });

  test("400 missing name", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { POST } = await import("../dealers/route");
    const res = await POST(
      req("/api/operator/dealers", { method: "POST", body: JSON.stringify({ slug: "x" }) }),
    );
    expect(res.status).toBe(400);
  });

  test("201 happy path + writes audit row", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // slug uniqueness
      .mockResolvedValueOnce({ rows: [{ id: "00000000-0000-4000-a000-000000000001", name: "ACME Motors", slug: "acme-motors" }] }) // insert dealer
      .mockResolvedValueOnce({ rows: [] }) // dealer_users insert
      .mockResolvedValueOnce({ rows: [] }) // templates
      .mockResolvedValueOnce({ rows: [] }) // templates
      .mockResolvedValueOnce({ rows: [] }) // templates
      .mockResolvedValueOnce({ rows: [] }) // webhook config
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // audit row

    const { POST } = await import("../dealers/route");
    const res = await POST(
      req("/api/operator/dealers", {
        method: "POST",
        body: JSON.stringify({ name: "ACME Motors", slug: "acme-motors", email: "owner@acme.com" }),
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slug).toBe("acme-motors");
    expect(body.admin_credentials.email).toBe("owner@acme.com");

    // Last query should be the audit insert.
    const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
    expect(lastCall[0]).toMatch(/INSERT INTO wolfpack_staff_audit_log/);
  });
});

// ---------------------------------------------------------------------------
// /api/operator/dealers/[id] PATCH / DELETE
// ---------------------------------------------------------------------------
describe("PATCH /api/operator/dealers/[id]", () => {
  const params = { id: "00000000-0000-4000-a000-000000000001" };

  test("401 anonymous", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { PATCH } = await import("../dealers/[id]/route");
    const res = await PATCH(
      req(`/api/operator/dealers/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      }),
      { params: Promise.resolve(params) },
    );
    expect(res.status).toBe(401);
  });

  test("400 invalid uuid", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { PATCH } = await import("../dealers/[id]/route");
    const res = await PATCH(
      req(`/api/operator/dealers/not-a-uuid`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(res.status).toBe(400);
  });

  test("400 missing is_active", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { PATCH } = await import("../dealers/[id]/route");
    const res = await PATCH(
      req(`/api/operator/dealers/${params.id}`, { method: "PATCH", body: JSON.stringify({}) }),
      { params: Promise.resolve(params) },
    );
    expect(res.status).toBe(400);
  });

  test("200 toggles suspend + audits", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: params.id, name: "ACME", is_active: false }] }) // update
      .mockResolvedValueOnce({ rows: [{ id: 99 }] }); // audit

    const { PATCH } = await import("../dealers/[id]/route");
    const res = await PATCH(
      req(`/api/operator/dealers/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false }),
      }),
      { params: Promise.resolve(params) },
    );
    expect(res.status).toBe(200);
  });

  test("403 viewer cannot DELETE", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("viewer"));
    const { DELETE } = await import("../dealers/[id]/route");
    const res = await DELETE(
      req(`/api/operator/dealers/${params.id}`, { method: "DELETE" }),
      { params: Promise.resolve(params) },
    );
    expect(res.status).toBe(403);
  });

  test("403 operator cannot DELETE (admin-only)", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { DELETE } = await import("../dealers/[id]/route");
    const res = await DELETE(
      req(`/api/operator/dealers/${params.id}`, { method: "DELETE" }),
      { params: Promise.resolve(params) },
    );
    expect(res.status).toBe(403);
  });

  test("200 admin soft-deletes", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("admin"));
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: params.id, name: "ACME" }] })
      .mockResolvedValueOnce({ rows: [{ id: 100 }] });

    const { DELETE } = await import("../dealers/[id]/route");
    const res = await DELETE(
      req(`/api/operator/dealers/${params.id}`, { method: "DELETE" }),
      { params: Promise.resolve(params) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.soft_deleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// /api/operator/invites
// ---------------------------------------------------------------------------
describe("POST /api/operator/invites", () => {
  test("401 anonymous", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { POST } = await import("../invites/route");
    const res = await POST(
      req("/api/operator/invites", { method: "POST", body: JSON.stringify({ email: "x@y.com", role: "viewer" }) }),
    );
    expect(res.status).toBe(401);
  });

  test("403 viewer", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("viewer"));
    const { POST } = await import("../invites/route");
    const res = await POST(
      req("/api/operator/invites", { method: "POST", body: JSON.stringify({ email: "x@y.com", role: "viewer" }) }),
    );
    expect(res.status).toBe(403);
  });

  test("403 operator (only admin can invite)", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    const { POST } = await import("../invites/route");
    const res = await POST(
      req("/api/operator/invites", { method: "POST", body: JSON.stringify({ email: "x@y.com", role: "viewer" }) }),
    );
    expect(res.status).toBe(403);
  });

  test("400 invalid email", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("admin"));
    const { POST } = await import("../invites/route");
    const res = await POST(
      req("/api/operator/invites", { method: "POST", body: JSON.stringify({ email: "no-at", role: "viewer" }) }),
    );
    expect(res.status).toBe(400);
  });

  test("400 invalid role", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("admin"));
    const { POST } = await import("../invites/route");
    const res = await POST(
      req("/api/operator/invites", { method: "POST", body: JSON.stringify({ email: "x@y.com", role: "godmode" }) }),
    );
    expect(res.status).toBe(400);
  });

  test("201 happy path", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("admin"));
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // duplicate-invite check
      .mockResolvedValueOnce({ rows: [] }) // existing staff check
      .mockResolvedValueOnce({ rows: [{ id: "inv-1" }] }) // insert invite
      .mockResolvedValueOnce({ rows: [{ id: 7 }] }); // audit row

    const { POST } = await import("../invites/route");
    const res = await POST(
      req("/api/operator/invites", { method: "POST", body: JSON.stringify({ email: "new@x.com", role: "operator" }) }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe("new@x.com");
    expect(body.role).toBe("operator");
  });
});

// ---------------------------------------------------------------------------
// /api/operator/invites/accept (public route)
// ---------------------------------------------------------------------------
describe("POST /api/operator/invites/accept", () => {
  test("400 missing token", async () => {
    const { POST } = await import("../invites/accept/route");
    const res = await POST(
      req("/api/operator/invites/accept", {
        method: "POST",
        body: JSON.stringify({ full_name: "Jane Doe", password: "GoodPass1@xyz123" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("400 weak password", async () => {
    const { POST } = await import("../invites/accept/route");
    const res = await POST(
      req("/api/operator/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token: "abc", full_name: "Jane Doe", password: "weak" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("400 invalid token", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { POST } = await import("../invites/accept/route");
    const res = await POST(
      req("/api/operator/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token: "abc", full_name: "Jane Doe", password: "GoodPass1@xyz123" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("200 accepts valid invite", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: "inv-1",
            email: "new@x.com",
            role: "operator",
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            accepted_at: null,
          },
        ],
      }) // SELECT invite
      .mockResolvedValueOnce({ rows: [] }) // staff doesn't exist
      .mockResolvedValueOnce({ rows: [{ id: "staff-new" }] }) // INSERT staff
      .mockResolvedValueOnce({ rows: [] }) // UPDATE invite accepted_at
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // audit

    const { POST } = await import("../invites/accept/route");
    const res = await POST(
      req("/api/operator/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token: "abc", full_name: "Jane Doe", password: "GoodPass1@xyz123" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staff.email).toBe("new@x.com");
  });
});

// ---------------------------------------------------------------------------
// /api/operator/team, /audit (read endpoints)
// ---------------------------------------------------------------------------
describe("GET /api/operator/team", () => {
  test("401 anonymous", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../team/route");
    const res = await GET(req("/api/operator/team"));
    expect(res.status).toBe(401);
  });

  test("200 lists staff", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "s1",
          email: "a@x.com",
          full_name: "A",
          role: "admin",
          mfa_enabled: false,
          last_login_at: null,
          created_at: "2026-01-01T00:00:00Z",
          disabled_at: null,
        },
      ],
    });
    const { GET } = await import("../team/route");
    const res = await GET(req("/api/operator/team"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staff).toHaveLength(1);
  });
});

describe("GET /api/operator/audit", () => {
  test("401 anonymous", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const { GET } = await import("../audit/route");
    const res = await GET(req("/api/operator/audit"));
    expect(res.status).toBe(401);
  });

  test("200 lists events", async () => {
    mockGetServerSession.mockResolvedValue(staffSession("operator"));
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const { GET } = await import("../audit/route");
    const res = await GET(req("/api/operator/audit"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toEqual([]);
  });
});
