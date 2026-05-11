/**
 * Contract tests for the public pre-qualification API.
 *
 * Each route is tested for: 200/201, 400 (validation), 429 (rate-limit),
 * 404 (missing session). DB + rate-limit + session-store are mocked so
 * the suite runs without infrastructure.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest } from "next/server";

const mockRateLimit = jest.fn();
jest.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}));

const mockCreateSession = jest.fn();
const mockGetSession = jest.fn();
const mockRecordCreditPull = jest.fn();
const mockRecordIncome = jest.fn();
const mockRecordOffers = jest.fn();
const mockGetOffers = jest.fn();
jest.mock("@/lib/prequal/session-store", () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  getSession: (...args: unknown[]) => mockGetSession(...args),
  recordCreditPull: (...args: unknown[]) => mockRecordCreditPull(...args),
  recordIncome: (...args: unknown[]) => mockRecordIncome(...args),
  recordOffers: (...args: unknown[]) => mockRecordOffers(...args),
  getOffers: (...args: unknown[]) => mockGetOffers(...args),
}));

const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import { POST as startPOST } from "@/app/api/prequal/start/route";
import { POST as creditPOST } from "@/app/api/prequal/[id]/credit/route";
import { POST as incomePOST } from "@/app/api/prequal/[id]/income/route";
import { GET as offersGET } from "@/app/api/prequal/[id]/offers/route";

const ORIGINAL_ENV = { ...process.env };
const VALID_UUID = "11111111-2222-3333-4444-555555555555";

function mkRequest(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): NextRequest {
  const bodyText =
    init.body === undefined
      ? undefined
      : typeof init.body === "string"
        ? init.body
        : JSON.stringify(init.body);
  return new NextRequest(url, {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: bodyText,
    // Next.js types disagree with the WHATWG types here; cast through unknown.
  } as unknown as ConstructorParameters<typeof NextRequest>[1]);
}

const allowed = { allowed: true, remaining: 5, resetAt: Date.now() / 1000 + 60 };
const denied = { allowed: false, remaining: 0, resetAt: Date.now() / 1000 + 60 };

beforeEach(() => {
  mockRateLimit.mockReset();
  mockRateLimit.mockResolvedValue(allowed);
  mockCreateSession.mockReset();
  mockGetSession.mockReset();
  mockRecordCreditPull.mockReset();
  mockRecordIncome.mockReset();
  mockRecordOffers.mockReset();
  mockGetOffers.mockReset();
  mockQuery.mockReset();
  process.env = { ...ORIGINAL_ENV, DATABASE_URL: "postgres://test" };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

/* -------------------------------------------------------------------------- */
/* POST /api/prequal/start                                                    */
/* -------------------------------------------------------------------------- */

