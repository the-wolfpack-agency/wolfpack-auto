/**
 * Persistence + cache tests for the title-lien module.
 *
 * The Postgres `query` import is mocked at the boundary so the suite never
 * touches a real DB. Cache hit / miss / expiry / shadow-mode are exercised
 * via the same dispatcher contract used by the route handler.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...args: any[]) => mockQuery(...args),
}));

import {
  getCachedTitleLien,
  loadOrFetchTitleLien,
  upsertTitleLienCache,
} from "@/lib/title-lien/persistence";

const DEALER = "00000000-0000-4000-a000-000000000001";
const VEHICLE = "00000000-0000-4000-b000-000000000002";
const VIN = "1HGCM82633A123456";

beforeEach(() => {
  mockQuery.mockReset();
  process.env.DATABASE_URL = "postgresql://test";
});

describe("getCachedTitleLien", () => {
  it("returns null in shadow mode (no DATABASE_URL)", async () => {
    delete process.env.DATABASE_URL;
    const r = await getCachedTitleLien(VIN, "FL");
    expect(r).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns null on cache miss", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await getCachedTitleLien(VIN, "FL");
    expect(r).toBeNull();
  });

  it("returns the cached row marked source:'cache' on hit", async () => {
    const looked_up_at = new Date().toISOString();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          vin: VIN,
          state_code: "FL",
          raw_response: { foo: "bar" },
          has_lien: true,
          lienholder_name: "BANK",
          title_status: "CLEAN",
          source: "fl_flhsmv",
          supported: true,
          unsupported_reason: null,
          looked_up_at,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    });
    const r = await getCachedTitleLien(VIN, "FL");
    expect(r).not.toBeNull();
    expect(r!.source).toBe("cache");
    expect(r!.has_lien).toBe(true);
    expect(r!.supported).toBe(true);
    expect(r!.lienholder_name).toBe("BANK");
  });

  it("normalizes vin + state to upper-case for the query", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getCachedTitleLien("1hgcm82633a123456", "fl");
    const [, args] = mockQuery.mock.calls[0];
    expect(args).toEqual([VIN, "FL"]);
  });
});

describe("upsertTitleLienCache", () => {
  it("is a no-op when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    await upsertTitleLienCache(DEALER, VEHICLE, {
      vin: VIN,
      state_code: "FL",
      supported: false,
      reason: "paid_subscription_required",
      source: "unsupported",
      looked_up_at: new Date().toISOString(),
    });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("upserts on (vin, state_code)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await upsertTitleLienCache(DEALER, VEHICLE, {
      vin: VIN,
      state_code: "FL",
      supported: false,
      reason: "paid_subscription_required",
      source: "unsupported",
      looked_up_at: new Date().toISOString(),
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, args] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO vehicle_title_lookups/);
    expect(sql).toMatch(/ON CONFLICT \(vin, state_code\) DO UPDATE/);
    expect(args[0]).toBe(DEALER);
    expect(args[1]).toBe(VEHICLE);
    expect(args[2]).toBe(VIN);
    expect(args[3]).toBe("FL");
  });
});

describe("loadOrFetchTitleLien", () => {
  it("returns cached row on hit and does NOT call the upsert path", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          vin: VIN,
          state_code: "FL",
          raw_response: {},
          has_lien: false,
          lienholder_name: null,
          title_status: null,
          source: "fl_flhsmv",
          supported: true,
          unsupported_reason: null,
          looked_up_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    });
    const r = await loadOrFetchTitleLien(DEALER, VEHICLE, VIN, "FL");
    expect(r.source).toBe("cache");
    expect(mockQuery).toHaveBeenCalledTimes(1); // only the SELECT
  });

  it("on miss: dispatches, upserts, returns fresh", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // cache miss
    mockQuery.mockResolvedValueOnce({ rows: [] }); // upsert
    const r = await loadOrFetchTitleLien(DEALER, VEHICLE, VIN, "FL");
    // FL is honest-stub today
    expect(r.supported).toBe(false);
    expect(r.reason).toBe("paid_subscription_required");
    expect(mockQuery).toHaveBeenCalledTimes(2);
    const upsertSql = mockQuery.mock.calls[1][0] as string;
    expect(upsertSql).toMatch(/INSERT INTO vehicle_title_lookups/);
  });

  it("does not throw when cache read fails (continues to fresh fetch + upsert)", async () => {
    mockQuery.mockRejectedValueOnce(new Error("db down"));
    mockQuery.mockResolvedValueOnce({ rows: [] }); // upsert succeeds
    const r = await loadOrFetchTitleLien(DEALER, VEHICLE, VIN, "FL");
    expect(r.supported).toBe(false);
    expect(r.reason).toBe("paid_subscription_required");
  });

  it("does not throw when upsert fails", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // miss
    mockQuery.mockRejectedValueOnce(new Error("db down"));
    const r = await loadOrFetchTitleLien(DEALER, VEHICLE, VIN, "FL");
    expect(r.supported).toBe(false);
  });

  it("works in shadow mode with no DB calls", async () => {
    delete process.env.DATABASE_URL;
    const r = await loadOrFetchTitleLien(DEALER, VEHICLE, VIN, "FL");
    expect(r).toBeDefined();
    expect(r.state_code).toBe("FL");
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
