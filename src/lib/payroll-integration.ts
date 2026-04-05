/**
 * Payroll Integration Layer
 *
 * Connects dealership payroll data with external providers (Gusto, ADP, Paychex).
 * We handle:
 *  - Employee record sync (pull from provider)
 *  - Time entry management (push to provider)
 *  - Commission calculation from deals
 *  - Pay period summarization
 *
 * The actual payroll processing (tax withholding, direct deposit, tax filing)
 * is handled by the external provider. We are the data bridge.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type PayrollProvider = "gusto" | "adp" | "paychex" | "manual";
export type Department = "sales" | "finance" | "service" | "parts" | "admin" | "management";
export type PayType = "salary" | "hourly" | "commission" | "draw";
export type CommissionSource = "deal" | "service_ro" | "spiff" | "bonus" | "draw";

export interface EmployeeRecord {
  id: string;
  external_employee_id?: string;
  first_name: string;
  last_name: string;
  email?: string;
  department: Department;
  job_title: string;
  pay_type: PayType;
  pay_rate: number;
  status: "active" | "on_leave" | "terminated";
  hire_date?: string;
}

export interface TimeEntry {
  employee_id: string;
  entry_date: string;
  clock_in: string;
  clock_out?: string;
  break_minutes: number;
  total_hours?: number;
  overtime_hours: number;
  source: "manual" | "kiosk" | "mobile" | "imported";
}

export interface CommissionEntry {
  employee_id: string;
  source_type: CommissionSource;
  source_id?: string;
  gross_profit: number;
  commission_pct: number;
  commission_amount: number;
  pay_period_start: string;
  pay_period_end: string;
}

export interface PayPeriodSummary {
  employee_id: string;
  employee_name: string;
  department: Department;
  period_start: string;
  period_end: string;
  regular_hours: number;
  overtime_hours: number;
  base_pay: number;
  overtime_pay: number;
  commission_total: number;
  spiffs_bonuses: number;
  gross_pay: number;
  deals_closed: number;
  total_gross_profit: number;
}

export interface PayrollSyncResult {
  sync_type: string;
  direction: "push" | "pull";
  status: "completed" | "failed";
  records_synced: number;
  errors: { record_id: string; error: string }[];
}

export interface ProviderStatus {
  provider: PayrollProvider;
  connected: boolean;
  last_sync?: string;
  employee_count?: number;
}

/* ------------------------------------------------------------------ */
/*  Commission Calculation                                             */
/* ------------------------------------------------------------------ */

export interface CommissionPlan {
  name: string;
  type: "flat_pct" | "tiered" | "draw_vs_commission";
  flat_rate?: number;  // percentage for flat plans
  tiers?: { min_gross: number; max_gross: number; pct: number }[];
  draw_amount?: number;  // monthly draw for draw plans
  minimum_per_deal?: number;  // minimum commission per deal (mini deal)
}

/**
 * Calculate commission for a single deal based on a commission plan.
 */
export function calculateDealCommission(
  grossProfit: number,
  plan: CommissionPlan,
): number {
  if (grossProfit <= 0) return plan.minimum_per_deal ?? 0;

  let commission = 0;

  switch (plan.type) {
    case "flat_pct":
      commission = grossProfit * ((plan.flat_rate ?? 25) / 100);
      break;

    case "tiered": {
      if (!plan.tiers || plan.tiers.length === 0) {
        commission = grossProfit * 0.25; // default 25%
        break;
      }
      for (const tier of plan.tiers) {
        if (grossProfit >= tier.min_gross && grossProfit <= tier.max_gross) {
          commission = grossProfit * (tier.pct / 100);
          break;
        }
      }
      // If above all tiers, use the highest tier
      if (commission === 0 && plan.tiers.length > 0) {
        const highest = plan.tiers[plan.tiers.length - 1];
        commission = grossProfit * (highest.pct / 100);
      }
      break;
    }

    case "draw_vs_commission":
      commission = grossProfit * ((plan.flat_rate ?? 25) / 100);
      // Commission is paid, but tracked against draw
      break;
  }

  // Apply minimum
  if (plan.minimum_per_deal && commission < plan.minimum_per_deal) {
    commission = plan.minimum_per_deal;
  }

  return Math.round(commission * 100) / 100;
}

/**
 * Calculate total commissions for a pay period.
 */
