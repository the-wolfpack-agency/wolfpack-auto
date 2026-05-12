/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contract tests for POST /api/audit-request + GET /api/audit-request/:id.
 *
 * Tests run in shadow mode (DATABASE_URL unset) — verifies the handler
 * returns 200/400/429 for the documented input shapes. Rate-limit is
 * mocked so we don't depend on Redis or in-memory cross-test state.
 */

const mockCheckRateLimit = jest.fn();

jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: any[]) => mockCheckRateLimit(...a),
}));

import { POST } from "@/app/api/audit-request/route";
import { GET as GET_STATUS } from "@/app/api/audit-request/[id]/route";
import { NextRequest } from "next/server";

beforeEach(() => {
  mockCheckRateLimit
    .mockReset()
    .mockResolvedValue({ allowed: true, remaining: 4, resetAt: 0 });
  delete process.env.DATABASE_URL;
  delete process.env.HCAPTCHA_SECRET;
});

function buildMultipartRequest(opts: {
  fields?: Record<string, string>;
  csv?: { name?: string; content?: string };
  noCsv?: boolean;
  ip?: string;
}): NextRequest {
  const form = new FormData();
  const fields = opts.fields ?? {};
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, v);
  }
  if (!opts.noCsv) {
    const csv = opts.csv?.content ?? buildValidCSV();
    form.append(
      "csv_file",
      new File([csv], opts.csv?.name ?? "deals.csv", { type: "text/csv" }),
    );
  }
  const headers = new Headers();
  headers.set(
    "x-forwarded-for",
    opts.ip ?? `127.0.0.${Math.floor(Math.random() * 250)}`,
  );
  return new NextRequest("http://localhost/api/audit-request", {
    method: "POST",
    body: form,
    headers,
  });
}

function buildValidCSV(rows = 40): string {
  const lines = [
    "deal_id,fi_manager,funded_at,gap_attached,warranty_attached,gross",
  ];
  for (let i = 0; i < rows; i++) {
    lines.push(
      `D${i},${i % 2 === 0 ? "Alex" : "Jordan"},2026-03-15,${i % 3 === 0 ? "1" : "0"},${i % 2 === 0 ? "1" : "0"},${600 + i}`,
    );
  }
  return lines.join("\n");
}

const VALID_FIELDS = {
  dealership_name: "Sample Motors",
  contact_name: "Contact Person",
  contact_email: "prospect@example.com",
  rooftops_count: "1",
};

describe("POST /api/audit-request", () => {
  test("200 with valid multipart payload", async () => {
    const req = buildMultipartRequest({ fields: VALID_FIELDS });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBeTruthy();
    expect(body.status).toBe("pending");
  }, 15000);

  test("400 when contact_email is malformed", async () => {
    const req = buildMultipartRequest({
      fields: { ...VALID_FIELDS, contact_email: "not-an-email" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  }, 15000);

  test("400 when CSV is missing", async () => {
    const req = buildMultipartRequest({ fields: VALID_FIELDS, noCsv: true });
    const res = await POST(req);
    expect(res.status).toBe(400);
  }, 15000);

  test("400 when CSV is missing required deal_id column", async () => {
    const bad =
      "manager,funded_at,gap_attached\nA,2026-03-01,1\nB,2026-03-02,0";
    const req = buildMultipartRequest({
      fields: VALID_FIELDS,
      csv: { content: bad },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  }, 15000);

  test("429 when the rate-limiter denies the request", async () => {
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: 999,
    });
    const req = buildMultipartRequest({ fields: VALID_FIELDS });
    const res = await POST(req);
    expect(res.status).toBe(429);
  }, 15000);
});

describe("GET /api/audit-request/:id", () => {
  test("200 in shadow mode returns a synthesized pending status", async () => {
    const req = new NextRequest(
      "http://localhost/api/audit-request/abcd1234",
      {
        method: "GET",
      },
    );
    const res = await GET_STATUS(req, {
      params: Promise.resolve({ id: "abcd1234" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.status).toBe("pending");
    expect(body.id).toBe("abcd1234");
  });

  test("400 when id is missing or too short", async () => {
    const req = new NextRequest("http://localhost/api/audit-request/x", {
      method: "GET",
    });
    const res = await GET_STATUS(req, {
      params: Promise.resolve({ id: "x" }),
    });
    expect(res.status).toBe(400);
  });
});
