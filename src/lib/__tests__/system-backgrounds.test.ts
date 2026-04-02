/**
 * Unit Tests — System Backgrounds
 *
 * Validates that all 6 system backgrounds generate correctly,
 * produce valid images, and the metadata API works.
 */

import sharp from "sharp";
import {
  SYSTEM_BACKGROUNDS,
  generateAllSystemBackgrounds,
  generateSystemBackground,
  generateOptimizedVariants,
  getSystemBackgroundIds,
  getSystemBackgroundMeta,
} from "@/lib/system-backgrounds";

describe("System Backgrounds", () => {
  describe("Definitions", () => {
    test("has exactly 6 system backgrounds", () => {
      expect(SYSTEM_BACKGROUNDS).toHaveLength(6);
    });

    test("each background has required fields", () => {
      for (const bg of SYSTEM_BACKGROUNDS) {
        expect(bg.id).toBeTruthy();
        expect(bg.id).toMatch(/^system_/);
        expect(bg.name).toBeTruthy();
        expect(bg.description).toBeTruthy();
        expect(bg.category).toBeTruthy();
        expect(Array.isArray(bg.tags)).toBe(true);
        expect(bg.tags.length).toBeGreaterThan(0);
        expect(typeof bg.generate).toBe("function");
      }
    });

    test("all IDs are unique", () => {
      const ids = SYSTEM_BACKGROUNDS.map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    test("covers expected categories", () => {
      const categories = new Set(SYSTEM_BACKGROUNDS.map((b) => b.category));
      expect(categories.has("studio")).toBe(true);
      expect(categories.has("outdoor")).toBe(true);
      expect(categories.has("lifestyle")).toBe(true);
      expect(categories.has("branded")).toBe(true);
    });
  });

  describe("getSystemBackgroundIds", () => {
    test("returns all 6 IDs", () => {
      const ids = getSystemBackgroundIds();
      expect(ids).toHaveLength(6);
      expect(ids).toContain("system_white_studio");
      expect(ids).toContain("system_dark_studio");
      expect(ids).toContain("system_showroom");
      expect(ids).toContain("system_outdoor_lot");
      expect(ids).toContain("system_lifestyle");
      expect(ids).toContain("system_branded");
    });
  });

  describe("getSystemBackgroundMeta", () => {
    test("returns metadata without generate function", () => {
      const meta = getSystemBackgroundMeta();
      expect(meta).toHaveLength(6);
      for (const m of meta) {
        expect(m.id).toBeTruthy();
        expect(m.name).toBeTruthy();
        expect((m as any).generate).toBeUndefined();
      }
    });
  });

  describe("Individual generation", () => {
    test.each([
      "system_white_studio",
      "system_dark_studio",
      "system_showroom",
      "system_outdoor_lot",
      "system_lifestyle",
      "system_branded",
    ])("generates %s as valid PNG", async (id) => {
      const bg = await generateSystemBackground(id, 640, 360);
      expect(bg).not.toBeNull();
      expect(bg!.id).toBe(id);
      expect(bg!.buffer).toBeInstanceOf(Buffer);
      expect(bg!.buffer.length).toBeGreaterThan(1000);
      expect(bg!.width).toBe(640);
      expect(bg!.height).toBe(360);
      expect(bg!.size).toBeGreaterThan(0);

      // Verify it's a valid image via Sharp
      const metadata = await sharp(bg!.buffer).metadata();
      expect(metadata.format).toBe("png");
      expect(metadata.width).toBe(640);
      expect(metadata.height).toBe(360);
    });

    test("returns null for unknown ID", async () => {
      const bg = await generateSystemBackground("nonexistent");
      expect(bg).toBeNull();
    });

    test("branded gradient accepts custom colors", async () => {
      const bg = await generateSystemBackground("system_branded", 320, 180, {
        primaryColor: "#ff0000",
        secondaryColor: "#00ff00",
      });
      expect(bg).not.toBeNull();
      expect(bg!.buffer.length).toBeGreaterThan(0);
    });

    test("respects custom dimensions", async () => {
      const bg = await generateSystemBackground("system_white_studio", 800, 450);
      expect(bg!.width).toBe(800);
      expect(bg!.height).toBe(450);
    });
  });

  describe("Batch generation", () => {
    test("generates all 6 backgrounds", async () => {
      const all = await generateAllSystemBackgrounds(320, 180);
      expect(all).toHaveLength(6);

      for (const bg of all) {
        expect(bg.buffer).toBeInstanceOf(Buffer);
        expect(bg.buffer.length).toBeGreaterThan(0);
        expect(bg.width).toBe(320);
        expect(bg.height).toBe(180);
        expect(bg.name).toBeTruthy();
      }
    });

    test("each background is a distinct image", async () => {
      const all = await generateAllSystemBackgrounds(320, 180);
      const sizes = all.map((b) => b.size);
      // All backgrounds should have different file sizes (different content)
      const uniqueSizes = new Set(sizes);
      expect(uniqueSizes.size).toBeGreaterThanOrEqual(4); // allow some coincidental matches
    });
  });

  describe("Optimized variants", () => {
    test("generates WebP optimized + thumbnail", async () => {
      const bg = await generateSystemBackground("system_white_studio", 640, 360);
      const variants = await generateOptimizedVariants(bg!.buffer);

      expect(variants.optimized).toBeInstanceOf(Buffer);
      expect(variants.thumbnail).toBeInstanceOf(Buffer);
      expect(variants.optimizedSize).toBeGreaterThan(0);
      expect(variants.thumbnailSize).toBeGreaterThan(0);

      // Optimized should be WebP
      const optMeta = await sharp(variants.optimized).metadata();
      expect(optMeta.format).toBe("webp");

      // Thumbnail should be 480x270
      const thumbMeta = await sharp(variants.thumbnail).metadata();
      expect(thumbMeta.format).toBe("webp");
      expect(thumbMeta.width).toBe(480);
      expect(thumbMeta.height).toBe(270);
    });

    test("optimized is smaller than original PNG", async () => {
      const bg = await generateSystemBackground("system_outdoor_lot", 1920, 1080);
      const variants = await generateOptimizedVariants(bg!.buffer);
      // WebP should be significantly smaller than PNG
      expect(variants.optimizedSize).toBeLessThan(bg!.size);
    });

    test("thumbnail is smaller than optimized", async () => {
      const bg = await generateSystemBackground("system_showroom", 640, 360);
      const variants = await generateOptimizedVariants(bg!.buffer);
      expect(variants.thumbnailSize).toBeLessThan(variants.optimizedSize);
    });
  });
});
