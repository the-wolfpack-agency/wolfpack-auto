/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for the shared dealer-creation logic.
 *
 * Covers the validation paths, the shadow-mode (no DATABASE_URL) branch,
 * and the slug uniqueness check.
 */

const mockQuery = jest.fn();
const mockHash = jest.fn();

jest.mock("@/lib/db", () => ({
  query: (...a: any[]) => mockQuery(...a),
}));
jest.mock("bcryptjs", () => ({
  hash: (...a: any[]) => mockHash(...a),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackSystem: jest.fn(),
}));

import { sanitizeSlug, generateTempPassword, createDealer } from "../dealers/create-dealer";

beforeEach(() => {
  mockQuery.mockReset();
  mockHash.mockReset();
  mockHash.mockResolvedValue("hashed");
});

afterEach(() => {
  delete process.env.DATABASE_URL;
});

describe("sanitizeSlug", () => {
  test("lowercases, replaces non-url chars, collapses dashes", () => {
    expect(sanitizeSlug("ACME Motors!! Inc.")).toBe("acme-motors-inc");
  });
  test("strips leading/trailing dashes", () => {
    expect(sanitizeSlug("--acme--motors--")).toBe("acme-motors");
  });
});

describe("generateTempPassword", () => {
  test("meets project password validator", () => {
    const pw = generateTempPassword();
    expect(pw.length).toBeGreaterThanOrEqual(12);
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
    expect(/[^A-Za-z0-9]/.test(pw)).toBe(true);
  });
});

describe("createDealer (shadow mode)", () => {
  test("returns ok with synthetic id when DATABASE_URL is absent", async () => {
    delete process.env.DATABASE_URL;
    const result = await createDealer({ name: "ACME", slug: "acme" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dealer.slug).toBe("acme");
      expect(result.admin_credentials.email).toBe("admin@acme.com");
    }
  });

  test("rejects missing name", async () => {
    delete process.env.DATABASE_URL;
    const result = await createDealer({ name: "", slug: "x" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  test("rejects empty slug after sanitization", async () => {
    delete process.env.DATABASE_URL;
    const result = await createDealer({ name: "X", slug: "!!!" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});

describe("createDealer (DB mode)", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://test";
  });

  test("409 when slug is taken", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "existing" }] });
    const result = await createDealer({ name: "ACME", slug: "acme" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
  });

  test("201-shape on happy path", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // uniqueness
      .mockResolvedValueOnce({ rows: [{ id: "d1", name: "ACME", slug: "acme" }] }) // insert dealer
      .mockResolvedValueOnce({ rows: [] }) // dealer_users
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }); // webhook

    const result = await createDealer({ name: "ACME", slug: "acme", email: "owner@acme.com" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dealer.id).toBe("d1");
      expect(result.admin_credentials.email).toBe("owner@acme.com");
    }
  });
});
