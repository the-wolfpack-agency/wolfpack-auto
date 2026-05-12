/**
 * Contract tests for the dealer-lender admin routes (Stream B, migration 070).
 *
 *   GET    /api/admin/dealer/lenders            -> list
 *   POST   /api/admin/dealer/lenders            -> create
 *   PATCH  /api/admin/dealer/lenders/[id]       -> update
 *   DELETE /api/admin/dealer/lenders/[id]       -> remove
 *
 * Asserts 200 / 201 / 400 / 401 envelopes. The lib layer is mocked.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();
const mockList = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: any[]) => mockRequireAuth(...args),
  isAuthenticated: (r: any) => !(r && typeof r.status === "number"),
}));

jest.mock("@/lib/prequal/lender-routing", () => ({
  listLenderRoutes: (...args: any[]) => mockList(...args),
  createLenderRoute: (...args: any[]) => mockCreate(...args),
  updateLenderRoute: (...args: any[]) => mockUpdate(...args),
  deleteLenderRoute: (...args: any[]) => mockDelete(...args),
  isValidLenderType: (t: string) =>
    ["prime", "sub_prime", "captive", "credit_union", "other"].includes(t),
}));

jest.mock("@/lib/audit-log", () => ({ auditLog: jest.fn().mockResolvedValue(undefined) }));

import { NextRequest, NextResponse } from "next/server";
import { GET as listGet, POST as listPost } from "@/app/api/admin/dealer/lenders/route";
import {
  PATCH as itemPatch,
  DELETE as itemDelete,
} from "@/app/api/admin/dealer/lenders/[id]/route";

const DEALER = "00000000-0000-4000-a000-000000000001";

function authed() {
  return {
    user: { id: "u1", email: "u@x.com", name: "U", dealer_id: DEALER, role: "admin" },
  };
}
function unauthed() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockList.mockReset();
  mockCreate.mockReset();
  mockUpdate.mockReset();
  mockDelete.mockReset();
  process.env.DATABASE_URL = "postgres://x";
});

/* -------------------------------------------------------------------------- */
/* GET                                                                        */
/* -------------------------------------------------------------------------- */

describe("GET /api/admin/dealer/lenders", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders");
    const res = await listGet(req);
    expect(res.status).toBe(401);
  });

  it("200 with list when authenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockList.mockResolvedValueOnce([
      { id: "r1", lenderName: "ACME", contactEmail: "a@b.co", active: true },
    ]);
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders");
    const res = await listGet(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.routes).toHaveLength(1);
  });

  it("200 + shadow_mode when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders");
    const res = await listGet(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shadow_mode).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* POST                                                                       */
/* -------------------------------------------------------------------------- */

describe("POST /api/admin/dealer/lenders", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders", {
      method: "POST",
      body: JSON.stringify({ lender_name: "x", contact_email: "a@b.co" }),
    });
    const res = await listPost(req);
    expect(res.status).toBe(401);
  });

  it("400 when lender_name missing", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders", {
      method: "POST",
      body: JSON.stringify({ contact_email: "a@b.co" }),
    });
    const res = await listPost(req);
    expect(res.status).toBe(400);
  });

  it("400 when body is invalid JSON", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders", {
      method: "POST",
      body: "not-json",
    });
    const res = await listPost(req);
    expect(res.status).toBe(400);
  });

  it("400 when lender_type invalid", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders", {
      method: "POST",
      body: JSON.stringify({
        lender_name: "x",
        contact_email: "a@b.co",
        lender_type: "bad",
      }),
    });
    const res = await listPost(req);
    expect(res.status).toBe(400);
  });

  it("201 on happy path", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockCreate.mockResolvedValueOnce({
      id: "r1",
      dealerId: DEALER,
      lenderName: "x",
      contactEmail: "a@b.co",
      contactName: null,
      sortOrder: 0,
      active: true,
      lenderType: "other",
      notes: null,
      createdAt: "now",
      updatedAt: "now",
    });
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders", {
      method: "POST",
      body: JSON.stringify({
        lender_name: "x",
        contact_email: "a@b.co",
      }),
    });
    const res = await listPost(req);
    expect(res.status).toBe(201);
  });
});

/* -------------------------------------------------------------------------- */
/* PATCH                                                                      */
/* -------------------------------------------------------------------------- */

describe("PATCH /api/admin/dealer/lenders/[id]", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders/r1", {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    const res = await itemPatch(req, ctx("r1"));
    expect(res.status).toBe(401);
  });

  it("400 on invalid JSON", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders/r1", {
      method: "PATCH",
      body: "not-json",
    });
    const res = await itemPatch(req, ctx("r1"));
    expect(res.status).toBe(400);
  });

  it("400 on bad lender_type", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders/r1", {
      method: "PATCH",
      body: JSON.stringify({ lender_type: "garbage" }),
    });
    const res = await itemPatch(req, ctx("r1"));
    expect(res.status).toBe(400);
  });

  it("404 when route not found", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockUpdate.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders/r1", {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    const res = await itemPatch(req, ctx("r1"));
    expect(res.status).toBe(404);
  });

  it("200 on happy path", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockUpdate.mockResolvedValueOnce({
      id: "r1",
      dealerId: DEALER,
      lenderName: "x",
      contactEmail: "a@b.co",
      contactName: null,
      sortOrder: 0,
      active: false,
      lenderType: "other",
      notes: null,
      createdAt: "now",
      updatedAt: "now",
    });
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders/r1", {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    const res = await itemPatch(req, ctx("r1"));
    expect(res.status).toBe(200);
  });
});

/* -------------------------------------------------------------------------- */
/* DELETE                                                                     */
/* -------------------------------------------------------------------------- */

describe("DELETE /api/admin/dealer/lenders/[id]", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(unauthed());
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders/r1", {
      method: "DELETE",
    });
    const res = await itemDelete(req, ctx("r1"));
    expect(res.status).toBe(401);
  });

  it("404 when not found", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockDelete.mockResolvedValueOnce(false);
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders/r1", {
      method: "DELETE",
    });
    const res = await itemDelete(req, ctx("r1"));
    expect(res.status).toBe(404);
  });

  it("200 on happy path", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockDelete.mockResolvedValueOnce(true);
    const req = new NextRequest("http://localhost/api/admin/dealer/lenders/r1", {
      method: "DELETE",
    });
    const res = await itemDelete(req, ctx("r1"));
    expect(res.status).toBe(200);
  });
});
