/**
 * Unit Tests — Background Removal Service
 *
 * Tests provider health checks, validation, and error handling.
 * Now includes fal.ai as primary provider.
 */

import { getProviderHealth, isAIAvailable } from "@/lib/background-removal";

describe("Background Removal Service", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("Provider Health", () => {
    test("reports fal as unavailable when no key", () => {
      delete process.env.FAL_KEY;
      const health = getProviderHealth();
      const fal = health.find((h) => h.provider === "fal");
      expect(fal).toBeDefined();
      expect(fal!.available).toBe(false);
      expect(fal!.reason).toContain("FAL_KEY");
    });

    test("reports fal as available when key set", () => {
      process.env.FAL_KEY = "test-key";
      const health = getProviderHealth();
      const fal = health.find((h) => h.provider === "fal");
      expect(fal!.available).toBe(true);
      expect(fal!.reason).toBeUndefined();
    });

    test("reports replicate as unavailable when no token", () => {
      delete process.env.REPLICATE_API_TOKEN;
      const health = getProviderHealth();
      const replicate = health.find((h) => h.provider === "replicate");
      expect(replicate).toBeDefined();
      expect(replicate!.available).toBe(false);
      expect(replicate!.reason).toContain("REPLICATE_API_TOKEN");
    });

    test("reports replicate as available when token set", () => {
      process.env.REPLICATE_API_TOKEN = "test-token";
      const health = getProviderHealth();
      const replicate = health.find((h) => h.provider === "replicate");
      expect(replicate!.available).toBe(true);
      expect(replicate!.reason).toBeUndefined();
    });

    test("reports remove_bg as unavailable when no key", () => {
      delete process.env.REMOVE_BG_API_KEY;
      const health = getProviderHealth();
      const removeBg = health.find((h) => h.provider === "remove_bg");
      expect(removeBg!.available).toBe(false);
    });

    test("reports remove_bg as available when key set", () => {
      process.env.REMOVE_BG_API_KEY = "test-key";
      const health = getProviderHealth();
      const removeBg = health.find((h) => h.provider === "remove_bg");
      expect(removeBg!.available).toBe(true);
    });

    test("returns all 3 providers", () => {
      const health = getProviderHealth();
      expect(health).toHaveLength(3);
      expect(health.map((h) => h.provider)).toEqual(["fal", "replicate", "remove_bg"]);
    });

    test("fal is listed first (primary)", () => {
      const health = getProviderHealth();
      expect(health[0].provider).toBe("fal");
    });
  });

  describe("isAIAvailable", () => {
    test("returns false when no providers configured", () => {
      delete process.env.FAL_KEY;
      delete process.env.REPLICATE_API_TOKEN;
      delete process.env.REMOVE_BG_API_KEY;
      expect(isAIAvailable()).toBe(false);
    });

    test("returns true when fal configured", () => {
      process.env.FAL_KEY = "test";
      expect(isAIAvailable()).toBe(true);
    });

    test("returns true when replicate configured", () => {
      process.env.REPLICATE_API_TOKEN = "test";
      expect(isAIAvailable()).toBe(true);
    });

    test("returns true when remove_bg configured", () => {
      process.env.REMOVE_BG_API_KEY = "test";
      expect(isAIAvailable()).toBe(true);
    });

    test("returns true when all configured", () => {
      process.env.FAL_KEY = "test";
      process.env.REPLICATE_API_TOKEN = "test";
      process.env.REMOVE_BG_API_KEY = "test";
      expect(isAIAvailable()).toBe(true);
    });
  });
});
