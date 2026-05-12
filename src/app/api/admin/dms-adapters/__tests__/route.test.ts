/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for /api/admin/dms-adapters (list + per-provider verbs).
 *
 * Asserts:
 *   - GET 200 + adapter list (dealer-side path) in shadow mode
 *   - GET 401 unauthenticated
 *   - GET 403 when role is below dealer-admin
 *   - GET 200 cross-dealer with dealer_id when caller is Wolfpack staff
 *   - GET 401 cross-dealer when caller is NOT staff
 *   - POST 200 + record in shadow mode
 *   - POST 400 invalid provider
 *   - PATCH 404 when no row exists (shadow mode rotate returns null)
 *   - DELETE 404 when no row exists
 *
 * No DB writes — all paths exercised in shadow mode (DATABASE_URL unset).
 */

const mockRequireAuth = jest.fn();
const mockRequireWolfpackStaff = jest.fn();

jest.mock("@/lib/auth-guard", () => {
  const actual = jest.requireActual<typeof import("@/lib/auth-guard")>("@/lib/auth-guard");
  return {
    ...actual,
    requireAuth: (...a: any[]) => mockRequireAuth(...a),
    isAuthenticated: actual.isAuthenticated,
  };
});
jest.mock("@/lib/operator-auth", () => {
  const actual = jest.requireActual<typeof import("@/lib/operator-auth")>("@/lib/operator-auth");
  return {
    ...actual,
    requireWolfpackStaff: (...a: any[]) => mockRequireWolfpackStaff(...a),
    isWolfpackStaff: actual.isWolfpackStaff,
  };
});

import { NextRequest, NextResponse } from "next/server";
import { GET } from "../route";
import { POST, PATCH, DELETE } from "../[provider]/route";
import { generateTestKey } from "@/lib/external-credentials/crypto-vault";

const ORIGINAL_KEY = process.env.EXTERNAL_CREDENTIAL_KEY;

beforeEach(() => {
  process.env.EXTERNAL_CREDENTIAL_KEY = generateTestKey();
  delete process.env.DATABASE_URL;
  delete process.env.DEMO_MODE;
  mockRequireAuth.mockReset();
  mockRequireWolfpackStaff.mockReset();
  mockRequireAuth.mockResolvedValue({
    user: {
      id: "user-1",
      email: "demo@example.com",
      name: "Demo",
      dealer_id: "00000000-0000-4000-a000-000000000001",
      role: "admin",
    },
  });
});

afterAll(() => {
  process.env.EXTERNAL_CREDENTIAL_KEY = ORIGINAL_KEY;
});

function get(url = "https://x.test/api/admin/dms-adapters"): NextRequest {
  return new NextRequest(url, { method: "GET" });
}
function post(provider: string, body: unknown): NextRequest {
  return new NextRequest(`https://x.test/api/admin/dms-adapters/${provider}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function patch(provider: string, body: unknown): NextRequest {
  return new NextRequest(`https://x.test/api/admin/dms-adapters/${provider}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
function del(provider: string, query = ""): NextRequest {
  return new NextRequest(
    `https://x.test/api/admin/dms-adapters/${provider}${query}`,
    { method: "DELETE" },
  );
}

describe("GET /api/admin/dms-adapters (dealer-admin)", () => {
  test("200 + empty adapters list in shadow mode", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.adapters)).toBe(true);
    expect(json.available_providers).toEqual(
      expect.arrayContaining(["mock", "cox_vauto"]),
    );
  });

  test("401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "auth required" }, { status: 401 }),
    );
    const res = await GET(get());
    expect(res.status).toBe(401);
  });

  test("403 when role is below admin", async () => {
    mockRequireAuth.mockResolvedValueOnce({
      user: {
        id: "u",
        email: "x@y.com",
        name: "x",
        dealer_id: "d",
        role: "staff",
      },
    });
    const res = await GET(get());
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/dms-adapters?dealer_id=... (cross-dealer)", () => {
  test("401 when caller is not Wolfpack staff", async () => {
    mockRequireWolfpackStaff.mockResolvedValueOnce(
      NextResponse.json({ error: "staff only" }, { status: 401 }),
    );
    const res = await GET(get("https://x.test/api/admin/dms-adapters?dealer_id=dx"));
    expect(res.status).toBe(401);
  });

  test("200 when caller is Wolfpack staff", async () => {
    mockRequireWolfpackStaff.mockResolvedValueOnce({
      staff: { id: "s", email: "ops@wolfpack", name: "Ops", role: "operator" },
    });
    const res = await GET(get("https://x.test/api/admin/dms-adapters?dealer_id=dx"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.dealer_id).toBe("dx");
  });
});

describe("POST /api/admin/dms-adapters/[provider]", () => {
  test("200 + record on configure mock in shadow mode", async () => {
    const res = await POST(post("mock", { credentials: null }), {
      params: Promise.resolve({ provider: "mock" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.adapter.provider).toBe("mock");
    expect(json.adapter.status).toBe("pending"); // no creds
  });

  test("200 + active status when credentials supplied", async () => {
    const res = await POST(
      post("cox_vauto", { credentials: { apiKey: "x", dealerCode: "D" } }),
      { params: Promise.resolve({ provider: "cox_vauto" }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.adapter.status).toBe("active");
  });

  test("400 on invalid provider", async () => {
    const res = await POST(post("not_a_real_dms", { credentials: null }), {
      params: Promise.resolve({ provider: "not_a_real_dms" }),
    });
    expect(res.status).toBe(400);
  });

  test("401 unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "auth required" }, { status: 401 }),
    );
    const res = await POST(post("mock", { credentials: null }), {
      params: Promise.resolve({ provider: "mock" }),
    });
    expect(res.status).toBe(401);
  });

  test("403 when role is below admin", async () => {
    mockRequireAuth.mockResolvedValueOnce({
      user: {
        id: "u", email: "x", name: "x", dealer_id: "d", role: "staff",
      },
    });
    const res = await POST(post("mock", { credentials: null }), {
      params: Promise.resolve({ provider: "mock" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/admin/dms-adapters/[provider]", () => {
  test("404 in shadow mode (no row to rotate)", async () => {
    const res = await PATCH(
      patch("cox_vauto", { credentials: { apiKey: "new" } }),
      { params: Promise.resolve({ provider: "cox_vauto" }) },
    );
    expect(res.status).toBe(404);
  });

  test("400 on bad body", async () => {
    const res = await PATCH(patch("cox_vauto", { wrong: "shape" }), {
      params: Promise.resolve({ provider: "cox_vauto" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/admin/dms-adapters/[provider]", () => {
  test("404 in shadow mode (no row)", async () => {
    const res = await DELETE(del("cox_vauto"), {
      params: Promise.resolve({ provider: "cox_vauto" }),
    });
    expect(res.status).toBe(404);
  });

  test("400 invalid provider", async () => {
    const res = await DELETE(del("nope"), {
      params: Promise.resolve({ provider: "nope" }),
    });
    expect(res.status).toBe(400);
  });
});
