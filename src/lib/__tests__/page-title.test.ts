/**
 * Per-dealer page-title helper (Fix 4).
 *
 * - Under a real (non-seed) dealer context, title is "<page> | <dealer.name>".
 * - On the unbranded demo URL (no dealer context, defaults to seed
 *   "Wolfpack Motors"), title falls back to "<page> | Wolfpack Auto"
 *   (the PLATFORM name, never the seed dealer).
 */

/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock("@/lib/dealer-config", () => {
  const DEFAULT_CONFIG = {
    id: "wolfpack-motors",
    name: "Wolfpack Motors",
    tagline: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    logo_url: null,
    primary_color: "",
    secondary_color: "",
    accent_color: "",
    business_hours: {},
    social: {},
  };
  return {
    DEFAULT_CONFIG,
    getDealerConfig: jest.fn(),
  };
});

import { getDealerConfig } from "@/lib/dealer-config";
import { getDealerBrandedTitle, brandedTitle } from "@/lib/page-title";

const mockedGetConfig = getDealerConfig as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getDealerBrandedTitle — Fix 4", () => {
  test("uses the dealer name when a real (non-seed) dealer is resolved", async () => {
    mockedGetConfig.mockResolvedValueOnce({ name: "Mile High Motors" });
    const t = await getDealerBrandedTitle("Inventory");
    expect(t).toBe("Inventory | Mile High Motors");
  });

  test('falls back to "Wolfpack Auto" (platform name) on the unbranded seed dealer', async () => {
    mockedGetConfig.mockResolvedValueOnce({ name: "Wolfpack Motors" });
    const t = await getDealerBrandedTitle("Pricing");
    expect(t).toBe("Pricing | Wolfpack Auto");
  });

  test('falls back to platform name when dealer config throws', async () => {
    mockedGetConfig.mockRejectedValueOnce(new Error("db down"));
    const t = await getDealerBrandedTitle("Pricing");
    expect(t).toBe("Pricing | Wolfpack Auto");
  });

  test("never returns a competitor / seed brand in the suffix", async () => {
    mockedGetConfig.mockResolvedValueOnce({ name: "Wolfpack Motors" });
    const t = await getDealerBrandedTitle("Free F&I Penetration Audit");
    expect(t).not.toContain("Wolfpack Motors");
  });
});

describe("brandedTitle (sync helper)", () => {
  test("returns dealer-branded title when a real dealer name is passed", () => {
    expect(brandedTitle("Inventory", "Summit Auto")).toBe("Inventory | Summit Auto");
  });

  test("returns platform fallback when dealer name is null/seed/empty", () => {
    expect(brandedTitle("Inventory", null)).toBe("Inventory | Wolfpack Auto");
    expect(brandedTitle("Inventory", "")).toBe("Inventory | Wolfpack Auto");
    expect(brandedTitle("Inventory", "Wolfpack Motors")).toBe(
      "Inventory | Wolfpack Auto",
    );
  });
});
