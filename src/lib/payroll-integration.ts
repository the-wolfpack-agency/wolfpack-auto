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
