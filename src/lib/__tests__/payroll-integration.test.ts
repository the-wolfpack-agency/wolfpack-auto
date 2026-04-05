/**
 * Unit Tests — Payroll Integration
 *
 * Tests commission calculation, time entry processing,
 * pay period summaries, provider status, and DB-backed sync functions.
 */

const mockQuery = jest.fn();
jest.mock("@/lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

const mockTrackPayroll = jest.fn();
jest.mock("@/lib/analytics-hooks", () => ({
  trackPayroll: (...args: unknown[]) => mockTrackPayroll(...args),
}));

import {
  calculateDealCommission,
  calculatePayPeriodCommissions,
  calculateHours,
  calculateWeeklyOvertime,
  buildPayPeriodSummary,
  getPayrollProviderStatus,
  syncFromProvider,
  calculateCommissions,
  getPayPeriodSummary,
  clockInOut,
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

/* ------------------------------------------------------------------ */
/*  DB-backed functions                                                */
/* ------------------------------------------------------------------ */

const DEALER = "dealer-001";
const envSnapshot = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...envSnapshot };
  mockQuery.mockResolvedValue({ rows: [] });
});

afterAll(() => {
  process.env = envSnapshot;
});

/* ------------------------------------------------------------------ */
/*  syncFromProvider                                                    */
/* ------------------------------------------------------------------ */

