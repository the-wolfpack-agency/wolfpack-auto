/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for wolfpack-assistant/vertical-lookup.ts.
 *
 * Validates the read path against `tenant_verticals` (migration 080) +
 * graceful-default behavior when the row is missing / DB is unavailable.
 */

const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
  pool: { connect: jest.fn(), query: jest.fn(), end: jest.fn() },
}));

import {
  DEFAULT_TENANT_VERTICAL,
  getTenantVertical,
  setTenantVertical,
} from "../vertical-lookup";

beforeEach(() => {
  mockQuery.mockReset();
  process.env.DATABASE_URL = "postgres://test";
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe("getTenantVertical", () => {
  test("returns DEFAULT_TENANT_VERTICAL ('auto') when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL;
    const v = await getTenantVertical("11111111-1111-1111-1111-111111111111");
    expect(v).toBe(DEFAULT_TENANT_VERTICAL);
    expect(DEFAULT_TENANT_VERTICAL).toBe("auto");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns DEFAULT_TENANT_VERTICAL when tenant_id is null/undefined/empty", async () => {
    expect(await getTenantVertical(null)).toBe("auto");
    expect(await getTenantVertical(undefined)).toBe("auto");
    expect(await getTenantVertical("")).toBe("auto");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test("returns the stored vertical when the tenant has a row", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ vertical: "retail" }] });
    const v = await getTenantVertical("22222222-2222-2222-2222-222222222222");
    expect(v).toBe("retail");
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/SELECT vertical FROM tenant_verticals WHERE tenant_id = \$1/);
    expect(params).toEqual(["22222222-2222-2222-2222-222222222222"]);
  });

  test("returns DEFAULT when the tenant has no row", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const v = await getTenantVertical("33333333-3333-3333-3333-333333333333");
    expect(v).toBe("auto");
  });

  test("returns DEFAULT when the stored value is unknown", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ vertical: "spaceship" }] });
    const v = await getTenantVertical("33333333-3333-3333-3333-333333333333");
    expect(v).toBe("auto");
  });

  test("falls back to DEFAULT (never throws) on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("db down"));
    const v = await getTenantVertical("33333333-3333-3333-3333-333333333333");
    expect(v).toBe("auto");
  });

  test("handles every concrete tenant vertical", async () => {
    for (const expected of ["auto", "retail", "service", "hospitality"] as const) {
      mockQuery.mockResolvedValueOnce({ rows: [{ vertical: expected }] });
      const v = await getTenantVertical("44444444-4444-4444-4444-444444444444");
      expect(v).toBe(expected);
    }
  });
});

describe("setTenantVertical", () => {
  test("rejects an unknown vertical value", async () => {
    await expect(
      setTenantVertical({ tenant_id: "x", vertical: "spaceship" as any }),
    ).rejects.toThrow(/unknown vertical/);
  });

  test("requires DATABASE_URL", async () => {
    delete process.env.DATABASE_URL;
    await expect(
      setTenantVertical({ tenant_id: "x", vertical: "auto" }),
    ).rejects.toThrow(/DATABASE_URL/);
  });

  test("upserts via INSERT ... ON CONFLICT (tenant_id) DO UPDATE", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const v = await setTenantVertical({
      tenant_id: "55555555-5555-5555-5555-555555555555",
      vertical: "retail",
    });
    expect(v).toBe("retail");
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO tenant_verticals \(tenant_id, vertical\)/);
    expect(sql).toMatch(/ON CONFLICT \(tenant_id\) DO UPDATE/);
    expect(sql).toMatch(/SET vertical = EXCLUDED\.vertical/);
    expect(params).toEqual(["55555555-5555-5555-5555-555555555555", "retail"]);
  });
});