export function calculatePayPeriodCommissions(
  deals: { gross_profit: number; source_type: CommissionSource }[],
  plan: CommissionPlan,
): { total: number; entries: CommissionEntry[] } {
  let total = 0;
  const entries: CommissionEntry[] = [];

  for (const deal of deals) {
    const amount = calculateDealCommission(deal.gross_profit, plan);
    total += amount;
    entries.push({
      employee_id: "",
      source_type: deal.source_type,
      gross_profit: deal.gross_profit,
      commission_pct: plan.flat_rate ?? 0,
      commission_amount: amount,
      pay_period_start: "",
      pay_period_end: "",
    });
  }

  return { total: Math.round(total * 100) / 100, entries };
}

/* ------------------------------------------------------------------ */
/*  Time Calculation                                                   */
/* ------------------------------------------------------------------ */

/**
 * Calculate hours worked from a time entry.
 */
export function calculateHours(entry: TimeEntry): {
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
} {
  if (!entry.clock_out) {
    return { total_hours: 0, regular_hours: 0, overtime_hours: 0 };
  }

  const clockIn = new Date(entry.clock_in).getTime();
  const clockOut = new Date(entry.clock_out).getTime();
  const breakMs = entry.break_minutes * 60 * 1000;

  const workedMs = clockOut - clockIn - breakMs;
  const total_hours = Math.round((workedMs / (1000 * 60 * 60)) * 100) / 100;

  return {
    total_hours: Math.max(0, total_hours),
    regular_hours: Math.min(total_hours, 8),
    overtime_hours: Math.max(0, total_hours - 8),
  };
}

/**
 * Summarize weekly hours for overtime calculation.
 */
export function calculateWeeklyOvertime(
  dailyHours: number[],
  overtimeThreshold = 40,
): { total: number; regular: number; overtime: number } {
  const total = dailyHours.reduce((sum, h) => sum + h, 0);
  const regular = Math.min(total, overtimeThreshold);
  const overtime = Math.max(0, total - overtimeThreshold);

  return {
    total: Math.round(total * 100) / 100,
    regular: Math.round(regular * 100) / 100,
    overtime: Math.round(overtime * 100) / 100,
  };
}

/**
 * Build a pay period summary for an employee.
 */
export function buildPayPeriodSummary(
  employee: EmployeeRecord,
  timeEntries: TimeEntry[],
  commissions: CommissionEntry[],
  periodStart: string,
  periodEnd: string,
): PayPeriodSummary {
  let regular_hours = 0;
  let overtime_hours = 0;

  for (const entry of timeEntries) {
    const hours = calculateHours(entry);
    regular_hours += hours.regular_hours;
    overtime_hours += hours.overtime_hours;
  }

  // Base pay
  let base_pay = 0;
  let overtime_pay = 0;

  if (employee.pay_type === "hourly") {
    base_pay = regular_hours * employee.pay_rate;
    overtime_pay = overtime_hours * employee.pay_rate * 1.5;
  } else if (employee.pay_type === "salary") {
    // Semi-monthly: annual / 24
    base_pay = employee.pay_rate / 24;
  }

  const commission_total = commissions.reduce((sum, c) => sum + c.commission_amount, 0);
  const spiffs_bonuses = commissions
    .filter((c) => c.source_type === "spiff" || c.source_type === "bonus")
    .reduce((sum, c) => sum + c.commission_amount, 0);

  const deals_closed = commissions.filter((c) => c.source_type === "deal").length;
  const total_gross_profit = commissions
    .filter((c) => c.source_type === "deal")
    .reduce((sum, c) => sum + c.gross_profit, 0);

  return {
    employee_id: employee.id,
    employee_name: `${employee.first_name} ${employee.last_name}`,
    department: employee.department,
    period_start: periodStart,
    period_end: periodEnd,
    regular_hours: Math.round(regular_hours * 100) / 100,
    overtime_hours: Math.round(overtime_hours * 100) / 100,
    base_pay: Math.round(base_pay * 100) / 100,
    overtime_pay: Math.round(overtime_pay * 100) / 100,
    commission_total: Math.round(commission_total * 100) / 100,
    spiffs_bonuses: Math.round(spiffs_bonuses * 100) / 100,
    gross_pay: Math.round((base_pay + overtime_pay + commission_total) * 100) / 100,
    deals_closed,
    total_gross_profit: Math.round(total_gross_profit * 100) / 100,
  };
}

/* ------------------------------------------------------------------ */
/*  Provider API Configuration                                         */
/* ------------------------------------------------------------------ */

