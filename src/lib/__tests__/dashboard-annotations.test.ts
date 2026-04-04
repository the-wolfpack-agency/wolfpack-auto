/**
 * Dashboard Annotations — Tests
 *
 * Covers: CRUD, date range filtering, type filtering.
 */

import * as fs from "fs";
import * as path from "path";

jest.mock("@/lib/analytics-hooks", () => ({
  trackAnnotation: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  query: jest.fn(),
}));

import {
  createAnnotation,
  getAnnotationsForRange,
  getAnnotationsForDashboard,
  getAnnotationsByType,
  getAnnotation,
  updateAnnotation,
  deleteAnnotation,
  _resetForTesting,
} from "@/lib/dashboard-annotations";

beforeEach(() => {
  _resetForTesting();
  delete process.env.DATABASE_URL;
});

/* ------------------------------------------------------------------ */
/*  Create                                                             */
/* ------------------------------------------------------------------ */

describe("createAnnotation", () => {
  it("creates an annotation with all fields", async () => {
    const ann = await createAnnotation({
      dashboardId: "main",
      date: "2026-04-01",
      text: "Spring campaign started",
      type: "campaign",
      createdBy: "admin",
    });
    expect(ann.id).toBeTruthy();
    expect(ann.dashboardId).toBe("main");
    expect(ann.date).toBe("2026-04-01");
    expect(ann.text).toBe("Spring campaign started");
    expect(ann.type).toBe("campaign");
    expect(ann.createdBy).toBe("admin");
  });

  it("defaults createdBy to system", async () => {
    const ann = await createAnnotation({
      dashboardId: "leads",
      date: "2026-04-02",
      text: "Auto-generated alert",
      type: "alert",
    });
    expect(ann.createdBy).toBe("system");
  });
});

/* ------------------------------------------------------------------ */
/*  Read                                                               */
/* ------------------------------------------------------------------ */

describe("getAnnotation", () => {
  it("retrieves by ID", async () => {
    const ann = await createAnnotation({
      dashboardId: "main",
      date: "2026-04-01",
      text: "Test",
      type: "note",
    });
    const found = await getAnnotation(ann.id);
    expect(found).not.toBeNull();
    expect((found as any).text).toBe("Test");
  });

  it("returns null for unknown ID", async () => {
    expect(await getAnnotation("nonexistent")).toBeNull();
  });
});

describe("getAnnotationsForDashboard", () => {
  it("returns all annotations for a dashboard", async () => {
    await createAnnotation({ dashboardId: "main", date: "2026-04-01", text: "A", type: "note" });
    await createAnnotation({ dashboardId: "main", date: "2026-04-02", text: "B", type: "milestone" });
    await createAnnotation({ dashboardId: "leads", date: "2026-04-01", text: "C", type: "note" });

    const main = await getAnnotationsForDashboard("main");
    expect(main).toHaveLength(2);
    const leads = await getAnnotationsForDashboard("leads");
    expect(leads).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Date range filtering                                               */
/* ------------------------------------------------------------------ */

describe("getAnnotationsForRange", () => {
  it("filters by date range", async () => {
    await createAnnotation({ dashboardId: "main", date: "2026-03-15", text: "Before", type: "note" });
    await createAnnotation({ dashboardId: "main", date: "2026-04-01", text: "In range", type: "note" });
    await createAnnotation({ dashboardId: "main", date: "2026-04-15", text: "After", type: "note" });

    const results = await getAnnotationsForRange("main", "2026-03-20", "2026-04-10");
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("In range");
  });

  it("returns empty for no matches", async () => {
    await createAnnotation({ dashboardId: "main", date: "2026-01-01", text: "Old", type: "note" });
    const results = await getAnnotationsForRange("main", "2026-06-01", "2026-07-01");
    expect(results).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Type filtering                                                     */
/* ------------------------------------------------------------------ */

describe("getAnnotationsByType", () => {
  it("filters by annotation type", async () => {
    await createAnnotation({ dashboardId: "main", date: "2026-04-01", text: "Note", type: "note" });
    await createAnnotation({ dashboardId: "main", date: "2026-04-02", text: "Alert", type: "alert" });
    await createAnnotation({ dashboardId: "main", date: "2026-04-03", text: "Note 2", type: "note" });

    expect(await getAnnotationsByType("main", "note")).toHaveLength(2);
    expect(await getAnnotationsByType("main", "alert")).toHaveLength(1);
    expect(await getAnnotationsByType("main", "campaign")).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Update                                                             */
/* ------------------------------------------------------------------ */

describe("updateAnnotation", () => {
  it("updates text and type", async () => {
    const ann = await createAnnotation({
      dashboardId: "main",
      date: "2026-04-01",
      text: "Original",
      type: "note",
    });
    const updated = await updateAnnotation(ann.id, { text: "Updated", type: "milestone" });
    expect(updated).not.toBeNull();
    expect((updated as any).text).toBe("Updated");
    expect((updated as any).type).toBe("milestone");
  });

  it("returns null for unknown ID", async () => {
    expect(await updateAnnotation("fake", { text: "x" })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  Delete                                                             */
/* ------------------------------------------------------------------ */

describe("deleteAnnotation", () => {
  it("deletes an annotation", async () => {
    const ann = await createAnnotation({
      dashboardId: "main",
      date: "2026-04-01",
      text: "To delete",
      type: "note",
    });
    expect(await deleteAnnotation(ann.id)).toBe(true);
    expect(await getAnnotation(ann.id)).toBeNull();
  });

  it("returns false for unknown ID", async () => {
    expect(await deleteAnnotation("nonexistent")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  File structure                                                     */
/* ------------------------------------------------------------------ */

describe("file structure", () => {
  const base = path.resolve(__dirname, "../../..");

  it("has API route", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/api/admin/annotations/route.ts")),
    ).toBe(true);
  });
});
