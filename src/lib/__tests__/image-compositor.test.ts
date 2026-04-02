/**
 * Unit Tests �� Image Compositor
 *
 * Tests compositing pipeline with real Sharp operations.
 * Uses a tiny 4x4 PNG as test input to keep tests fast.
 */

import sharp from "sharp";
import { compositeVehicle, generateCompositeThumbnail, generateQuickPreview } from "@/lib/image-compositor";

/* ------------------------------------------------------------------ */
/*  Test fixtures                                                      */
/* ------------------------------------------------------------------ */

/** Create a tiny 4x4 transparent PNG for testing */
async function createTestCutout(): Promise<Buffer> {
  return sharp({
    create: {
      width: 100,
      height: 60,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 128 },
    },
  })
    .png()
    .toBuffer();
}

/** Create a tiny background image */
async function createTestBackground(): Promise<Buffer> {
  return sharp({
    create: {
      width: 200,
      height: 120,
      channels: 3,
      background: { r: 0, g: 100, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();
}

/* ------------------------------------------------------------------ */
/*  Compositing                                                        */
/* ------------------------------------------------------------------ */

describe("Image Compositor", () => {
  let cutout: Buffer;
  let background: Buffer;

  beforeAll(async () => {
    cutout = await createTestCutout();
    background = await createTestBackground();
  });

  describe("compositeVehicle", () => {
    test("composites with custom background image", async () => {
      const result = await compositeVehicle({
        cutout_buffer: cutout,
        background_buffer: background,
        options: {
          output_width: 320,
          output_height: 180,
          add_shadow: false,
          add_reflection: false,
          output_format: "webp",
          output_quality: 80,
        },
      });

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.format).toBe("webp");
      expect(result.width).toBe(320);
      expect(result.height).toBe(180);
      expect(result.size).toBeGreaterThan(0);
      expect(result.processing_ms).toBeGreaterThanOrEqual(0);
    });

    test("composites with CSS gradient", async () => {
      const result = await compositeVehicle({
        cutout_buffer: cutout,
        background_css: "background: linear-gradient(180deg, #1a1a2e 0%, #0f3460 100%);",
        options: {
          output_width: 320,
          output_height: 180,
          add_shadow: false,
          add_reflection: false,
        },
      });

      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.width).toBe(320);
    });

    test("falls back to white gradient when no background provided", async () => {
      const result = await compositeVehicle({
        cutout_buffer: cutout,
        options: {
          output_width: 200,
          output_height: 120,
          add_shadow: false,
          add_reflection: false,
        },
      });

      expect(result.buffer.length).toBeGreaterThan(0);
    });

    test("adds shadow when enabled", async () => {
      const withShadow = await compositeVehicle({
        cutout_buffer: cutout,
        background_css: "background: linear-gradient(180deg, #fff 0%, #eee 100%);",
        options: {
          output_width: 320,
          output_height: 180,
          add_shadow: true,
          add_reflection: false,
        },
      });

      const withoutShadow = await compositeVehicle({
        cutout_buffer: cutout,
        background_css: "background: linear-gradient(180deg, #fff 0%, #eee 100%);",
        options: {
          output_width: 320,
          output_height: 180,
          add_shadow: false,
          add_reflection: false,
        },
      });

      // Both should produce valid images (sizes may differ)
      expect(withShadow.buffer.length).toBeGreaterThan(0);
      expect(withoutShadow.buffer.length).toBeGreaterThan(0);
    });

    test("supports different output formats", async () => {
      const webp = await compositeVehicle({
        cutout_buffer: cutout,
        background_css: "background: #fff;",
        options: { output_width: 200, output_height: 120, add_shadow: false, add_reflection: false, output_format: "webp" },
      });

      const jpeg = await compositeVehicle({
        cutout_buffer: cutout,
        background_css: "background: #fff;",
        options: { output_width: 200, output_height: 120, add_shadow: false, add_reflection: false, output_format: "jpeg" },
      });

      const png = await compositeVehicle({
        cutout_buffer: cutout,
        background_css: "background: #fff;",
        options: { output_width: 200, output_height: 120, add_shadow: false, add_reflection: false, output_format: "png" },
      });

      expect(webp.format).toBe("webp");
      expect(jpeg.format).toBe("jpeg");
      expect(png.format).toBe("png");
    });

    test("respects vehicle position (left, center, right)", async () => {
      const positions = ["left", "center", "right"] as const;

      for (const pos of positions) {
        const result = await compositeVehicle({
          cutout_buffer: cutout,
          background_css: "background: #fff;",
          options: {
            output_width: 320,
            output_height: 180,
            add_shadow: false,
            add_reflection: false,
            vehicle_position: pos,
          },
        });
        expect(result.buffer.length).toBeGreaterThan(0);
      }
    });
  });

  describe("generateCompositeThumbnail", () => {
    test("generates thumbnail from composite buffer", async () => {
      const composite = await compositeVehicle({
        cutout_buffer: cutout,
        background_css: "background: #fff;",
        options: { output_width: 640, output_height: 360, add_shadow: false, add_reflection: false },
      });

      const thumb = await generateCompositeThumbnail(composite.buffer, 320, 180);
      expect(thumb.buffer.length).toBeGreaterThan(0);
      expect(thumb.width).toBe(320);
      expect(thumb.height).toBe(180);
      expect(thumb.size).toBeGreaterThan(0);
    });

    test("uses default dimensions when not specified", async () => {
      const composite = await compositeVehicle({
        cutout_buffer: cutout,
        background_css: "background: #fff;",
        options: { output_width: 640, output_height: 360, add_shadow: false, add_reflection: false },
      });

      const thumb = await generateCompositeThumbnail(composite.buffer);
      expect(thumb.width).toBe(480);
      expect(thumb.height).toBe(270);
    });
  });

  describe("generateQuickPreview", () => {
    test("generates lower-resolution preview", async () => {
      const preview = await generateQuickPreview({
        cutout_buffer: cutout,
        background_css: "background: linear-gradient(180deg, #000 0%, #333 100%);",
      });

      expect(preview.width).toBe(640);
      expect(preview.height).toBe(360);
      expect(preview.format).toBe("webp");
      expect(preview.buffer.length).toBeGreaterThan(0);
    });
  });
});