const PROVIDER_URLS: Record<string, string> = {
  gusto: process.env.PAYROLL_GUSTO_URL ?? "https://api.gusto.com/v1",
  adp: process.env.PAYROLL_ADP_URL ?? "https://api.adp.com/hr/v2",
  paychex: process.env.PAYROLL_PAYCHEX_URL ?? "https://api.paychex.com/workers",
};

function getProviderApiKey(provider: PayrollProvider): string | undefined {
  const key = `PAYROLL_${provider.toUpperCase()}_API_KEY`;
  return process.env[key];
}

/* ------------------------------------------------------------------ */
/*  Sync from Provider                                                 */
/* ------------------------------------------------------------------ */

/**
 * Fetch employee records from an external payroll provider.
 *
 * If an API key is configured for the provider, makes an HTTP request to the
 * provider's API and normalizes the response. Otherwise, returns existing
 * records from the local DB (demo/seed mode).
 *
 * All fetched records are upserted into `employee_records` and the sync
 * is logged to `payroll_sync_log`.
 */
export async function syncFromProvider(
  dealerId: string,
  provider: PayrollProvider,
): Promise<PayrollSyncResult> {
  const { trackPayroll } = await import("@/lib/analytics-hooks");

  let employees: EmployeeRecord[] = [];
  const errors: { record_id: string; error: string }[] = [];
  const apiKey = getProviderApiKey(provider);

  if (apiKey && provider !== "manual") {
    // Live provider sync
    const url = PROVIDER_URLS[provider];
    if (!url) {
      return {
        sync_type: "employee_records",
        direction: "pull",
        status: "failed",
        records_synced: 0,
        errors: [{ record_id: "", error: `Unknown provider: ${provider}` }],
      };
    }

    try {
      const response = await fetch(`${url}/employees`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Provider returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const rawEmployees = Array.isArray(data) ? data : data.employees ?? data.workers ?? [];

      employees = rawEmployees.map((raw: Record<string, any>) => ({
        id: raw.id ?? raw.employee_id ?? "",
        external_employee_id: raw.id ?? raw.employee_id ?? raw.worker_id ?? "",
        first_name: raw.first_name ?? raw.firstName ?? "",
        last_name: raw.last_name ?? raw.lastName ?? "",
        email: raw.email ?? raw.work_email ?? undefined,
        department: (raw.department ?? "admin") as Department,
        job_title: raw.job_title ?? raw.jobTitle ?? raw.title ?? "",
        pay_type: (raw.pay_type ?? raw.compensation_type ?? "hourly") as PayType,
        pay_rate: Number(raw.pay_rate ?? raw.rate ?? raw.salary ?? 0),
        status: (raw.status ?? "active") as "active" | "on_leave" | "terminated",
        hire_date: raw.hire_date ?? raw.hireDate ?? undefined,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ record_id: "", error: message });
      return {
        sync_type: "employee_records",
        direction: "pull",
        status: "failed",
        records_synced: 0,
        errors,
      };
    }
  } else {
    // Demo mode — read from DB
    try {
      const { query } = await import("@/lib/db");
      const { rows } = await query(
        `SELECT * FROM employee_records WHERE dealer_id = $1 ORDER BY last_name ASC`,
        [dealerId],
      );
      employees = rows as unknown as EmployeeRecord[];
    } catch {
      // DB not available — return empty
      employees = [];
    }
  }

  // Upsert into DB + log sync
  try {
    const { query } = await import("@/lib/db");

    for (const emp of employees) {
      try {
        await query(
          `INSERT INTO employee_records
             (dealer_id, external_employee_id, first_name, last_name, email,
              department, job_title, pay_type, pay_rate, status, hire_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (dealer_id, external_employee_id)
           DO UPDATE SET first_name = EXCLUDED.first_name,
                         last_name = EXCLUDED.last_name,
                         email = EXCLUDED.email,
                         department = EXCLUDED.department,
                         job_title = EXCLUDED.job_title,
                         pay_type = EXCLUDED.pay_type,
                         pay_rate = EXCLUDED.pay_rate,
                         status = EXCLUDED.status,
                         hire_date = EXCLUDED.hire_date`,
          [
            dealerId,
            emp.external_employee_id ?? emp.id,
            emp.first_name,
            emp.last_name,
            emp.email ?? null,
            emp.department,
            emp.job_title,
            emp.pay_type,
            emp.pay_rate,
            emp.status,
            emp.hire_date ?? null,
          ],
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ record_id: emp.external_employee_id ?? emp.id, error: message });
      }
    }

    await query(
      `INSERT INTO payroll_sync_log
         (dealer_id, provider, sync_type, direction, records_synced, status, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [dealerId, provider, "employee_records", "pull", employees.length, "completed"],
    );
  } catch {
    // DB write failed — still return the fetched data
  }

  trackPayroll("payroll.sync_completed", dealerId, {
    provider,
    records_synced: employees.length,
  });

  return {
    sync_type: "employee_records",
    direction: "pull",
    status: errors.length > 0 ? "failed" : "completed",
    records_synced: employees.length,
    errors,
  };
}

/* ------------------------------------------------------------------ */
/*  Commission Calculation (DB-backed)                                 */
/* ------------------------------------------------------------------ */

/**
 * Calculate commissions for all deals funded in a pay period.
 *
 * Queries `deal_worksheets` for funded deals, looks up each salesperson's
 * commission plan from `employee_records`, calculates amounts, and inserts
 * results into `commission_entries`.
 */
export async function calculateCommissions(
  dealerId: string,
  payPeriodStart: string,
  payPeriodEnd: string,
): Promise<{ deals: number; total_commission: number; entries: CommissionEntry[] }> {
  const { trackPayroll } = await import("@/lib/analytics-hooks");

  let deals: Record<string, any>[] = [];
  const entries: CommissionEntry[] = [];

  try {
    const { query } = await import("@/lib/db");

    const { rows } = await query(
      `SELECT dw.id, dw.salesperson_id, dw.gross_profit, dw.funded_date,
              er.pay_type, er.pay_rate
       FROM deal_worksheets dw
       LEFT JOIN employee_records er
         ON er.dealer_id = dw.dealer_id AND er.id = dw.salesperson_id
       WHERE dw.dealer_id = $1
         AND dw.funded_date >= $2
         AND dw.funded_date <= $3`,
      [dealerId, payPeriodStart, payPeriodEnd],
    );
    deals = rows;

    for (const deal of deals) {
      const grossProfit = Number(deal.gross_profit ?? 0);
      const commissionPct = deal.pay_type === "commission" ? (deal.pay_rate ?? 25) : 25;
      const plan: CommissionPlan = { name: "default", type: "flat_pct", flat_rate: commissionPct };
      const amount = calculateDealCommission(grossProfit, plan);

      const entry: CommissionEntry = {
        employee_id: deal.salesperson_id ?? "",
        source_type: "deal",
        source_id: deal.id,
        gross_profit: grossProfit,
        commission_pct: commissionPct,
        commission_amount: amount,
        pay_period_start: payPeriodStart,
        pay_period_end: payPeriodEnd,
      };
      entries.push(entry);

      await query(
        `INSERT INTO commission_entries
           (dealer_id, employee_id, source_type, source_id, gross_profit,
            commission_pct, commission_amount, pay_period_start, pay_period_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          dealerId,
          entry.employee_id,
          entry.source_type,
          entry.source_id,
          entry.gross_profit,
          entry.commission_pct,
          entry.commission_amount,
          payPeriodStart,
          payPeriodEnd,
        ],
      );
    }
  } catch {
    // DB not available — return empty
  }

  const total_commission = Math.round(
    entries.reduce((sum, e) => sum + e.commission_amount, 0) * 100,
  ) / 100;

  trackPayroll("payroll.commission_calculated", dealerId, {
    deals: deals.length,
    total_commission,
  });

  return { deals: deals.length, total_commission, entries };
}

