/**
 * Unit Tests — Payroll Integration
 *
 * Tests commission calculation, time entry processing,
 * pay period summaries, and provider status.
 */

import {
  calculateDealCommission,
  calculatePayPeriodCommissions,
  calculateHours,
  calculateWeeklyOvertime,
  buildPayPeriodSummary,
  getPayrollProviderStatus,
  type CommissionPlan,
  type EmployeeRecord,
  type TimeEntry,
  type CommissionEntry,
} from "@/lib/payroll-integration";

describe("Payroll Integration", () => {
  describe("Commission Calculation", () => {
    const flatPlan: CommissionPlan = {
      name: "Standard 25%",
      type: "flat_pct",
      flat_rate: 25,
      minimum_per_deal: 200,
    };

    const tieredPlan: CommissionPlan = {
      name: "Tiered Performance",
      type: "tiered",
      tiers: [
        { min_gross: 0, max_gross: 1500, pct: 20 },
        { min_gross: 1501, max_gross: 3000, pct: 25 },
        { min_gross: 3001, max_gross: 100000, pct: 30 },
      ],
      minimum_per_deal: 150,
    };

    const drawPlan: CommissionPlan = {
      name: "Draw vs Commission",
      type: "draw_vs_commission",
      flat_rate: 25,
      draw_amount: 3000,
      minimum_per_deal: 100,
    };

    test("flat percentage commission", () => {
      expect(calculateDealCommission(4000, flatPlan)).toBe(1000); // 25% of $4000
    });

    test("minimum commission applies when below threshold", () => {
      expect(calculateDealCommission(500, flatPlan)).toBe(200); // min is $200
    });

    test("zero or negative gross returns minimum", () => {
      expect(calculateDealCommission(0, flatPlan)).toBe(200);
      expect(calculateDealCommission(-500, flatPlan)).toBe(200);
    });

    test("tiered commission - low tier", () => {
      expect(calculateDealCommission(1000, tieredPlan)).toBe(200); // 20% of $1000
    });

    test("tiered commission - mid tier", () => {
      expect(calculateDealCommission(2000, tieredPlan)).toBe(500); // 25% of $2000
    });

    test("tiered commission - high tier", () => {
      expect(calculateDealCommission(5000, tieredPlan)).toBe(1500); // 30% of $5000
    });

    test("tiered commission - above all tiers uses highest", () => {
      expect(calculateDealCommission(200000, tieredPlan)).toBe(60000); // 30%
    });

    test("draw plan calculates commission", () => {
      expect(calculateDealCommission(4000, drawPlan)).toBe(1000); // 25%
    });

    test("pay period commissions sums correctly", () => {
      const deals = [
        { gross_profit: 3000, source_type: "deal" as const },
        { gross_profit: 5000, source_type: "deal" as const },
        { gross_profit: 500, source_type: "spiff" as const },
      ];
      const result = calculatePayPeriodCommissions(deals, flatPlan);
      expect(result.total).toBe(750 + 1250 + 200); // 25% each, min $200 on $500
      expect(result.entries).toHaveLength(3);
    });
  });

  describe("Time Calculation", () => {
    test("calculates hours from clock in/out", () => {
      const entry: TimeEntry = {
        employee_id: "emp1",
        entry_date: "2026-04-02",
        clock_in: "2026-04-02T08:00:00Z",
        clock_out: "2026-04-02T17:00:00Z",
        break_minutes: 30,
        overtime_hours: 0,
        source: "manual",
      };
      const hours = calculateHours(entry);
      expect(hours.total_hours).toBe(8.5);
      expect(hours.regular_hours).toBe(8);
      expect(hours.overtime_hours).toBe(0.5);
    });

    test("returns 0 when no clock out", () => {
      const entry: TimeEntry = {
        employee_id: "emp1",
        entry_date: "2026-04-02",
        clock_in: "2026-04-02T08:00:00Z",
        break_minutes: 0,
        overtime_hours: 0,
        source: "manual",
      };
      const hours = calculateHours(entry);
      expect(hours.total_hours).toBe(0);
    });

    test("subtracts break time", () => {
      const entry: TimeEntry = {
        employee_id: "emp1",
        entry_date: "2026-04-02",
        clock_in: "2026-04-02T09:00:00Z",
        clock_out: "2026-04-02T17:00:00Z",
        break_minutes: 60,
        overtime_hours: 0,
        source: "manual",
      };
      const hours = calculateHours(entry);
      expect(hours.total_hours).toBe(7);
    });

    test("daily overtime after 8 hours", () => {
      const entry: TimeEntry = {
        employee_id: "emp1",
        entry_date: "2026-04-02",
        clock_in: "2026-04-02T07:00:00Z",
        clock_out: "2026-04-02T18:00:00Z",
        break_minutes: 30,
        overtime_hours: 0,
        source: "manual",
      };
      const hours = calculateHours(entry);
      expect(hours.total_hours).toBe(10.5);
      expect(hours.regular_hours).toBe(8);
      expect(hours.overtime_hours).toBe(2.5);
    });
  });

  describe("Weekly Overtime", () => {
    test("no overtime under 40 hours", () => {
      const result = calculateWeeklyOvertime([8, 8, 8, 8, 7]);
      expect(result.total).toBe(39);
      expect(result.overtime).toBe(0);
    });

    test("overtime after 40 hours", () => {
      const result = calculateWeeklyOvertime([9, 9, 9, 9, 9]);
      expect(result.total).toBe(45);
      expect(result.regular).toBe(40);
      expect(result.overtime).toBe(5);
    });

    test("custom overtime threshold", () => {
      const result = calculateWeeklyOvertime([8, 8, 8, 8, 8], 32);
      expect(result.overtime).toBe(8);
    });

    test("handles empty week", () => {
      const result = calculateWeeklyOvertime([]);
      expect(result.total).toBe(0);
      expect(result.overtime).toBe(0);
    });
  });

  describe("Pay Period Summary", () => {
    const employee: EmployeeRecord = {
      id: "emp1",
      first_name: "John",
      last_name: "Smith",
      department: "sales",
      job_title: "Sales Associate",
      pay_type: "hourly",
      pay_rate: 18,
      status: "active",
    };

    const timeEntries: TimeEntry[] = [
      {
        employee_id: "emp1", entry_date: "2026-04-01",
        clock_in: "2026-04-01T08:00:00Z", clock_out: "2026-04-01T17:00:00Z",
        break_minutes: 30, overtime_hours: 0, source: "manual",
      },
      {
        employee_id: "emp1", entry_date: "2026-04-02",
        clock_in: "2026-04-02T08:00:00Z", clock_out: "2026-04-02T17:00:00Z",
        break_minutes: 30, overtime_hours: 0, source: "manual",
      },
    ];

    const commissions: CommissionEntry[] = [
      {
        employee_id: "emp1", source_type: "deal", gross_profit: 3000,
        commission_pct: 25, commission_amount: 750,
        pay_period_start: "2026-04-01", pay_period_end: "2026-04-15",
      },
      {
        employee_id: "emp1", source_type: "spiff", gross_profit: 0,
        commission_pct: 0, commission_amount: 100,
        pay_period_start: "2026-04-01", pay_period_end: "2026-04-15",
      },
    ];

    test("builds complete summary", () => {
      const summary = buildPayPeriodSummary(
        employee, timeEntries, commissions, "2026-04-01", "2026-04-15",
      );

      expect(summary.employee_name).toBe("John Smith");
      expect(summary.department).toBe("sales");
      expect(summary.regular_hours).toBeGreaterThan(0);
      expect(summary.base_pay).toBeGreaterThan(0);
      expect(summary.commission_total).toBe(850);
      expect(summary.spiffs_bonuses).toBe(100);
      expect(summary.deals_closed).toBe(1);
      expect(summary.gross_pay).toBeGreaterThan(0);
    });

    test("calculates hourly base pay correctly", () => {
      const summary = buildPayPeriodSummary(
        employee, timeEntries, [], "2026-04-01", "2026-04-15",
      );
      // 2 days × 8.5 hours × $18/hr
      expect(summary.base_pay).toBe(8 * 2 * 18); // regular only
    });

    test("handles salaried employee", () => {
      const salaried = { ...employee, pay_type: "salary" as const, pay_rate: 60000 };
      const summary = buildPayPeriodSummary(
        salaried, [], [], "2026-04-01", "2026-04-15",
      );
      expect(summary.base_pay).toBe(2500); // $60K / 24 periods
    });
  });

  describe("Provider Status", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    test("defaults to manual (disconnected)", () => {
      delete process.env.PAYROLL_PROVIDER;
      const status = getPayrollProviderStatus();
      expect(status.provider).toBe("manual");
      expect(status.connected).toBe(false);
    });

    test("detects gusto provider", () => {
      process.env.PAYROLL_PROVIDER = "gusto";
      process.env.GUSTO_API_KEY = "test";
      const status = getPayrollProviderStatus();
      expect(status.provider).toBe("gusto");
      expect(status.connected).toBe(true);
    });

    test("gusto without key is disconnected", () => {
      process.env.PAYROLL_PROVIDER = "gusto";
      delete process.env.GUSTO_API_KEY;
      const status = getPayrollProviderStatus();
      expect(status.connected).toBe(false);
    });
  });
});
