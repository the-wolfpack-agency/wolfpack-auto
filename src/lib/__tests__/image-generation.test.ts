/**
 * Unit Tests — Image Generation Provider
 *
 * Tests provider health checks, prompt definitions, validation,
 * and the multi-provider fallback architecture.
 */

import {
  getImageProviderStatus,
  isImageGenerationAvailable,
  DEALERSHIP_PROMPTS,
  type DealershipPromptId,
  type ImageProvider,
} from "@/lib/image-generation";

describe("Image Generation Provider", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("Provider Status", () => {
    test("reports fal as unavailable when no key", () => {
      delete process.env.FAL_KEY;
      const status = getImageProviderStatus();
      const fal = status.find((s) => s.provider === "fal");
      expect(fal).toBeDefined();
      expect(fal!.available).toBe(false);
      expect(fal!.reason).toContain("FAL_KEY");
    });

    test("reports fal as available when key set", () => {
      process.env.FAL_KEY = "test-key";
      const status = getImageProviderStatus();
      const fal = status.find((s) => s.provider === "fal");
      expect(fal!.available).toBe(true);
      expect(fal!.reason).toBeUndefined();
    });

    test("reports replicate as unavailable when no token", () => {
      delete process.env.REPLICATE_API_TOKEN;
      const status = getImageProviderStatus();
      const rep = status.find((s) => s.provider === "replicate");
      expect(rep!.available).toBe(false);
    });

    test("reports replicate as available when token set", () => {
      process.env.REPLICATE_API_TOKEN = "test-token";
      const status = getImageProviderStatus();
      const rep = status.find((s) => s.provider === "replicate");
      expect(rep!.available).toBe(true);
    });

    test("returns both providers", () => {
      const status = getImageProviderStatus();
      expect(status).toHaveLength(2);
      const providers = status.map((s) => s.provider);
      expect(providers).toContain("fal");
      expect(providers).toContain("replicate");
    });
  });

  describe("isImageGenerationAvailable", () => {
    test("returns false when no providers configured", () => {
      delete process.env.FAL_KEY;
      delete process.env.REPLICATE_API_TOKEN;
      expect(isImageGenerationAvailable()).toBe(false);
    });

    test("returns true when fal configured", () => {
      process.env.FAL_KEY = "test";
      expect(isImageGenerationAvailable()).toBe(true);
    });

    test("returns true when replicate configured", () => {
      process.env.REPLICATE_API_TOKEN = "test";
      expect(isImageGenerationAvailable()).toBe(true);
    });

    test("returns true when both configured", () => {
      process.env.FAL_KEY = "test";
      process.env.REPLICATE_API_TOKEN = "test";
      expect(isImageGenerationAvailable()).toBe(true);
    });
  });

  describe("Dealership Prompts", () => {
    const PROMPT_IDS: DealershipPromptId[] = [
      "modern_showroom",
      "luxury_dark",
      "outdoor_lot",
      "glass_pavilion",
      "lifestyle_scenic",
    ];

    test("has all 5 dealership prompts", () => {
      expect(Object.keys(DEALERSHIP_PROMPTS)).toHaveLength(5);
    });

    test.each(PROMPT_IDS)("prompt '%s' has required fields", (id) => {
      const prompt = DEALERSHIP_PROMPTS[id];
      expect(prompt.prompt).toBeTruthy();
      expect(prompt.prompt.length).toBeGreaterThan(50);
      expect(prompt.negative_prompt).toBeTruthy();
      expect(prompt.negative_prompt.length).toBeGreaterThan(20);
    });

    test.each(PROMPT_IDS)("prompt '%s' excludes cars and people", (id) => {
      const neg = DEALERSHIP_PROMPTS[id].negative_prompt.toLowerCase();
      expect(neg).toContain("cars");
      expect(neg).toContain("people");
      expect(neg).toContain("text");
      expect(neg).toContain("watermark");
    });

    test.each(PROMPT_IDS)("prompt '%s' specifies empty scene", (id) => {
      const p = DEALERSHIP_PROMPTS[id].prompt.toLowerCase();
      expect(p).toContain("no cars");
      expect(p).toContain("no people");
    });

    test.each(PROMPT_IDS)("prompt '%s' requests high quality", (id) => {
      const p = DEALERSHIP_PROMPTS[id].prompt.toLowerCase();
      expect(p).toContain("ultra realistic");
      expect(p).toContain("high resolution");
    });
  });
});