describe("POST /api/prequal/start", () => {
  const validBody = {
    dealer_id: VALID_UUID,
    customer_name: "Alex Tester",
    customer_email: "alex@example.com",
    customer_phone: "+15555550100",
    vehicle_interest_text: "2023 Toyota Tacoma",
  };

  it("returns 201 with a session id on happy path", async () => {
    mockCreateSession.mockResolvedValue({
      id: "session-1",
      startedAt: "2026-05-11T12:00:00Z",
    });
    const res = await startPOST(
      mkRequest("http://test/api/prequal/start", { body: validBody }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.session_id).toBe("session-1");
    expect(mockCreateSession).toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await startPOST(
      mkRequest("http://test/api/prequal/start", { body: "not-json" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on missing fields", async () => {
    const res = await startPOST(
      mkRequest("http://test/api/prequal/start", {
        body: { dealer_id: VALID_UUID }, // missing everything else
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid email", async () => {
    const res = await startPOST(
      mkRequest("http://test/api/prequal/start", {
        body: { ...validBody, customer_email: "not-an-email" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 429 when IP rate-limit trips", async () => {
    mockRateLimit.mockResolvedValueOnce(denied); // first call denied
    const res = await startPOST(
      mkRequest("http://test/api/prequal/start", { body: validBody }),
    );
    expect(res.status).toBe(429);
  });

  it("returns 429 when email rate-limit trips", async () => {
    mockRateLimit
      .mockResolvedValueOnce(allowed) // ip pass
      .mockResolvedValueOnce(denied); // email deny
    const res = await startPOST(
      mkRequest("http://test/api/prequal/start", { body: validBody }),
    );
    expect(res.status).toBe(429);
  });

  it("returns 201 queued response when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    const res = await startPOST(
      mkRequest("http://test/api/prequal/start", { body: validBody }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(String(body.session_id)).toMatch(/^queued-/);
  });
});

/* -------------------------------------------------------------------------- */
/* POST /api/prequal/[id]/credit                                              */
/* -------------------------------------------------------------------------- */

describe("POST /api/prequal/[id]/credit", () => {
  it("returns 200 with tier on happy path", async () => {
    mockGetSession.mockResolvedValue({
      id: VALID_UUID,
      dealer_id: "d1",
      customer_name: "Alex",
      customer_email: "alex@example.com",
      customer_phone: null,
      vehicle_interest_text: "Tacoma",
      status: "started",
      started_at: "2026-05-11T12:00:00Z",
      completed_at: null,
      ip_address: null,
      user_agent: null,
    });
    mockRecordCreditPull.mockResolvedValue(undefined);

    const res = await creditPOST(
      mkRequest("http://test/api/prequal/x/credit", { body: { consent: true } }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tier).toBeDefined();
    expect(body.is_mock).toBe(true);
    expect(mockRecordCreditPull).toHaveBeenCalled();
  });

  it("returns 400 on invalid session id format", async () => {
    const res = await creditPOST(
      mkRequest("http://test/api/prequal/x/credit", { body: { consent: true } }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when consent is missing", async () => {
    const res = await creditPOST(
      mkRequest("http://test/api/prequal/x/credit", { body: {} }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when session does not exist", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await creditPOST(
      mkRequest("http://test/api/prequal/x/credit", { body: { consent: true } }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 429 when session rate limit trips", async () => {
    mockRateLimit.mockResolvedValueOnce(denied);
    const res = await creditPOST(
      mkRequest("http://test/api/prequal/x/credit", { body: { consent: true } }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(res.status).toBe(429);
  });
});

/* -------------------------------------------------------------------------- */
/* POST /api/prequal/[id]/income                                              */
/* -------------------------------------------------------------------------- */

describe("POST /api/prequal/[id]/income", () => {
  const ok = { amount_cents: 600_000, cadence: "monthly" };

  it("returns 200 on happy path", async () => {
    mockGetSession.mockResolvedValue({
      id: VALID_UUID,
      dealer_id: "d1",
      customer_name: "Alex",
      customer_email: "alex@example.com",
      customer_phone: null,
      vehicle_interest_text: "Tacoma",
      status: "credit_pulled",
      started_at: "2026-05-11T12:00:00Z",
      completed_at: null,
      ip_address: null,
      user_agent: null,
    });
    mockRecordIncome.mockResolvedValue(undefined);

    const res = await incomePOST(
      mkRequest("http://test/api/prequal/x/income", { body: ok }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.income_monthly_cents).toBe(600_000);
    expect(body.confidence).toBe("self_reported");
  });

  it("returns 400 on negative amount", async () => {
    const res = await incomePOST(
      mkRequest("http://test/api/prequal/x/income", {
        body: { amount_cents: -1, cadence: "monthly" },
      }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid cadence", async () => {
    const res = await incomePOST(
      mkRequest("http://test/api/prequal/x/income", {
        body: { amount_cents: 500_000, cadence: "weekly" },
      }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when session does not exist", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await incomePOST(
      mkRequest("http://test/api/prequal/x/income", { body: ok }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 429 when rate-limited", async () => {
    mockRateLimit.mockResolvedValueOnce(denied);
    const res = await incomePOST(
      mkRequest("http://test/api/prequal/x/income", { body: ok }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(res.status).toBe(429);
  });
});

/* -------------------------------------------------------------------------- */
/* GET /api/prequal/[id]/offers                                               */
/* -------------------------------------------------------------------------- */

describe("GET /api/prequal/[id]/offers", () => {
  function setHappyPathDbMocks() {
    mockGetSession.mockResolvedValue({
      id: VALID_UUID,
      dealer_id: "d1",
      customer_name: "Alex",
      customer_email: "alex@example.com",
      customer_phone: null,
      vehicle_interest_text: "2023 Toyota Tacoma",
      status: "income_verified",
      started_at: "2026-05-11T12:00:00Z",
      completed_at: null,
      ip_address: null,
      user_agent: null,
    });
    // credit row
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            bureau_used: "mock",
            score_range_min: 700,
            score_range_max: 750,
            tier: "prime",
          },
        ],
      } as any)
      // income row
      .mockResolvedValueOnce({
        rows: [
          {
            income_monthly_cents: "700000",
            income_confidence: "self_reported",
          },
        ],
      } as any);
    mockRecordOffers.mockResolvedValue(undefined);
    mockGetOffers.mockResolvedValue([
      {
        lenderId: "prime-bank",
        lenderName: "Prime Bank Auto",
        maxAmountCents: 3_500_000,
        aprBps: 699,
        termMonths: 72,
        conditions: {},
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        estimatedMonthlyPaymentCents: 60_000,
      },
    ]);
  }

  it("returns 200 with offer array on happy path", async () => {
    setHappyPathDbMocks();
    const res = await offersGET(
      mkRequest("http://test/api/prequal/x/offers", { method: "GET" }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.offer_count).toBe(1);
    expect(body.offers[0].lender_id).toBe("prime-bank");
  });

  it("returns 400 on invalid session id format", async () => {
    const res = await offersGET(
      mkRequest("http://test/api/prequal/x/offers", { method: "GET" }),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when session is missing", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await offersGET(
      mkRequest("http://test/api/prequal/x/offers", { method: "GET" }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when credit + income are missing", async () => {
    mockGetSession.mockResolvedValue({
      id: VALID_UUID,
      dealer_id: "d1",
      customer_name: "Alex",
      customer_email: "alex@example.com",
      customer_phone: null,
      vehicle_interest_text: "Tacoma",
      status: "started",
      started_at: "x",
      completed_at: null,
      ip_address: null,
      user_agent: null,
    });
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [] } as any);
    const res = await offersGET(
      mkRequest("http://test/api/prequal/x/offers", { method: "GET" }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.missing_steps).toEqual(expect.arrayContaining(["credit", "income"]));
  });

  it("returns 429 when rate-limited", async () => {
    mockRateLimit.mockResolvedValueOnce(denied);
    const res = await offersGET(
      mkRequest("http://test/api/prequal/x/offers", { method: "GET" }),
      { params: Promise.resolve({ id: VALID_UUID }) },
    );
    expect(res.status).toBe(429);
  });
});
