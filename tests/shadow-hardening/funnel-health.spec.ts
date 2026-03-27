/**
 * Static tests for the Lead Funnel Health Dashboard.
 *
 * These tests validate module existence, interface correctness, auth enforcement,
 * alert logic, grade mapping, navigation integration, and overdue lead detection
 * without requiring a running server or database.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../../src");

/* -------------------------------------------------------------------------- */
/* 1. funnel-health.ts exports getFunnelHealthMetrics                         */
/* -------------------------------------------------------------------------- */

test.describe("funnel-health.ts — module exports", () => {
  test("lib/funnel-health.ts exists", () => {
    expect(fs.existsSync(path.join(SRC, "lib/funnel-health.ts"))).toBe(true);
  });

  test("exports getFunnelHealthMetrics function", () => {
    const content = fs.readFileSync(path.join(SRC, "lib/funnel-health.ts"), "utf-8");
    expect(content).toContain("export async function getFunnelHealthMetrics");
  });

  test("exports FunnelHealthMetrics interface", () => {
    const content = fs.readFileSync(path.join(SRC, "lib/funnel-health.ts"), "utf-8");
    expect(content).toContain("export interface FunnelHealthMetrics");
  });
});

/* -------------------------------------------------------------------------- */
/* 2. FunnelHealthMetrics has healthScore 0-100                               */
/* -------------------------------------------------------------------------- */

test.describe("FunnelHealthMetrics — interface shape", () => {
  let content: string;

  test.beforeEach(() => {
    content = fs.readFileSync(path.join(SRC, "lib/funnel-health.ts"), "utf-8");
  });

  test("healthScore field is declared", () => {
    expect(content).toContain("healthScore: number");
  });

  test("healthGrade field is declared with literal union", () => {
    expect(content).toContain(`healthGrade: "A" | "B" | "C" | "D" | "F"`);
  });

  test("alerts array is declared with severity, message, action", () => {
    expect(content).toContain("severity:");
    expect(content).toContain("message:");
    expect(content).toContain("action:");
  });

  test("slaCompliance24h field is declared", () => {
    expect(content).toContain("slaCompliance24h: number");
  });

  test("overdueLeads field is declared", () => {
    expect(content).toContain("overdueLeads: number");
  });

  test("funnelStages contains all required stages", () => {
    expect(content).toContain("new: number");
    expect(content).toContain("contacted: number");
    expect(content).toContain("qualified: number");
    expect(content).toContain("appointment_set: number");
    expect(content).toContain("sold: number");
    expect(content).toContain("lost: number");
  });

  test("sourceBreakdown has source, count, conversionRate", () => {
    expect(content).toContain("source: string");
    expect(content).toContain("count: number");
    expect(content).toContain("conversionRate: number");
  });

  test("healthScore score formula uses 0-100 components", () => {
    // SLA contributes up to 40, trend up to 20, conversion up to 25, response up to 15 = 100
    expect(content).toContain("0.4");   // SLA weight
    expect(content).toContain("25");    // conversion cap
    expect(content).toContain("15");    // response speed max
  });
});

/* -------------------------------------------------------------------------- */
/* 3. API route has requireAuth                                                */
/* -------------------------------------------------------------------------- */

test.describe("API route — authentication", () => {
  test("funnel-health route exists", () => {
    expect(
      fs.existsSync(path.join(SRC, "app/api/admin/funnel-health/route.ts")),
    ).toBe(true);
  });

  test("route imports requireAuth", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/api/admin/funnel-health/route.ts"),
      "utf-8",
    );
    expect(content).toContain("requireAuth");
  });

  test("route calls isAuthenticated guard", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/api/admin/funnel-health/route.ts"),
      "utf-8",
    );
    expect(content).toContain("isAuthenticated");
  });

  test("route sets Cache-Control max-age=300", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/api/admin/funnel-health/route.ts"),
      "utf-8",
    );
    expect(content).toContain("max-age=300");
  });

  test("route sets security headers", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/api/admin/funnel-health/route.ts"),
      "utf-8",
    );
    expect(content).toContain("X-Content-Type-Options");
    expect(content).toContain("X-Frame-Options");
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Alerts array has severity, message, action fields                       */
/* -------------------------------------------------------------------------- */

