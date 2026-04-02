/**
 * GET  /api/admin/payroll — Employee list + payroll status
 * POST /api/admin/payroll — Calculate pay period summary for an employee
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthenticated } from "@/lib/auth-guard";
import { trackPayroll } from "@/lib/analytics-hooks";
import {
  buildPayPeriodSummary,
  calculateHours,
  getPayrollProviderStatus,
  type EmployeeRecord,
  type TimeEntry,
  type CommissionEntry,
} from "@/lib/payroll-integration";

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let employees: Record<string, unknown>[] = [];
  const providerStatus = getPayrollProviderStatus();

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");
      const { rows } = await query(
        `SELECT * FROM employee_records
         WHERE dealer_id = $1 AND status = 'active'
         ORDER BY department, last_name ASC`,
        [dealerId],
      );
      employees = rows;
    } catch (err) {
      console.error("[api/payroll] GET error:", err);
    }
  }

  return NextResponse.json({
    employees,
    count: employees.length,
    provider: providerStatus,
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if (!isAuthenticated(authResult)) return authResult;
  const dealerId = authResult.user.dealer_id;

  let body: {
    employee_id?: string;
    period_start?: string;
    period_end?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.employee_id || !body.period_start || !body.period_end) {
    return NextResponse.json(
      { error: "employee_id, period_start, and period_end are required" },
      { status: 400 },
    );
  }

  let employee: EmployeeRecord | null = null;
  let timeEntries: TimeEntry[] = [];
  let commissions: CommissionEntry[] = [];

  if (process.env.DATABASE_URL) {
    try {
      const { query } = await import("@/lib/db");

      // Get employee
      const { rows: empRows } = await query(
        `SELECT * FROM employee_records WHERE id = $1::uuid AND dealer_id = $2`,
        [body.employee_id, dealerId],
      );
      if (empRows.length > 0) {
        const r = empRows[0];
        employee = {
          id: r.id as string,
          first_name: r.first_name as string,
          last_name: r.last_name as string,
          email: r.email as string,
          department: r.department as EmployeeRecord["department"],
          job_title: r.job_title as string,
          pay_type: r.pay_type as EmployeeRecord["pay_type"],
          pay_rate: Number(r.pay_rate) || 0,
          status: r.status as EmployeeRecord["status"],
        };
      }

      // Get time entries
      const { rows: timeRows } = await query(
        `SELECT * FROM time_entries
         WHERE employee_id = $1::uuid AND dealer_id = $2
           AND entry_date BETWEEN $3::date AND $4::date
         ORDER BY entry_date ASC`,
        [body.employee_id, dealerId, body.period_start, body.period_end],
      );
      timeEntries = timeRows.map((r: Record<string, unknown>) => ({
        employee_id: r.employee_id as string,
        entry_date: r.entry_date as string,
        clock_in: r.clock_in as string,
        clock_out: r.clock_out as string | undefined,
        break_minutes: Number(r.break_minutes) || 0,
        overtime_hours: Number(r.overtime_hours) || 0,
        source: (r.source as TimeEntry["source"]) ?? "manual",
      }));

      // Get commissions
      const { rows: commRows } = await query(
        `SELECT * FROM commission_entries
         WHERE employee_id = $1::uuid AND dealer_id = $2
           AND pay_period_start >= $3::date AND pay_period_end <= $4::date`,
        [body.employee_id, dealerId, body.period_start, body.period_end],
      );
      commissions = commRows.map((r: Record<string, unknown>) => ({
        employee_id: r.employee_id as string,
        source_type: r.source_type as CommissionEntry["source_type"],
        source_id: r.source_id as string,
        gross_profit: Number(r.gross_profit) || 0,
        commission_pct: Number(r.commission_pct) || 0,
        commission_amount: Number(r.commission_amount) || 0,
        pay_period_start: r.pay_period_start as string,
        pay_period_end: r.pay_period_end as string,
      }));
    } catch (err) {
      console.error("[api/payroll] DB error:", err);
    }
  }

  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const summary = buildPayPeriodSummary(
    employee,
    timeEntries,
    commissions,
    body.period_start,
    body.period_end,
  );

  trackPayroll("payroll.period_summarized", dealerId, {
    employee_id: body.employee_id,
    department: employee.department,
    gross_pay: summary.gross_pay,
    deals_closed: summary.deals_closed,
    commission_total: summary.commission_total,
  });

  return NextResponse.json(summary);
}
