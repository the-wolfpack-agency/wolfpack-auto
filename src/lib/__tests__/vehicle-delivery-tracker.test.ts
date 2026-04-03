/**
 * Vehicle Delivery Tracker — Tests
 *
 * Covers: milestone progression, time calculation, slow mover detection,
 * pipeline view, stage validation.
 */

import * as fs from "fs";
import * as path from "path";

jest.mock("@/lib/analytics-hooks", () => ({
  trackVehiclePipeline: jest.fn(),
}));

import {
  acquireVehicle,
  updateMilestone,
  getVehiclePipeline,
  calculateTimeInStage,
  alertSlowMovers,
  getVehicleStatus,
  STAGE_ORDER,
  _resetForTesting,
} from "@/lib/vehicle-delivery-tracker";

beforeEach(() => {
  _resetForTesting();
});

/* ------------------------------------------------------------------ */
/*  Acquisition                                                        */
/* ------------------------------------------------------------------ */

describe("acquireVehicle", () => {
  it("creates vehicle at acquired stage", () => {
    const v = acquireVehicle("VIN-001", "dealer-1", { year: 2025, make: "Honda", model: "Accord" });
    expect(v.vin).toBe("VIN-001");
    expect(v.currentStage).toBe("acquired");
    expect(v.milestones).toHaveLength(1);
    expect(v.vehicleInfo?.make).toBe("Honda");
  });
});

/* ------------------------------------------------------------------ */
/*  Milestone progression                                              */
/* ------------------------------------------------------------------ */

describe("updateMilestone", () => {
  it("advances vehicle to next stage", () => {
    acquireVehicle("VIN-002", "dealer-1");
    const v = updateMilestone("VIN-002", "in_transit");
    expect(v).not.toBeNull();
    expect((v as any).currentStage).toBe("in_transit");
    expect((v as any).milestones).toHaveLength(2);
  });

  it("allows skipping stages", () => {
    acquireVehicle("VIN-003", "dealer-1");
    const v = updateMilestone("VIN-003", "inspection");
    expect(v).not.toBeNull();
    expect((v as any).currentStage).toBe("inspection");
    // Should have intermediate milestones filled
    expect((v as any).milestones.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects backward progression", () => {
    acquireVehicle("VIN-004", "dealer-1");
    updateMilestone("VIN-004", "inspection");
    const result = updateMilestone("VIN-004", "acquired");
    expect(result).toBeNull();
  });

  it("returns null for unknown VIN", () => {
    expect(updateMilestone("UNKNOWN", "listed")).toBeNull();
  });

  it("completes full pipeline", () => {
    acquireVehicle("VIN-005", "dealer-1");
    for (const stage of STAGE_ORDER.slice(1)) {
      const result = updateMilestone("VIN-005", stage);
      expect(result).not.toBeNull();
    }
    const v = getVehicleStatus("VIN-005");
    expect((v as any).currentStage).toBe("delivered");
  });
});

/* ------------------------------------------------------------------ */
/*  Time in stage                                                      */
/* ------------------------------------------------------------------ */

describe("calculateTimeInStage", () => {
  it("returns 0 for unknown VIN", () => {
    expect(calculateTimeInStage("UNKNOWN")).toBe(0);
  });

  it("calculates days since milestone was set", () => {
    acquireVehicle("VIN-TIME", "dealer-1");
    // Just acquired, so should be 0 days
    const days = calculateTimeInStage("VIN-TIME");
    expect(days).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Pipeline view                                                      */
/* ------------------------------------------------------------------ */

describe("getVehiclePipeline", () => {
  it("groups vehicles by stage", () => {
    acquireVehicle("VIN-P1", "dealer-1");
    acquireVehicle("VIN-P2", "dealer-1");
    updateMilestone("VIN-P2", "inspection");
    acquireVehicle("VIN-P3", "dealer-2"); // Different dealer

    const pipeline = getVehiclePipeline("dealer-1");
    expect(pipeline.totalVehicles).toBe(2);
    expect(pipeline.stages.acquired).toHaveLength(1);
    expect(pipeline.stages.inspection).toHaveLength(1);
  });

  it("calculates average time to list", () => {
    acquireVehicle("VIN-AVG", "dealer-1");
    updateMilestone("VIN-AVG", "listed", "2026-04-10T10:00:00Z");
    const pipeline = getVehiclePipeline("dealer-1");
    expect(pipeline.averageTimeToList).toBeGreaterThanOrEqual(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Slow mover detection                                               */
/* ------------------------------------------------------------------ */

describe("alertSlowMovers", () => {
  it("returns empty for fresh vehicles", () => {
    acquireVehicle("VIN-FRESH", "dealer-1");
    const alerts = alertSlowMovers("dealer-1", 7);
    expect(alerts).toHaveLength(0);
  });

  it("skips delivered vehicles", () => {
    acquireVehicle("VIN-DONE", "dealer-1");
    updateMilestone("VIN-DONE", "delivered");
    const alerts = alertSlowMovers("dealer-1", 0); // threshold=0
    expect(alerts).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  File structure                                                     */
/* ------------------------------------------------------------------ */

describe("file structure", () => {
  const base = path.resolve(__dirname, "../../..");

  it("has API route", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/api/admin/vehicle-pipeline/route.ts")),
    ).toBe(true);
  });

  it("has admin page", () => {
    expect(
      fs.existsSync(path.join(base, "src/app/admin/vehicle-pipeline/page.tsx")),
    ).toBe(true);
  });

  it("has sidebar link", () => {
    const sidebar = fs.readFileSync(
      path.join(base, "src/components/AdminSidebar.tsx"),
      "utf-8",
    );
    expect(sidebar).toContain("/admin/vehicle-pipeline");
  });
});
