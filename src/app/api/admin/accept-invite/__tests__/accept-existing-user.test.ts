/**
 * Accepting an invite when you already have an account.
 *
 * The lookup required `is_active = false` on top of a valid token. Anybody who
 * already had an account therefore could never accept: their row keeps
 * is_active = true, the query returned nothing, and the page told somebody
 * holding a perfectly good link "Invalid or expired invitation".
 *
 * That is the normal case when a dealer is created for an address that is
 * already a user, which is what happened on 2026-08-03 while onboarding a
 * client.
 *
 * The token is the credential and is sufficient by itself: 32 random bytes,
 * emailed only to its own address, 7-day expiry, cleared on use so it works
 * exactly once.
 */

export {};

const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({ query: (...a: unknown[]) => mockQuery(...a) }));
jest.mock("@/lib/analytics-hooks", () => ({ trackSystem: jest.fn() }));
jest.mock("bcryptjs", () => ({ hash: async () => "hashed" }));

import { POST } from "../route";

const req = (body: unknown) => ({ json: async () => body } as unknown as Parameters<typeof POST>[0]);
const GOOD = { token: "a".repeat(64), password: "a-good-password" };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DATABASE_URL = "postgresql://test";
  mockQuery.mockResolvedValue({ rows: [{ id: "u1", dealer_id: "d1", email: "e@x.test", name: "N", role: "owner" }] });
});

describe("the lookup", () => {
  it("does NOT require is_active = false", async () => {
    // The regression, stated directly.
    await POST(req(GOOD));
    const select = mockQuery.mock.calls[0][0] as string;
    expect(select).toMatch(/SELECT/i);
    expect(select).not.toMatch(/is_active\s*=\s*false/i);
  });

  it("still requires the token to be unexpired", async () => {
    // Dropping is_active must not also drop the expiry.
    await POST(req(GOOD));
    expect(mockQuery.mock.calls[0][0]).toMatch(/invite_expires_at\s*>\s*NOW\(\)/i);
  });

  it("looks the row up by the token", async () => {
    await POST(req(GOOD));
    expect(mockQuery.mock.calls[0][0]).toMatch(/invite_token\s*=\s*\$1/i);
    expect(mockQuery.mock.calls[0][1]).toEqual([GOOD.token]);
  });
});

describe("an existing active user", () => {
  it("can accept and gets a new password", async () => {
    const res = await POST(req(GOOD));
    expect(res.status).not.toBe(400);
    const update = mockQuery.mock.calls[1][0] as string;
    expect(update).toMatch(/UPDATE dealer_users/i);
    expect(update).toMatch(/password_hash/);
  });

  it("burns the token, so a link works exactly once", async () => {
    await POST(req(GOOD));
    const update = mockQuery.mock.calls[1][0] as string;
    expect(update).toMatch(/invite_token\s*=\s*NULL/i);
    expect(update).toMatch(/invite_expires_at\s*=\s*NULL/i);
  });

  it("activates the account", async () => {
    await POST(req(GOOD));
    expect(mockQuery.mock.calls[1][0]).toMatch(/is_active\s*=\s*true/i);
  });
});

describe("still refused", () => {
  it("400s when no row matches the token", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const res = await POST(req(GOOD));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid or expired/);
  });

  it("400s on a short password", async () => {
    const res = await POST(req({ token: GOOD.token, password: "short" }));
    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("400s with no token", async () => {
    expect((await POST(req({ password: "a-good-password" }))).status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