/* ------------------------------------------------------------------ */
/*  Pay Period Summary                                                 */
/* ------------------------------------------------------------------ */

/**
 * Aggregate a pay period summary for all active employees at a dealership.
 *
 * Pulls time entries and commission entries from the DB, then uses the pure
 * `buildPayPeriodSummary()` helper to produce each employee's summary.
 */
export async function getPayPeriodSummary(
  dealerId: string,
  startDate: string,
  endDate: string,
): Promise<PayPeriodSummary[]> {
  const summaries: PayPeriodSummary[] = [];

  try {
    const { query } = await import("@/lib/db");

    const { rows: employees } = await query(
      `SELECT * FROM employee_records
       WHERE dealer_id = $1 AND status = 'active'
       ORDER BY last_name ASC`,
      [dealerId],
    );

    for (const emp of employees) {
      const employee: EmployeeRecord = {
        id: emp.id,
        external_employee_id: emp.external_employee_id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        email: emp.email,
        department: emp.department,
        job_title: emp.job_title,
        pay_type: emp.pay_type,
        pay_rate: Number(emp.pay_rate),
        status: emp.status,
        hire_date: emp.hire_date,
      };

      const { rows: timeRows } = await query(
        `SELECT * FROM time_entries
         WHERE dealer_id = $1 AND employee_id = $2
           AND entry_date >= $3 AND entry_date <= $4
         ORDER BY entry_date ASC`,
        [dealerId, emp.id, startDate, endDate],
      );

      const timeEntries: TimeEntry[] = timeRows.map((t: Record<string, any>) => ({
        employee_id: t.employee_id,
        entry_date: t.entry_date,
        clock_in: t.clock_in,
        clock_out: t.clock_out,
        break_minutes: Number(t.break_minutes ?? 0),
        overtime_hours: Number(t.overtime_hours ?? 0),
        source: t.source ?? "manual",
      }));

      const { rows: commRows } = await query(
        `SELECT * FROM commission_entries
         WHERE dealer_id = $1 AND employee_id = $2
           AND pay_period_start >= $3 AND pay_period_end <= $4`,
        [dealerId, emp.id, startDate, endDate],
      );

      const commissions: CommissionEntry[] = commRows.map((c: Record<string, any>) => ({
        employee_id: c.employee_id,
        source_type: c.source_type,
        source_id: c.source_id,
        gross_profit: Number(c.gross_profit ?? 0),
        commission_pct: Number(c.commission_pct ?? 0),
        commission_amount: Number(c.commission_amount ?? 0),
        pay_period_start: c.pay_period_start,
        pay_period_end: c.pay_period_end,
      }));

      summaries.push(buildPayPeriodSummary(employee, timeEntries, commissions, startDate, endDate));
    }
  } catch {
    // DB not available — return empty
  }

  return summaries;
}

