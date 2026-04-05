/**
 * Inventory Feed — Tests
 *
 * Validates the DMS vehicle feed ingestion endpoint:
 *   1. Single vehicle upsert writes to DB
 *   2. Batch upsert writes multiple vehicles
 *   3. VIN validation rejects invalid VINs
 *   4. Shadow mode returns success without DB call
 *   5. Analytics tracked for every vehicle
 *   6. "does not exist" error falls back gracefully
 *   7. Duplicate VIN updates instead of failing
 */

/* eslint-disable @typescript-eslint/no-require-imports */

const mockQuery = jest.fn();

jest.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

jest.mock("@/lib/analytics-hooks", () => ({
  trackSystem: jest.fn(),
}));

import { NextRequest } from "next/server";
import { trackSystem } from "@/lib/analytics-hooks";
import { POST } from "@/app/api/inventory/feed/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVehicle(overrides: Record<string, unknown> = {}) {
  return {
    vin: "1HGBH41JXMN109186",
    year: 2024,
    make: "Honda",
    model: "Civic",
    trim: "EX",
    price: 25000,
    mileage: 15000,
    condition: "Used",
    ...overrides,
  };
}

function makePayload(
  vehicles: Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
) {
  return {
    dealer_id: "dealer_001",
    source: "vauto",
    vehicles,
    ...overrides,
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/inventory/feed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Inventory Feed Endpoint", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/testdb";
    delete process.env.DEALER_FEED_API_KEY;

    // Default: DB returns the row back via RETURNING *
    mockQuery.mockResolvedValue({
      rows: [{ vin: "1HGBH41JXMN109186", make: "Honda" }],
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ------- Single vehicle upsert -------
  it("upserts a single vehicle to the database", async () => {
    const req = makeRequest(makePayload([makeVehicle()]));
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.accepted).toBe(1);
    expect(data.persisted).toBe(1);
    expect(data.vins).toEqual(["1HGBH41JXMN109186"]);

    // Verify DB was called with ON CONFLICT upsert
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("dealer_id, vin");
    expect(params[0]).toBe("dealer_001");
    expect(params[1]).toBe("1HGBH41JXMN109186");
  });

  // ------- Batch upsert -------
  it("upserts multiple vehicles in a batch", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ vin: "1HGBH41JXMN109186" }] })
      .mockResolvedValueOnce({ rows: [{ vin: "2T1BURHE5JC034461" }] })
      .mockResolvedValueOnce({ rows: [{ vin: "3FADP4BJ7JM101234" }] });

    const vehicles = [
      makeVehicle({ vin: "1HGBH41JXMN109186" }),
      makeVehicle({ vin: "2T1BURHE5JC034461" }),
      makeVehicle({ vin: "3FADP4BJ7JM101234" }),
    ];

    const req = makeRequest(makePayload(vehicles));
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.accepted).toBe(3);
    expect(data.persisted).toBe(3);
    expect(data.vins).toHaveLength(3);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  // ------- VIN validation -------
  it("rejects a vehicle with an invalid VIN (too short)", async () => {
    const req = makeRequest(makePayload([makeVehicle({ vin: "SHORT" })]));
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.error).toBe("validation_failed");
    expect(data.details[0].path).toContain("vin");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("rejects a vehicle with an invalid VIN (too long)", async () => {
    const req = makeRequest(
      makePayload([makeVehicle({ vin: "1HGBH41JXMN109186XX" })]),
    );
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.error).toBe("validation_failed");
  });

  // ------- Shadow mode (no DATABASE_URL) -------
  it("returns success in shadow mode without DB call", async () => {
    delete process.env.DATABASE_URL;

    const req = makeRequest(makePayload([makeVehicle()]));
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.accepted).toBe(1);
    expect(data.persisted).toBe(0);
    expect(data.shadow).toBe(1);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ------- Analytics tracking -------
  it("fires trackSystem for every vehicle upserted", async () => {
    const vehicles = [
      makeVehicle({ vin: "1HGBH41JXMN109186" }),
      makeVehicle({ vin: "2T1BURHE5JC034461" }),
    ];
    mockQuery
      .mockResolvedValueOnce({ rows: [{}] })
      .mockResolvedValueOnce({ rows: [{}] });

    const req = makeRequest(makePayload(vehicles));
    await POST(req);

    expect(trackSystem).toHaveBeenCalledTimes(2);
    expect(trackSystem).toHaveBeenCalledWith(
      "system.vehicle_added",
      "dealer_001",
      expect.objectContaining({
        vin: "1HGBH41JXMN109186",
        source: "vauto",
        persisted: true,
      }),
    );
    expect(trackSystem).toHaveBeenCalledWith(
      "system.vehicle_added",
      "dealer_001",
      expect.objectContaining({
        vin: "2T1BURHE5JC034461",
        source: "vauto",
        persisted: true,
      }),
    );
  });

  it("fires trackSystem even in shadow mode", async () => {
    delete process.env.DATABASE_URL;

    const req = makeRequest(makePayload([makeVehicle()]));
    await POST(req);

    expect(trackSystem).toHaveBeenCalledWith(
      "system.vehicle_added",
      "dealer_001",
      expect.objectContaining({
        vin: "1HGBH41JXMN109186",
        persisted: false,
      }),
    );
  });

  // ------- Table does not exist fallback -------
  it("falls back gracefully when vehicles table does not exist", async () => {
    mockQuery.mockRejectedValue(
      new Error('relation "vehicles" does not exist'),
    );

    const req = makeRequest(makePayload([makeVehicle()]));
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.accepted).toBe(1);
    expect(data.persisted).toBe(0);
    expect(data.shadow).toBe(1);
    // Analytics still fires
    expect(trackSystem).toHaveBeenCalledTimes(1);
  });

  // ------- Duplicate VIN updates -------
  it("duplicate VIN triggers update via ON CONFLICT, not failure", async () => {
    // Two calls with the same VIN — both succeed because ON CONFLICT updates
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ vin: "1HGBH41JXMN109186", price: 25000 }],
      })
      .mockResolvedValueOnce({
        rows: [{ vin: "1HGBH41JXMN109186", price: 23000 }],
      });

    // First insert
    const req1 = makeRequest(makePayload([makeVehicle({ price: 25000 })]));
    const res1 = await POST(req1);
    expect(res1.status).toBe(201);

    // Second insert with updated price — same VIN
    const req2 = makeRequest(makePayload([makeVehicle({ price: 23000 })]));
    const res2 = await POST(req2);
    const data2 = await res2.json();

    expect(res2.status).toBe(201);
    expect(data2.persisted).toBe(1);
    // Both queries used ON CONFLICT
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const [sql] = mockQuery.mock.calls[1];
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("DO UPDATE");
  });

  // ------- Auth -------
  it("rejects requests with invalid API key", async () => {
    process.env.DEALER_FEED_API_KEY = "secret-key-123";

    const req = new NextRequest("http://localhost:3000/api/inventory/feed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "wrong-key",
      },
      body: JSON.stringify(makePayload([makeVehicle()])),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("accepts requests with valid API key", async () => {
    process.env.DEALER_FEED_API_KEY = "secret-key-123";

    const req = new NextRequest("http://localhost:3000/api/inventory/feed", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "secret-key-123",
      },
      body: JSON.stringify(makePayload([makeVehicle()])),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  // ------- Invalid JSON -------
  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/inventory/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json at all{{{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid_json");
  });
});