describe("syncFromProvider", () => {
  test("queries DB in demo mode when no API key is set", async () => {
    const emp: EmployeeRecord = {
      id: "emp-1", external_employee_id: "ext-1",
      first_name: "Jane", last_name: "Doe", department: "sales",
      job_title: "Sales Rep", pay_type: "commission", pay_rate: 25,
      status: "active",
    };
    mockQuery.mockResolvedValueOnce({ rows: [emp] });
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await syncFromProvider(DEALER, "gusto");

    expect(result.sync_type).toBe("employee_records");
    expect(result.direction).toBe("pull");
    expect(result.status).toBe("completed");
    expect(result.records_synced).toBe(1);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("FROM employee_records"),
      [DEALER],
    );
  });

  test("makes HTTP request when API key is set", async () => {
    process.env.PAYROLL_GUSTO_API_KEY = "test-key-123";

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        employees: [{
          id: "g-100", first_name: "John", last_name: "Smith",
          department: "sales", job_title: "Manager",
          pay_type: "salary", pay_rate: 60000, status: "active",
        }],
      }),
    } as Response);

    const result = await syncFromProvider(DEALER, "gusto");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.gusto.com/v1/employees",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-key-123",
        }),
      }),
    );
    expect(result.records_synced).toBe(1);
    expect(result.status).toBe("completed");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO employee_records"),
      expect.arrayContaining([DEALER, "g-100"]),
    );

    fetchSpy.mockRestore();
  });

  test("returns failed when provider API returns error", async () => {
    process.env.PAYROLL_GUSTO_API_KEY = "bad-key";

    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false, status: 401, statusText: "Unauthorized",
    } as Response);

    const result = await syncFromProvider(DEALER, "gusto");

    expect(result.status).toBe("failed");
    expect(result.records_synced).toBe(0);
    expect(result.errors[0].error).toContain("401");

    fetchSpy.mockRestore();
  });

  test("logs sync to payroll_sync_log table", async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await syncFromProvider(DEALER, "paychex");

    const logCall = mockQuery.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("payroll_sync_log"),
    );
    expect(logCall).toBeDefined();
    expect(logCall![1]).toContain("paychex");
  });

  test("tracks payroll.sync_completed analytics event", async () => {
    await syncFromProvider(DEALER, "gusto");

    expect(mockTrackPayroll).toHaveBeenCalledWith(
      "payroll.sync_completed",
      DEALER,
      expect.objectContaining({ provider: "gusto" }),
    );
  });

  test("gracefully handles missing DB tables", async () => {
    mockQuery.mockRejectedValue(new Error('relation "employee_records" does not exist'));

    const result = await syncFromProvider(DEALER, "manual");
    expect(result.status).toBe("completed");
    expect(result.records_synced).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  calculateCommissions (DB-backed)                                   */
/* ------------------------------------------------------------------ */

describe("calculateCommissions (DB-backed)", () => {
  test("computes correct commission amounts from deal_worksheets", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: "deal-1", salesperson_id: "emp-1", gross_profit: 4000, funded_date: "2026-04-01", pay_type: "commission", pay_rate: 25 },
          { id: "deal-2", salesperson_id: "emp-1", gross_profit: 2000, funded_date: "2026-04-05", pay_type: "commission", pay_rate: 25 },
        ],
      })
      .mockResolvedValue({ rows: [] });

    const result = await calculateCommissions(DEALER, "2026-04-01", "2026-04-15");

    expect(result.deals).toBe(2);
    expect(result.total_commission).toBe(1500); // 1000 + 500
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].commission_amount).toBe(1000);
    expect(result.entries[1].commission_amount).toBe(500);
  });

  test("inserts commission entries into DB", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: "deal-1", salesperson_id: "emp-1", gross_profit: 3000, funded_date: "2026-04-01", pay_type: "commission", pay_rate: 30 }],
      })
      .mockResolvedValue({ rows: [] });

    await calculateCommissions(DEALER, "2026-04-01", "2026-04-15");

    const insertCall = mockQuery.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO commission_entries"),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toContain("deal-1");
  });

  test("tracks payroll.commission_calculated event", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await calculateCommissions(DEALER, "2026-04-01", "2026-04-15");

    expect(mockTrackPayroll).toHaveBeenCalledWith(
      "payroll.commission_calculated",
      DEALER,
      expect.objectContaining({ deals: 0, total_commission: 0 }),
    );
  });

  test("uses default 25% when pay_rate is missing", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: "deal-1", salesperson_id: "emp-1", gross_profit: 2000, funded_date: "2026-04-01", pay_type: null, pay_rate: null }],
      })
      .mockResolvedValue({ rows: [] });

    const result = await calculateCommissions(DEALER, "2026-04-01", "2026-04-15");
    expect(result.total_commission).toBe(500); // 25% of 2000
  });

  test("gracefully handles missing tables", async () => {
    mockQuery.mockRejectedValue(new Error('relation "deal_worksheets" does not exist'));

    const result = await calculateCommissions(DEALER, "2026-04-01", "2026-04-15");
    expect(result.deals).toBe(0);
    expect(result.total_commission).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  getPayPeriodSummary (DB-backed)                                    */
/* ------------------------------------------------------------------ */

describe("getPayPeriodSummary (DB-backed)", () => {
  test("aggregates hours and commissions for employees", async () => {
    const emp = {
      id: "emp-1", external_employee_id: "ext-1",
      first_name: "Jane", last_name: "Doe", email: "jane@test.com",
      department: "sales", job_title: "Sales Rep",
      pay_type: "hourly", pay_rate: 20, status: "active", hire_date: "2024-01-01",
    };
    const timeEntry = {
      employee_id: "emp-1", entry_date: "2026-04-01",
      clock_in: "2026-04-01T08:00:00Z", clock_out: "2026-04-01T17:00:00Z",
      break_minutes: 30, overtime_hours: 0, source: "kiosk",
    };
    const commEntry = {
      employee_id: "emp-1", source_type: "deal", source_id: "deal-1",
      gross_profit: 3000, commission_pct: 25, commission_amount: 750,
      pay_period_start: "2026-04-01", pay_period_end: "2026-04-15",
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [emp] })
      .mockResolvedValueOnce({ rows: [timeEntry] })
      .mockResolvedValueOnce({ rows: [commEntry] });

    const summaries = await getPayPeriodSummary(DEALER, "2026-04-01", "2026-04-15");

    expect(summaries).toHaveLength(1);
    const s = summaries[0];
    expect(s.employee_id).toBe("emp-1");
    expect(s.employee_name).toBe("Jane Doe");
    expect(s.regular_hours).toBe(8);
    expect(s.overtime_hours).toBe(0.5);
    expect(s.base_pay).toBe(160); // 8h * $20
    expect(s.overtime_pay).toBe(15); // 0.5h * $20 * 1.5
    expect(s.commission_total).toBe(750);
    expect(s.deals_closed).toBe(1);
  });

  test("returns empty array when no employees exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const summaries = await getPayPeriodSummary(DEALER, "2026-04-01", "2026-04-15");
    expect(summaries).toEqual([]);
  });

  test("gracefully handles missing tables", async () => {
    mockQuery.mockRejectedValue(new Error('relation "employee_records" does not exist'));
    const summaries = await getPayPeriodSummary(DEALER, "2026-04-01", "2026-04-15");
    expect(summaries).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  clockInOut                                                         */
/* ------------------------------------------------------------------ */

describe("clockInOut", () => {
  test("inserts time entry on clock_in", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "te-100" }] });

    const result = await clockInOut(DEALER, "emp-1", "clock_in");

    expect(result.success).toBe(true);
    expect(result.entry_id).toBe("te-100");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO time_entries"),
      expect.arrayContaining([DEALER, "emp-1"]),
    );
  });

  test("updates existing entry on clock_out", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "te-100" }] });

    const result = await clockInOut(DEALER, "emp-1", "clock_out");

    expect(result.success).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE time_entries"),
      expect.arrayContaining([DEALER, "emp-1"]),
    );
  });

  test("returns error when no open entry for clock_out", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await clockInOut(DEALER, "emp-1", "clock_out");

    expect(result.success).toBe(false);
    expect(result.error).toContain("No open time entry");
  });

  test("tracks payroll.time_entry_created analytics event", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "te-1" }] });

    await clockInOut(DEALER, "emp-1", "clock_in");

    expect(mockTrackPayroll).toHaveBeenCalledWith(
      "payroll.time_entry_created",
      DEALER,
      expect.objectContaining({ employee_id: "emp-1", action: "clock_in" }),
    );
  });

  test("gracefully handles DB errors", async () => {
    mockQuery.mockRejectedValue(new Error("connection refused"));

    const result = await clockInOut(DEALER, "emp-1", "clock_in");

    expect(result.success).toBe(false);
    expect(result.error).toContain("connection refused");
  });
});
