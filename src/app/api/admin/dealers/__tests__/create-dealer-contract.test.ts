/**
 * POST /api/admin/dealers — the contract that was broken.
 *
 * An `admin` submitting the new-dealer form got 403 and the page said
 * "Failed to create dealer (403)". Every real person on the account is an
 * `admin`, so onboarding a client through the UI was impossible.
 *
 * This drives the handler with each role and asserts the outcome, rather than
 * only inspecting the role constant, so the wiring is covered too.
 */

export {};

let currentRole = "admin";

jest.mock("@/lib/auth-guard", () => ({
  requireAuth: jest.fn(async () => ({ user: { id: "u1", dealer_id: "d1", role: currentRole } })),
  isAuthenticated: (r: unknown) => !(r instanceof Response),
  requireRole: jest.fn(async (roles: string[]) => {
    if (!roles.includes(currentRole)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), { status: 403 });
    }
    return { user: { id: "u1", dealer_id: "d1", role: currentRole } };
  }),
}));

const mockCreateDealer = jest.fn();
jest.mock("@/lib/dealers/create-dealer", () => ({
  createDealer: (...a: unknown[]) => mockCreateDealer(...a),
}));
jest.mock("@/lib/analytics-hooks", () => ({ trackSystem: jest.fn() }));

import { POST } from "../route";

const req = (body: unknown) =>
  ({ json: async () => body } as unknown as Parameters<typeof POST>[0]);

const VALID = { name: "Acme Motors", slug: "acme-motors" };

beforeEach(() => {
  jest.clearAllMocks();
  currentRole = "admin";
  mockCreateDealer.mockResolvedValue({
    ok: true,
    dealer: { id: "d9", name: "Acme Motors", slug: "acme-motors" },
    public_url: "/dealers/acme-motors",
    admin_url: "/admin?dealer=acme-motors",
    admin_credentials: { email: "a@b.c", temp_password: "x" },
  });
});

describe("who can create a dealer", () => {
  it("an admin can, which is the whole bug", async () => {
    // Before the fix this returned 403 for every real user of the product.
    const res = await POST(req(VALID));
    expect(res.status).toBe(201);
    expect(mockCreateDealer).toHaveBeenCalled();
  });

  it("an owner still can", async () => {
    currentRole = "owner";
    expect((await POST(req(VALID))).status).toBe(201);
  });

  it.each([["manager"], ["staff"], ["sub_dealer"]])("a %s cannot", async (role) => {
    // Fixing a lockout must not hand dealer creation to everybody.
    currentRole = role;
    const res = await POST(req(VALID));
    expect(res.status).toBe(403);
    expect(mockCreateDealer).not.toHaveBeenCalled();
  });
});

describe("what it passes through", () => {
  it("forwards the logo so a new dealer can have one", async () => {
    // The file is chosen before the dealer exists, so it rides on the create.
    const logo = "data:image/png;base64,AAAA";
    await POST(req({ ...VALID, logo_url: logo }));
    expect(mockCreateDealer).toHaveBeenCalledWith(expect.objectContaining({ logo_url: logo }));
  });

  it("surfaces a creation failure with its own status", async () => {
    mockCreateDealer.mockResolvedValue({ ok: false, status: 409, error: 'Slug "acme" is already taken' });
    const res = await POST(req(VALID));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already taken/);
  });

  it("400s on a body that is not JSON", async () => {
    const bad = { json: async () => { throw new Error("bad"); } } as unknown as Parameters<typeof POST>[0];
    expect((await POST(bad)).status).toBe(400);
  });
});
