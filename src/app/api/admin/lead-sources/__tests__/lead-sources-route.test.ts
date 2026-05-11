/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for GET + POST /api/admin/lead-sources
 *
 * Validates:
 *   - GET returns 200 + sources list in shadow mode
 *   - POST returns 201 + generates a fresh signing_secret in shadow mode
 *   - POST validates source_type enum
 *   - Routes refuse unauthenticated calls (no DEMO_MODE)
 */

const mockRequireAuth = jest.fn();

jest.mock("@/lib/auth-guard", () => {
  const actual = jest.requireActual<typeof import("@/lib/auth-guard")>("@/lib/auth-guard");
  return {
    ...actual,
    requireAuth: (...a: any[]) => mockRequireAuth(...a),
    isAuthenticated: actual.isAuthenticated,
  };
});

beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.DEMO_MODE;
  mockRequireAuth.mockReset();
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

import { NextRequest, NextResponse } from "next/server";
import { GET, POST } from "../route";

function makeGet(): NextRequest {
  return new NextRequest("https://x.test/api/admin/lead-sources", { method: "GET" });
}
function makePost(body: unknown): NextRequest {
  return new NextRequest("https://x.test/api/admin/lead-sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("GET /api/admin/lead-sources", () => {
  test("returns 200 + sources array in shadow mode", async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.sources)).toBe(true);
  });

  test("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "auth required" }, { status: 401 }),
    );
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/lead-sources", () => {
  test("201 + signing_secret on create (shadow mode)", async () => {
    const res = await POST(
      makePost({ source_name: "Web", source_type: "webhook" }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.signing_secret).toMatch(/^[a-f0-9]{64}$/);
    expect(json.source.has_signing_secret).toBe(true);
    // Response payload must NOT include the raw secret on the source view
    expect((json.source as Record<string, unknown>).signing_secret).toBeUndefined();
  });

  test("400 on bad source_type", async () => {
    const res = await POST(
      makePost({ source_name: "Web", source_type: "carrier-pigeon" }),
    );
    expect(res.status).toBe(400);
  });

  test("400 on invalid JSON", async () => {
    const res = await POST(makePost("not json{"));
    expect(res.status).toBe(400);
  });

  test("401 when unauthenticated", async () => {
    mockRequireAuth.mockResolvedValueOnce(
      NextResponse.json({ error: "auth required" }, { status: 401 }),
    );
    const res = await POST(
      makePost({ source_name: "Web", source_type: "webhook" }),
    );
    expect(res.status).toBe(401);
  });
});
