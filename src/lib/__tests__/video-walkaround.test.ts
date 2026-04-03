/**
 * Video Walkaround — Tests
 *
 * Covers: creation, segment management, thumbnail generation,
 * publishing, retrieval, unpublishing.
 */

import * as fs from "fs";
import * as path from "path";

jest.mock("@/lib/analytics-hooks", () => ({
  trackWalkaround: jest.fn(),
}));

import {
  createWalkaround,
  addSegment,
  generateThumbnail,
  publishWalkaround,
  unpublishWalkaround,
  getWalkaroundForVehicle,
  listWalkarounds,
  removeSegment,
  _resetForTesting,
} from "@/lib/video-walkaround";

beforeEach(() => {
  _resetForTesting();
});

/* ------------------------------------------------------------------ */
/*  Creation                                                           */
/* ------------------------------------------------------------------ */

describe("createWalkaround", () => {
  it("creates a draft walkaround for a VIN", () => {
    const wk = createWalkaround("VIN123", "dealer-1");
    expect(wk.id).toBeTruthy();
    expect(wk.vin).toBe("VIN123");
    expect(wk.status).toBe("draft");
    expect(wk.segments).toHaveLength(0);
    expect(wk.metadata.completeness).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Segment management                                                 */
/* ------------------------------------------------------------------ */

describe("addSegment", () => {
  it("adds a segment and updates metadata", () => {
    const wk = createWalkaround("VIN456", "dealer-1");
    const updated = addSegment(wk.id, "exterior_front", "/vid/front.mp4", 30);
    expect(updated).not.toBeNull();
    expect((updated as any).segments).toHaveLength(1);
    expect((updated as any).status).toBe("recording");
    expect((updated as any).metadata.totalDuration).toBe(30);
    expect((updated as any).metadata.completeness).toBeGreaterThan(0);
  });

  it("returns null for unknown walkaround", () => {
    const result = addSegment("nonexistent", "interior", "/vid.mp4");
    expect(result).toBeNull();
  });

  it("prevents adding segments to published walkaround", () => {
    const wk = createWalkaround("VIN789", "dealer-1");
    addSegment(wk.id, "exterior_front", "/vid.mp4");
    publishWalkaround(wk.id);
    const result = addSegment(wk.id, "interior", "/vid2.mp4");
    expect(result).toBeNull();
  });
});

describe("removeSegment", () => {
  it("removes a segment and updates metadata", () => {
    const wk = createWalkaround("VIN-REM", "dealer-1");
    const updated = addSegment(wk.id, "exterior_front", "/vid.mp4", 30);
    const segId = (updated as any).segments[0].id;
    const result = removeSegment(wk.id, segId);
    expect(result).not.toBeNull();
    expect((result as any).segments).toHaveLength(0);
    expect((result as any).metadata.totalDuration).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Thumbnail generation                                               */
/* ------------------------------------------------------------------ */

describe("generateThumbnail", () => {
  it("generates a thumb URL from video URL", () => {
    expect(generateThumbnail("/videos/car.mp4")).toBe("/videos/car-thumb.jpg");
    expect(generateThumbnail("/uploads/test.webm")).toBe("/uploads/test-thumb.jpg");
  });
});

/* ------------------------------------------------------------------ */
/*  Publishing                                                         */
/* ------------------------------------------------------------------ */

describe("publishWalkaround", () => {
  it("publishes a walkaround with segments", () => {
    const wk = createWalkaround("VIN-PUB", "dealer-1");
    addSegment(wk.id, "exterior_front", "/vid.mp4");
    addSegment(wk.id, "interior", "/vid2.mp4");
    const published = publishWalkaround(wk.id);
    expect(published).not.toBeNull();
    expect((published as any).status).toBe("published");
    expect((published as any).publishedAt).toBeTruthy();
    // Thumbnails should be generated
    (published as any).segments.forEach((s) => {
      expect(s.thumbnailUrl).toBeTruthy();
    });
  });

  it("returns null if no segments", () => {
    const wk = createWalkaround("VIN-EMPTY", "dealer-1");
    expect(publishWalkaround(wk.id)).toBeNull();
  });
});

describe("unpublishWalkaround", () => {
  it("reverts published walkaround to complete", () => {
    const wk = createWalkaround("VIN-UNPUB", "dealer-1");
    addSegment(wk.id, "exterior_front", "/vid.mp4");
    publishWalkaround(wk.id);
    const result = unpublishWalkaround(wk.id);
    expect(result).not.toBeNull();
    expect((result as any).status).toBe("complete");
    expect((result as any).publishedAt).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Retrieval                                                          */
/* ------------------------------------------------------------------ */

describe("getWalkaroundForVehicle", () => {
  it("returns published walkaround by VIN", () => {
    const wk = createWalkaround("VIN-FIND", "dealer-1");
    addSegment(wk.id, "exterior_front", "/vid.mp4");
    publishWalkaround(wk.id);
    const found = getWalkaroundForVehicle("VIN-FIND");
    expect(found).not.toBeNull();
    expect((found as any).vin).toBe("VIN-FIND");
  });

  it("returns null for unpublished walkaround", () => {
    createWalkaround("VIN-DRAFT", "dealer-1");
    expect(getWalkaroundForVehicle("VIN-DRAFT")).toBeNull();
  });
});

describe("listWalkarounds", () => {
  it("lists walkarounds for a dealer", () => {
    createWalkaround("VIN-A", "dealer-1");
    createWalkaround("VIN-B", "dealer-1");
    createWalkaround("VIN-C", "dealer-2");
    expect(listWalkarounds("dealer-1")).toHaveLength(2);
    expect(listWalkarounds("dealer-2")).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  File structure                                                     */
/* ------------------------------------------------------------------ */

describe("file structure", () => {
  const base = path.resolve(__dirname, "../../..");

  it("has API route", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/api/admin/walkarounds/route.ts")),
    ).toBe(true);
  });

  it("has admin page", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/admin/walkarounds/page.tsx")),
    ).toBe(true);
  });

  it("has sidebar link", () => {
    const sidebar = fs.readFileSync(
      path.join(base, "src/components/AdminSidebar.tsx"),
      "utf-8",
    );
    expect(sidebar).toContain("/admin/walkarounds");
  });
});
