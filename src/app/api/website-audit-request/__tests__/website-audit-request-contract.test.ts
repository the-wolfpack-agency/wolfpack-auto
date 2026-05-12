/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for POST /api/website-audit-request + GET /:id.
 *
 * Runs in shadow mode (DATABASE_URL unset). Rate-limit is mocked.
 */

const mockCheckRateLimit = jest.fn();

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: any[]) => mockCheckRateLimit(...a),
}));

import { POST } from "@/app/api/website-audit-request/route";
import { GET as GET_STATUS } from "@/app/api/website-audit-request/[id]/route";
import { NextRequest } from "next/server";

beforeEach(() => {
  mockCheckRateLimit
    .mockReset()
    .mockResolvedValue({ allowed: true, remaining: 4, resetAt: 0 });
  delete process.env.DATABASE_URL;
  delete process.env.HCAPTCHA_SECRET;
});

function buildJsonRequest(body: unknown, ip?: string): NextRequest {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("x-forwarded-for", ip ?? `127.0.0.${Math.floor(Math.random() * 250)}`);
  return new NextRequest("http://localhost/api/website-audit-request", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

const VALID_BODY = {
  dealership_name: "Sample Motors",
  website_url: "https://www.example.com",
  contact_name: "Contact Person",
  contact_email: "prospect@example.com",
  oem_affiliation: "independent",
};

describe("POST /api/website-audit-request", () => {
  test("200 with a valid JSON payload", async () => {
    const req = buildJsonRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run_id).toBeTruthy();
    expect(body.status).toBe("pending");
    expect(body.status_url).toContain("/api/website-audit-request/");
  });

  test("400 when website_url is missing", async () => {
    const req = buildJsonRequest({ ...VALID_BODY, website_url: undefined });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("400 when website_url points to localhost", async () => {
    const req = buildJsonRequest({ ...VALID_BODY, website_url: "https://localhost/" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("400 when website_url points to a private IP", async () => {
    const req = buildJsonRequest({ ...VALID_BODY, website_url: "https://10.0.0.1/" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("400 when website_url is not a URL", async () => {
    const req = buildJsonRequest({ ...VALID_BODY, website_url: "not-a-url" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("400 when contact_email is malformed", async () => {
    const req = buildJsonRequest({ ...VALID_BODY, contact_email: "not-an-email" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("400 when body is not JSON", async () => {
    const headers = new Headers();
    headers.set("content-type", "application/json");
    const req = new NextRequest("http://localhost/api/website-audit-request", {
      method: "POST",
      body: "not-json",
      headers,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("429 when minute rate-limit trips", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: 0 });
    const req = buildJsonRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  test("429 when hour rate-limit trips", async () => {
    mockCheckRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 1, resetAt: 0 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: 0 });
    const req = buildJsonRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  test("HCAPTCHA_SECRET set without token returns 400", async () => {
    process.env.HCAPTCHA_SECRET = "test-secret";
    const req = buildJsonRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(400);
    delete process.env.HCAPTCHA_SECRET;
  });
});

describe("GET /api/website-audit-request/:id", () => {
  test("200 returns synthetic pending in shadow mode", async () => {
    const res = await GET_STATUS(
      new NextRequest("http://localhost/api/website-audit-request/synthetic-id-1234"),
      { params: Promise.resolve({ id: "synthetic-id-1234" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("pending");
    expect(body.id).toBe("synthetic-id-1234");
  });

  test("400 when id is missing", async () => {
    const res = await GET_STATUS(
      new NextRequest("http://localhost/api/website-audit-request/x"),
      { params: Promise.resolve({ id: "x" }) },
    );
    expect(res.status).toBe(400);
  });
});
