/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for the operator-auth guard.
 *
 * Verifies the role-rank logic and the strict separation between dealer
 * and wolfpack-staff sessions (a dealer "owner" must NOT pass).
 */

const mockGetServerSession = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...a: any[]) => mockGetServerSession(...a),
}));
jest.mock("@/lib/analytics-hooks", () => ({
  trackSecurity: jest.fn(),
}));

import { NextRequest } from "next/server";
import { requireWolfpackStaff, isWolfpackStaff } from "../operator-auth";

function req(path = "/api/operator/test"): NextRequest {
  return new NextRequest(`https://x.test${path}`);
}

beforeEach(() => {
  mockGetServerSession.mockReset();
});

describe("requireWolfpackStaff", () => {
  test("401 when no session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const result = await requireWolfpackStaff(req());
    expect(isWolfpackStaff(result)).toBe(false);
    if (!isWolfpackStaff(result)) {
      expect(result.status).toBe(401);
    }
  });

  test("401 when session is a dealer (not wolfpack_staff)", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "u1", email: "u@d.com", name: "U", dealer_id: "d1", role: "owner" },
      kind: "dealer",
    });
    const result = await requireWolfpackStaff(req());
    expect(isWolfpackStaff(result)).toBe(false);
    if (!isWolfpackStaff(result)) {
      expect(result.status).toBe(401);
    }
  });

  test("200 when staff session, viewer role can read", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "s1", email: "s@a.com", name: "S", dealer_id: "wolfpack-staff", role: "wolfpack_viewer" },
      kind: "wolfpack_staff",
      staff_id: "s1",
      staff_role: "viewer",
    });
    const result = await requireWolfpackStaff(req());
    expect(isWolfpackStaff(result)).toBe(true);
    if (isWolfpackStaff(result)) {
      expect(result.staff.role).toBe("viewer");
    }
  });

  test("403 when viewer attempts operator action", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "s1", email: "s@a.com", name: "S", dealer_id: "wolfpack-staff", role: "wolfpack_viewer" },
      kind: "wolfpack_staff",
      staff_id: "s1",
      staff_role: "viewer",
    });
    const result = await requireWolfpackStaff(req(), "operator");
    expect(isWolfpackStaff(result)).toBe(false);
    if (!isWolfpackStaff(result)) {
      expect(result.status).toBe(403);
    }
  });

  test("403 when operator attempts admin action", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "s1", email: "s@a.com", name: "S", dealer_id: "wolfpack-staff", role: "wolfpack_operator" },
      kind: "wolfpack_staff",
      staff_id: "s1",
      staff_role: "operator",
    });
    const result = await requireWolfpackStaff(req(), "admin");
    expect(isWolfpackStaff(result)).toBe(false);
    if (!isWolfpackStaff(result)) {
      expect(result.status).toBe(403);
    }
  });

  test("200 when admin satisfies admin action", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "s1", email: "s@a.com", name: "S", dealer_id: "wolfpack-staff", role: "wolfpack_admin" },
      kind: "wolfpack_staff",
      staff_id: "s1",
      staff_role: "admin",
    });
    const result = await requireWolfpackStaff(req(), "admin");
    expect(isWolfpackStaff(result)).toBe(true);
  });
});
