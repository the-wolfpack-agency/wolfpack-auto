/**
 * Contract tests for /api/admin/credentials/[id] (PATCH rotate + DELETE).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();
const mockRotate = jest.fn();
const mockRevoke = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...a: any[]) => mockRequireAuth(...a),
  isAuthenticated: (r: any) => !(r && typeof r.status === "number"),
}));
jest.mock("@/lib/external-credentials/index", () => ({
  rotateCredential: (...a: any[]) => mockRotate(...a),
  revokeCredential: (...a: any[]) => mockRevoke(...a),
  deleteCredential: (...a: any[]) => mockDelete(...a),
}));

import { NextRequest, NextResponse } from "next/server";
import {
  DELETE as DELETE_HANDLER,
  PATCH,
} from "@/app/api/admin/credentials/[id]/route";

const DEALER = "00000000-0000-4000-a000-000000000001";
const ID = "11111111-2222-4333-9444-555555555555";

function authed() {
  return {
    user: { id: "u1", email: "u@x.com", name: "U", dealer_id: DEALER, role: "admin" },
  };
}
function authFail() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}
function ctx(id = ID) {
  return { params: Promise.resolve({ id }) };
}
function makeReq(method: "PATCH" | "DELETE", id = ID, body?: unknown, qs = "") {
  return new NextRequest(`http://localhost/api/admin/credentials/${id}${qs}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockRotate.mockReset();
  mockRevoke.mockReset();
  mockDelete.mockReset();
});

describe("PATCH /api/admin/credentials/[id]", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const res = await PATCH(makeReq("PATCH", ID, { plaintext: "new" }), ctx());
    expect(res.status).toBe(401);
  });

  it("400 when id is not a uuid", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const res = await PATCH(makeReq("PATCH", "not-a-uuid", { plaintext: "new" }), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("400 when plaintext missing", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const res = await PATCH(makeReq("PATCH", ID, {}), ctx());
    expect(res.status).toBe(400);
  });

  it("404 when rotateCredential returns null", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockRotate.mockResolvedValueOnce(null);
    const res = await PATCH(makeReq("PATCH", ID, { plaintext: "new" }), ctx());
    expect(res.status).toBe(404);
  });

  it("200 on success", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockRotate.mockResolvedValueOnce({
      id: ID,
      dealerId: DEALER,
      provider: "carfax",
      label: null,
      status: "active",
      createdAt: "x",
      rotatedAt: "y",
      lastUsedAt: null,
      lastError: null,
    });
    const res = await PATCH(makeReq("PATCH", ID, { plaintext: "new" }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

describe("DELETE /api/admin/credentials/[id]", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const res = await DELETE_HANDLER(makeReq("DELETE"), ctx());
    expect(res.status).toBe(401);
  });

  it("404 when revoke returns null (no row)", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockRevoke.mockResolvedValueOnce(null);
    const res = await DELETE_HANDLER(makeReq("DELETE"), ctx());
    expect(res.status).toBe(404);
  });

  it("200 soft revoke (no ?hard)", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockRevoke.mockResolvedValueOnce({
      id: ID,
      dealerId: DEALER,
      provider: "carfax",
      label: null,
      status: "revoked",
      createdAt: "x",
      rotatedAt: null,
      lastUsedAt: null,
      lastError: null,
    });
    const res = await DELETE_HANDLER(makeReq("DELETE"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revoked).toBe(true);
  });

  it("200 hard delete (?hard=true)", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockDelete.mockResolvedValueOnce(true);
    const res = await DELETE_HANDLER(makeReq("DELETE", ID, undefined, "?hard=true"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(true);
  });

  it("404 when hard delete returns false", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockDelete.mockResolvedValueOnce(false);
    const res = await DELETE_HANDLER(makeReq("DELETE", ID, undefined, "?hard=true"), ctx());
    expect(res.status).toBe(404);
  });
});
