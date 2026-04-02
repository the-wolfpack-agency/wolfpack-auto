"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
  pay_type: "salary" | "hourly" | "commission";
  pay_rate: number;
  status: "active" | "inactive" | "terminated";
  hire_date: string;
}

interface TimeEntry {
  id: string;
  employee_id: string;
  employee_name: string;
  date: string;
  clock_in: string;
  clock_out: string | null;
  hours: number;
  status: "clocked_in" | "completed" | "approved" | "adjusted";
  notes: string;
}

interface CommissionEntry {
  id: string;
  employee_id: string;
  employee_name: string;
  deal_id: string;
  deal_source: string;
  vehicle: string;
  gross_profit: number;
  commission_rate: number;
  commission_amount: number;
  status: "pending" | "approved" | "paid";
  date: string;
}

interface PayrollProvider {
  name: "gusto" | "adp" | "manual";
  status: "connected" | "disconnected" | "error";
  last_sync: string | null;
}

interface PayPeriodSummary {
  period_start: string;
  period_end: string;
  total_employees: number;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_gross_pay: number;
  total_commissions: number;
  total_payroll: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function usdWhole(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "--";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_BADGE_EMPLOYEE: Record<string, string> = {
  active: "bg-green-50 text-green-700 ring-green-600/20",
  inactive: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  terminated: "bg-red-50 text-red-700 ring-red-600/20",
};

const STATUS_LABEL_EMPLOYEE: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  terminated: "Terminated",
};

const PAY_TYPE_LABELS: Record<string, string> = {
  salary: "Salary",
  hourly: "Hourly",
  commission: "Commission",
};

const PAY_TYPE_COLORS: Record<string, string> = {
  salary: "bg-blue-50 text-blue-700 ring-blue-600/20",
  hourly: "bg-purple-50 text-purple-700 ring-purple-600/20",
  commission: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

const TIME_STATUS_BADGE: Record<string, string> = {
  clocked_in: "bg-green-50 text-green-700 ring-green-600/20",
  completed: "bg-blue-50 text-blue-700 ring-blue-600/20",
  approved: "bg-brand-50 text-brand-700 ring-brand-600/20",
  adjusted: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
};

const COMMISSION_STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  approved: "bg-green-50 text-green-700 ring-green-600/20",
  paid: "bg-brand-50 text-brand-700 ring-brand-600/20",
};

const PROVIDER_CONFIG: Record<
  string,
  { label: string; color: string; dot: string }
> = {
  gusto: {
    label: "Gusto",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  adp: {
    label: "ADP",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  manual: {
    label: "Manual",
    color: "bg-gray-50 text-gray-700 border-gray-200",
    dot: "bg-gray-500",
  },
};

const PROVIDER_STATUS_DOT: Record<string, string> = {
  connected: "bg-green-500",
  disconnected: "bg-gray-400",
  error: "bg-red-500",
};

type Tab = "employees" | "time" | "commissions";

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function PayrollDashboard() {
  const [tab, setTab] = useState<Tab>("employees");

  /* Provider */
  const [provider, setProvider] = useState<PayrollProvider | null>(null);

  /* Employees */
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [empError, setEmpError] = useState("");

  /* Time entries */
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [timeLoading, setTimeLoading] = useState(true);
  const [timeError, setTimeError] = useState("");

  /* Commissions */
  const [commissions, setCommissions] = useState<CommissionEntry[]>([]);
  const [commLoading, setCommLoading] = useState(true);
  const [commError, setCommError] = useState("");

  /* Pay period summary */
  const [paySummary, setPaySummary] = useState<PayPeriodSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  /* ---- Data fetching ---- */

  const loadProvider = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/payroll");
      const data = await res.json();
      setProvider(data.provider ?? null);
    } catch {
      /* non-critical */
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    setEmpLoading(true);
    setEmpError("");
    try {
      const res = await fetch("/api/admin/payroll");
      const data = await res.json();
      setEmployees(data.employees ?? []);
    } catch {
      setEmpError("Failed to load employees.");
    } finally {
      setEmpLoading(false);
    }
  }, []);

  const loadTimeEntries = useCallback(async () => {
    setTimeLoading(true);
    setTimeError("");
    try {
      const res = await fetch("/api/admin/payroll");
      const data = await res.json();
      setTimeEntries(data.entries ?? []);
    } catch {
      setTimeError("Failed to load time entries.");
    } finally {
      setTimeLoading(false);
    }
  }, []);

  const loadCommissions = useCallback(async () => {
    setCommLoading(true);
    setCommError("");
    try {
      const res = await fetch("/api/admin/payroll/commissions");
      const data = await res.json();
      setCommissions(data.commissions ?? []);
    } catch {
      setCommError("Failed to load commissions.");
    } finally {
      setCommLoading(false);
    }
  }, []);

  const loadPaySummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/admin/payroll");
      const data = await res.json();
      setPaySummary(data.summary ?? null);
    } catch {
      /* non-critical */
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProvider();
    void loadPaySummary();
  }, [loadProvider, loadPaySummary]);

  useEffect(() => {
    if (tab === "employees") void loadEmployees();
    if (tab === "time") void loadTimeEntries();
    if (tab === "commissions") void loadCommissions();
  }, [tab, loadEmployees, loadTimeEntries, loadCommissions]);

  /* ---- Tabs ---- */

  const tabs: { key: Tab; label: string }[] = [
    { key: "employees", label: "Employees" },
    { key: "time", label: "Time & Attendance" },
    { key: "commissions", label: "Commissions" },
  ];

  const providerCfg = PROVIDER_CONFIG[provider?.name ?? "manual"];
  const providerStatusDot =
    PROVIDER_STATUS_DOT[provider?.status ?? "disconnected"];

  return (
    <div data-testid="payroll-page">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage employees, track hours, and process commissions.
          </p>
        </div>

        {/* Provider Status */}
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${providerCfg.color}`}
        >
          <span
            className={`inline-block h-2 w-2 rounded-full ${providerStatusDot}`}
          />
          <span className="font-medium">{providerCfg.label}</span>
          <span className="text-xs opacity-75">
            {provider?.status === "connected"
              ? "Connected"
              : provider?.status === "error"
                ? "Error"
                : "Disconnected"}
          </span>
          {provider?.last_sync && (
            <span className="text-xs opacity-60">
              Synced {fmtDate(provider.last_sync)}
            </span>
          )}
        </div>
      </div>

      {/* Pay Period Summary Cards */}
      {summaryLoading ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
              <div className="mt-2 h-6 w-20 animate-pulse rounded bg-gray-200" />
            </div>
          ))}
        </div>
      ) : paySummary ? (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Employees</p>
            <p className="mt-0.5 text-2xl font-bold text-gray-900">
              {paySummary.total_employees}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Regular Hours</p>
            <p className="mt-0.5 text-2xl font-bold text-gray-900">
              {paySummary.total_regular_hours.toFixed(1)}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-gray-500">OT Hours</p>
            <p className="mt-0.5 text-2xl font-bold text-yellow-600">
              {paySummary.total_overtime_hours.toFixed(1)}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Gross Pay</p>
            <p className="mt-0.5 text-2xl font-bold text-green-600">
              {usdWhole(paySummary.total_gross_pay)}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-gray-500">Commissions</p>
            <p className="mt-0.5 text-2xl font-bold text-purple-600">
              {usdWhole(paySummary.total_commissions)}
            </p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-brand-700">Total Payroll</p>
            <p className="mt-0.5 text-2xl font-bold text-brand-700">
              {usdWhole(paySummary.total_payroll)}
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-xl border-2 border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
          No pay period data available yet.
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-white text-brand-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---- Employees Tab ---- */}
      {tab === "employees" && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          {empError && (
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {empError}
            </div>
          )}
          {empLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Loading employees...
            </div>
          ) : employees.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">
                No employees configured yet.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Add employees or sync from your payroll provider to get started.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hidden sm:table-cell">
                      Department
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hidden md:table-cell">
                      Pay Type
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 hidden lg:table-cell">
                      Pay Rate
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hidden lg:table-cell">
                      Hire Date
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">
                          {emp.first_name} {emp.last_name}
                        </p>
                        <p className="text-xs text-gray-500">{emp.email}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 capitalize hidden sm:table-cell">
                        {emp.department.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            PAY_TYPE_COLORS[emp.pay_type] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {PAY_TYPE_LABELS[emp.pay_type] ?? emp.pay_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 hidden lg:table-cell">
                        {emp.pay_type === "salary"
                          ? `${usdWhole(emp.pay_rate)}/yr`
                          : emp.pay_type === "hourly"
                            ? `${usd(emp.pay_rate)}/hr`
                            : `${(emp.pay_rate * 100).toFixed(0)}%`}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden lg:table-cell">
                        {fmtDate(emp.hire_date)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            STATUS_BADGE_EMPLOYEE[emp.status] ??
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {STATUS_LABEL_EMPLOYEE[emp.status] ?? emp.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td
                      className="px-4 py-3 text-sm font-bold text-gray-900"
                      colSpan={6}
                    >
                      {employees.length} employees &middot;{" "}
                      {employees.filter((e) => e.status === "active").length}{" "}
                      active
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- Time & Attendance Tab ---- */}
      {tab === "time" && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          {timeError && (
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {timeError}
            </div>
          )}
          {timeLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Loading time entries...
            </div>
          ) : timeEntries.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">
                No time entries recorded yet.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Time entries appear here when employees clock in and out.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Employee
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hidden sm:table-cell">
                      Clock In
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hidden sm:table-cell">
                      Clock Out
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                      Hours
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500 hidden md:table-cell">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {timeEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {entry.employee_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {fmtDate(entry.date)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">
                        {fmtTime(entry.clock_in)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden sm:table-cell">
                        {entry.clock_out ? fmtTime(entry.clock_out) : (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                        {entry.hours > 0 ? entry.hours.toFixed(2) : "--"}
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            TIME_STATUS_BADGE[entry.status] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {entry.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td
                      className="px-4 py-3 text-sm font-bold text-gray-900"
                      colSpan={4}
                    >
                      {timeEntries.length} entries
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      {timeEntries
                        .reduce((s, e) => s + e.hours, 0)
                        .toFixed(2)}{" "}
                      hrs
                    </td>
                    <td className="hidden md:table-cell" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- Commissions Tab ---- */}
      {tab === "commissions" && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          {commError && (
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {commError}
            </div>
          )}
          {commLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Loading commissions...
            </div>
          ) : commissions.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">
                No commission entries yet.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Commissions are automatically calculated when deals are funded.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Employee
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hidden sm:table-cell">
                      Deal Source
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hidden md:table-cell">
                      Vehicle
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500 hidden lg:table-cell">
                      Gross Profit
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                      Commission
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {commissions.map((comm) => (
                    <tr key={comm.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {comm.employee_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {fmtDate(comm.date)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 capitalize hidden sm:table-cell">
                        {comm.deal_source.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 hidden md:table-cell">
                        {comm.vehicle}
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-gray-900 hidden lg:table-cell">
                        {usd(comm.gross_profit)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">
                        {usd(comm.commission_amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            COMMISSION_STATUS_BADGE[comm.status] ??
                            "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {comm.status.charAt(0).toUpperCase() +
                            comm.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td
                      className="px-4 py-3 text-sm font-bold text-gray-900"
                      colSpan={5}
                    >
                      {commissions.length} entries
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-green-600">
                      {usd(
                        commissions.reduce(
                          (s, c) => s + c.commission_amount,
                          0
                        )
                      )}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