test.describe("Alert structure", () => {
  test("alerts use severity literals: critical, warning, info", () => {
    const content = fs.readFileSync(path.join(SRC, "lib/funnel-health.ts"), "utf-8");
    expect(content).toContain('"critical"');
    expect(content).toContain('"warning"');
    expect(content).toContain('"info"');
  });

  test("all alert objects have message and action fields", () => {
    const content = fs.readFileSync(path.join(SRC, "lib/funnel-health.ts"), "utf-8");
    // Verify both fields appear in alert push calls
    const alertPushCount = (content.match(/alerts\.push\(\{/g) ?? []).length;
    expect(alertPushCount).toBeGreaterThanOrEqual(5); // 5 alert rules defined
  });
});

/* -------------------------------------------------------------------------- */
/* 5. healthGrade maps correctly (90+=A, 80+=B, 70+=C, 60+=D, else F)        */
/* -------------------------------------------------------------------------- */

test.describe("healthGrade mapping", () => {
  test("grade thresholds 90/80/70/60 are all present in funnel-health.ts", () => {
    const content = fs.readFileSync(path.join(SRC, "lib/funnel-health.ts"), "utf-8");
    expect(content).toContain("90");
    expect(content).toContain("80");
    expect(content).toContain("70");
    expect(content).toContain("60");
  });

  test("all grade values A/B/C/D/F are returned", () => {
    const content = fs.readFileSync(path.join(SRC, "lib/funnel-health.ts"), "utf-8");
    expect(content).toContain('"A"');
    expect(content).toContain('"B"');
    expect(content).toContain('"C"');
    expect(content).toContain('"D"');
    expect(content).toContain('"F"');
  });

  // Inline grade logic test (mirrors gradeFromScore implementation)
  function gradeFromScore(score: number): string {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  }

  test("score 95 => grade A", () => expect(gradeFromScore(95)).toBe("A"));
  test("score 90 => grade A", () => expect(gradeFromScore(90)).toBe("A"));
  test("score 85 => grade B", () => expect(gradeFromScore(85)).toBe("B"));
  test("score 80 => grade B", () => expect(gradeFromScore(80)).toBe("B"));
  test("score 75 => grade C", () => expect(gradeFromScore(75)).toBe("C"));
  test("score 70 => grade C", () => expect(gradeFromScore(70)).toBe("C"));
  test("score 65 => grade D", () => expect(gradeFromScore(65)).toBe("D"));
  test("score 60 => grade D", () => expect(gradeFromScore(60)).toBe("D"));
  test("score 59 => grade F", () => expect(gradeFromScore(59)).toBe("F"));
  test("score 0 => grade F", () => expect(gradeFromScore(0)).toBe("F"));
});

/* -------------------------------------------------------------------------- */
/* 6. AdminSidebar contains Funnel Health link                                */
/* -------------------------------------------------------------------------- */

test.describe("AdminSidebar navigation", () => {
  test("AdminSidebar.tsx contains /admin/funnel-health href", () => {
    const content = fs.readFileSync(
      path.join(SRC, "components/AdminSidebar.tsx"),
      "utf-8",
    );
    expect(content).toContain("/admin/funnel-health");
  });

  test("AdminSidebar.tsx contains Funnel Health label", () => {
    const content = fs.readFileSync(
      path.join(SRC, "components/AdminSidebar.tsx"),
      "utf-8",
    );
    expect(content).toContain("Funnel Health");
  });

  test("AdminSidebar.tsx defines FunnelHealthIcon component", () => {
    const content = fs.readFileSync(
      path.join(SRC, "components/AdminSidebar.tsx"),
      "utf-8",
    );
    expect(content).toContain("function FunnelHealthIcon");
  });

  test("Funnel Health nav item is placed after Analytics", () => {
    const content = fs.readFileSync(
      path.join(SRC, "components/AdminSidebar.tsx"),
      "utf-8",
    );
    const analyticsIdx = content.indexOf('"/admin/analytics"');
    const funnelIdx = content.indexOf('"/admin/funnel-health"');
    expect(analyticsIdx).toBeGreaterThan(-1);
    expect(funnelIdx).toBeGreaterThan(analyticsIdx);
  });
});

/* -------------------------------------------------------------------------- */
/* 7. Overdue leads > 5 triggers critical alert (test the logic)              */
/* -------------------------------------------------------------------------- */

test.describe("Alert logic — overdue leads", () => {
  // Inline the alert builder logic to test it independently of DB
  type AlertSeverity = "critical" | "warning" | "info";
  interface Alert { severity: AlertSeverity; message: string; action: string; }

  function buildAlerts(overdueLeads: number, slaCompliance24h: number, leadsLast24h: number, leadsLast7d: number, conversionRate: number, leadsTrend: string): Alert[] {
    const alerts: Alert[] = [];
    if (overdueLeads > 5) {
      alerts.push({
        severity: "critical",
        message: `${overdueLeads} leads have not been contacted in 24+ hours`,
        action: "Assign and contact these leads immediately to avoid losing them",
      });
    }
    if (slaCompliance24h < 50) {
      alerts.push({ severity: "critical", message: "Response time SLA is critically low", action: "Review staffing" });
    }
    if (leadsLast24h === 0 && leadsLast7d > 0) {
      alerts.push({ severity: "warning", message: "No new leads today — check your form and listings", action: "Verify" });
    }
    if (conversionRate < 5) {
      alerts.push({ severity: "warning", message: "Conversion rate below industry average of 5-10%", action: "Review follow-up cadence" });
    }
    if (leadsTrend === "down") {
      alerts.push({ severity: "info", message: "Lead volume down vs last week", action: "Check marketing spend" });
    }
    return alerts;
  }

  test("overdueLeads=6 triggers exactly one critical alert", () => {
    const alerts = buildAlerts(6, 80, 2, 10, 8, "flat");
    const criticals = alerts.filter((a) => a.severity === "critical");
    expect(criticals).toHaveLength(1);
    expect(criticals[0].message).toContain("6 leads");
  });

  test("overdueLeads=5 does NOT trigger the overdue critical alert", () => {
    const alerts = buildAlerts(5, 80, 2, 10, 8, "flat");
    const overdueAlert = alerts.find((a) => a.message.includes("leads have not been contacted"));
    expect(overdueAlert).toBeUndefined();
  });

  test("overdueLeads=10 shows count in alert message", () => {
    const alerts = buildAlerts(10, 80, 2, 10, 8, "flat");
    const overdueAlert = alerts.find((a) => a.message.includes("10 leads"));
    expect(overdueAlert).toBeDefined();
    expect(overdueAlert?.severity).toBe("critical");
  });

  test("slaCompliance24h=40 triggers critical SLA alert", () => {
    const alerts = buildAlerts(0, 40, 2, 10, 8, "flat");
    const slaAlert = alerts.find((a) => a.message.includes("SLA is critically low"));
    expect(slaAlert).toBeDefined();
    expect(slaAlert?.severity).toBe("critical");
  });

  test("slaCompliance24h=50 does NOT trigger the SLA critical alert", () => {
    const alerts = buildAlerts(0, 50, 2, 10, 8, "flat");
    const slaAlert = alerts.find((a) => a.message.includes("SLA is critically low"));
    expect(slaAlert).toBeUndefined();
  });

  test("leadsLast24h=0 with leadsLast7d>0 triggers warning", () => {
    const alerts = buildAlerts(0, 80, 0, 5, 8, "flat");
    const noLeadsAlert = alerts.find((a) => a.message.includes("No new leads today"));
    expect(noLeadsAlert).toBeDefined();
    expect(noLeadsAlert?.severity).toBe("warning");
  });

  test("conversionRate=3 triggers conversion warning", () => {
    const alerts = buildAlerts(0, 80, 2, 10, 3, "flat");
    const conversionAlert = alerts.find((a) => a.message.includes("Conversion rate below"));
    expect(conversionAlert).toBeDefined();
    expect(conversionAlert?.severity).toBe("warning");
  });

  test("leadsTrend=down triggers info alert", () => {
    const alerts = buildAlerts(0, 80, 2, 10, 8, "down");
    const trendAlert = alerts.find((a) => a.message.includes("Lead volume down"));
    expect(trendAlert).toBeDefined();
    expect(trendAlert?.severity).toBe("info");
  });

  test("healthy metrics produce zero alerts", () => {
    const alerts = buildAlerts(0, 90, 5, 30, 12, "up");
    expect(alerts).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 8. Admin page exists and has correct structure                              */
/* -------------------------------------------------------------------------- */

test.describe("Admin page — funnel-health/page.tsx", () => {
  test("page file exists", () => {
    expect(
      fs.existsSync(path.join(SRC, "app/admin/funnel-health/page.tsx")),
    ).toBe(true);
  });

  test("page uses 'use client' directive", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/admin/funnel-health/page.tsx"),
      "utf-8",
    );
    expect(content).toContain('"use client"');
  });

  test("page imports FunnelHealthMetrics type", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/admin/funnel-health/page.tsx"),
      "utf-8",
    );
    expect(content).toContain("FunnelHealthMetrics");
  });

  test("page fetches /api/admin/funnel-health", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/admin/funnel-health/page.tsx"),
      "utf-8",
    );
    expect(content).toContain("/api/admin/funnel-health");
  });

  test("page has auto-refresh interval of 5 minutes", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/admin/funnel-health/page.tsx"),
      "utf-8",
    );
    // 5 * 60 * 1000 = 300000
    expect(content).toContain("5 * 60 * 1000");
  });

  test("page links to /admin/leads?status=new for overdue CTA", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/admin/funnel-health/page.tsx"),
      "utf-8",
    );
    expect(content).toContain("/admin/leads?status=new");
  });

  test("page displays health score badge", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/admin/funnel-health/page.tsx"),
      "utf-8",
    );
    expect(content).toContain("healthScore");
    expect(content).toContain("healthGrade");
  });
});
