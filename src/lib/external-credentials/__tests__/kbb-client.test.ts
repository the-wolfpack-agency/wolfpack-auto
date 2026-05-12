/**
 * Tests for the KBB schema-only stub.
 *
 * KBB does NOT issue per-dealer self-serve credentials. The slot is
 * preserved for future-partnership shape. `getKbbValuation` always
 * returns `ok: false` with `upstream_unavailable` so callers can fall
 * back to Edmunds without crashing.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockLoadCred = jest.fn();

jest.mock("@/lib/external-credentials/index", () => ({
  loadCredential: (...args: any[]) => mockLoadCred(...args),
}));

import { getKbbValuation } from "@/lib/external-credentials/kbb-client";

beforeEach(() => {
  mockLoadCred.mockReset();
});

describe("getKbbValuation", () => {
  it("always returns upstream_unavailable today", async () => {
    mockLoadCred.mockResolvedValueOnce(null);
    const res = await getKbbValuation({ dealerId: "d1", vin: "1HGCM82633A123456" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("upstream_unavailable");
      expect(res.error.message).toMatch(/Edmunds/);
    }
  });

  it("still loads the BYO credential row when one exists (read-only)", async () => {
    mockLoadCred.mockResolvedValueOnce({
      plaintext: "key",
      record: { id: "r1", dealerId: "d1", provider: "kbb" },
    });
    const res = await getKbbValuation({ dealerId: "d1", vin: "1HGCM82633A123456" });
    expect(res.ok).toBe(false);
    expect(mockLoadCred).toHaveBeenCalledWith("d1", "kbb", null, { markUsed: false });
  });
});
