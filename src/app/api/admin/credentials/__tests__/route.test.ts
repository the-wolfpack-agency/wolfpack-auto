/**
 * Contract tests for /api/admin/credentials (list + add).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRequireAuth = jest.fn();
const mockAdd = jest.fn();
const mockList = jest.fn();

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: (...a: any[]) => mockRequireAuth(...a),
  isAuthenticated: (r: any) => !(r && typeof r.status === "number"),
}));
jest.mock("@/lib/external-credentials/index", () => ({
  ALL_PROVIDERS: ["kbb", "vauto", "mmr", "carfax", "autocheck", "plaid", "edmunds"],
  addCredential: (...a: any[]) => mockAdd(...a),
  listCredentials: (...a: any[]) => mockList(...a),
}));

import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "@/app/api/admin/credentials/route";

const DEALER = "00000000-0000-4000-a000-000000000001";

function authed() {
  return {
    user: { id: "u1", email: "u@x.com", name: "U", dealer_id: DEALER, role: "admin" },
  };
}
function authFail() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}
function makeReq(method: "GET" | "POST", url = "http://localhost/api/admin/credentials", body?: unknown) {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mockRequireAuth.mockReset();
  mockAdd.mockReset();
  mockList.mockReset();
});

describe("GET /api/admin/credentials", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(401);
  });

  it("400 when provider query param is unknown", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const res = await GET(makeReq("GET", "http://localhost/api/admin/credentials?provider=bogus"));
    expect(res.status).toBe(400);
  });

  it("200 with credentials array when DB returns rows", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockList.mockResolvedValueOnce([
      {
        id: "c1",
        dealerId: DEALER,
        provider: "carfax",
        label: null,
        status: "active",
        createdAt: "2026-05-12T00:00:00Z",
        rotatedAt: null,
        lastUsedAt: null,
        lastError: null,
      },
    ]);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.credentials.length).toBe(1);
    expect(body.noData).toBe(false);
  });

  it("200 with noData=true when list is empty", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockList.mockResolvedValueOnce([]);
    const res = await GET(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.noData).toBe(true);
  });
});

describe("POST /api/admin/credentials", () => {
  it("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(authFail());
    const res = await POST(makeReq("POST", undefined, { provider: "carfax", plaintext: "x" }));
    expect(res.status).toBe(401);
  });

  it("400 when body is not valid JSON", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const req = new NextRequest("http://localhost/api/admin/credentials", {
      method: "POST",
      body: "{not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("400 when provider missing/unknown", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const res = await POST(
      makeReq("POST", undefined, { plaintext: "x" }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when plaintext missing", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const res = await POST(
      makeReq("POST", undefined, { provider: "carfax" }),
    );
    expect(res.status).toBe(400);
  });

  it("400 when plaintext too large", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const res = await POST(
      makeReq("POST", undefined, {
        provider: "carfax",
        plaintext: "x".repeat(20_000),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("200 on happy path with success=true + redacted record", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    mockAdd.mockResolvedValueOnce({
      id: "c1",
      dealerId: DEALER,
      provider: "carfax",
      label: null,
      status: "active",
      createdAt: "2026-05-12T00:00:00Z",
      rotatedAt: null,
      lastUsedAt: null,
      lastError: null,
    });
    const res = await POST(
      makeReq("POST", undefined, { provider: "carfax", plaintext: "secret-key" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.credential.id).toBe("c1");
    expect(JSON.stringify(body)).not.toMatch(/secret-key/);
  });

  it("400 when underlying vault throws (e.g. missing key)", async () => {
    mockRequireAuth.mockResolvedValueOnce(authed());
    const {
      CredentialVaultError,
    } = await import("@/lib/external-credentials/crypto-vault");
    mockAdd.mockRejectedValueOnce(
      new CredentialVaultError("EXTERNAL_CREDENTIAL_KEY is not configured.", "key_missing"),
    );
    const res = await POST(
      makeReq("POST", undefined, { provider: "carfax", plaintext: "x" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("key_missing");
  });
});