/* ------------------------------------------------------------------ */
/*  Clock In / Out                                                     */
/* ------------------------------------------------------------------ */

/**
 * Record a time entry (clock in or clock out) for an employee.
 *
 * On "clock_in", inserts a new row. On "clock_out", updates the most recent
 * open entry for the employee.
 */
export async function clockInOut(
  dealerId: string,
  employeeId: string,
  action: "clock_in" | "clock_out",
): Promise<{ success: boolean; entry_id?: string; error?: string }> {
  const { trackPayroll } = await import("@/lib/analytics-hooks");
  const now = new Date().toISOString();

  try {
    const { query } = await import("@/lib/db");

    if (action === "clock_in") {
      const { rows } = await query(
        `INSERT INTO time_entries
           (dealer_id, employee_id, entry_date, clock_in, break_minutes, overtime_hours, source)
         VALUES ($1, $2, $3, $4, 0, 0, 'kiosk')
         RETURNING id`,
        [dealerId, employeeId, now.slice(0, 10), now],
      );

      trackPayroll("payroll.time_entry_created", dealerId, {
        employee_id: employeeId,
        action,
      });

      return { success: true, entry_id: rows[0]?.id };
    } else {
      // clock_out — update the most recent open entry
      const { rows } = await query(
        `UPDATE time_entries
         SET clock_out = $1
         WHERE dealer_id = $2 AND employee_id = $3 AND clock_out IS NULL
         ORDER BY clock_in DESC
         LIMIT 1
         RETURNING id`,
        [now, dealerId, employeeId],
      );

      if (rows.length === 0) {
        return { success: false, error: "No open time entry found" };
      }

      trackPayroll("payroll.time_entry_created", dealerId, {
        employee_id: employeeId,
        action,
      });

      return { success: true, entry_id: rows[0]?.id };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/* ------------------------------------------------------------------ */
/*  Provider Status                                                    */
/* ------------------------------------------------------------------ */

export function getPayrollProviderStatus(): ProviderStatus {
  const provider = (process.env.PAYROLL_PROVIDER ?? "manual") as PayrollProvider;
  const hasCredentials = provider === "gusto"
    ? !!process.env.GUSTO_API_KEY
    : provider === "adp"
      ? !!process.env.ADP_CLIENT_ID
      : provider === "paychex"
        ? !!process.env.PAYCHEX_API_KEY
        : true;

  return {
    provider,
    connected: hasCredentials && provider !== "manual",
  };
}
