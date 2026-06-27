"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface CommissionEntry {
  id: string;
  employee_name: string;
  employee_role: "salesperson" | "fi_manager" | "sales_manager";
  sale_id: string;
  deal_description: string;
  gross_basis: number;
  rate_percent: number;
  amount: number;
  pay_period: string;
  paid: boolean;
  paid_date: string | null;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
}

const ROLE_LABELS: Record<string, string> = {
  salesperson: "Salesperson",
  fi_manager: "F&I Manager",
  sales_manager: "Sales Manager",
};

const ROLE_BADGE: Record<string, string> = {
  salesperson: "bg-blue-100 text-blue-700",
  fi_manager: "bg-purple-100 text-purple-700",
  sales_manager: "bg-orange-100 text-orange-700",
};

const PAY_PERIODS = [
  { value: "2026-03-16/2026-03-31", label: "Mar 16 – Mar 31, 2026" },
  { value: "2026-03-01/2026-03-15", label: "Mar 1 – Mar 15, 2026" },
  { value: "2026-02-16/2026-02-28", label: "Feb 16 – Feb 28, 2026" },
  { value: "2026-02-01/2026-02-15", label: "Feb 1 – Feb 15, 2026" },
];

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<CommissionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payPeriod, setPayPeriod] = useState(PAY_PERIODS[0].value);
  const [markingPaid, setMarkingPaid] = useState(false);

  const loadCommissions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchJson<{ commissions?: CommissionEntry[] }>(`/api/admin/accounting/commissions?pay_period=${encodeURIComponent(payPeriod)}`);
      setCommissions(data.commissions ?? []);
    } catch {
      setError("Failed to load commissions.");
    } finally {
      setLoading(false);
    }
  }, [payPeriod]);

  useEffect(() => {
    void loadCommissions();
  }, [loadCommissions]);

  // Group by employee
  const byEmployee = commissions.reduce<Record<string, CommissionEntry[]>>((acc, c) => {
    if (!acc[c.employee_name]) acc[c.employee_name] = [];
    acc[c.employee_name].push(c);
    return acc;
  }, {});

  const totalUnpaid = commissions.filter((c) => !c.paid).reduce((s, c) => s + c.amount, 0);
  const totalPaid = commissions.filter((c) => c.paid).reduce((s, c) => s + c.amount, 0);
  const totalAll = commissions.reduce((s, c) => s + c.amount, 0);

  async function handleMarkPaid(employeeName: string) {
    setMarkingPaid(true);
    try {
      const ids = commissions
        .filter((c) => c.employee_name === employeeName && !c.paid)
        .map((c) => c.id);
      if (!ids.length) return;

      await fetch("/api/admin/accounting/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_paid", ids }),
      });

      // Optimistic update
      setCommissions((prev) =>
        prev.map((c) =>
          ids.includes(c.id) ? { ...c, paid: true, paid_date: new Date().toISOString().split("T")[0] } : c,
        ),
      );
    } finally {
      setMarkingPaid(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commission Tracking</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track and pay commissions for each deal.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={payPeriod}
            onChange={(e) => setPayPeriod(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {PAY_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <a
            href="/admin/accounting"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sales Log
          </a>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Summary strip */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Total Owed</p>
          <p className="mt-0.5 text-xl font-bold text-gray-900">{usd(totalAll)}</p>
        </div>
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-yellow-700">Unpaid</p>
          <p className="mt-0.5 text-xl font-bold text-yellow-700">{usd(totalUnpaid)}</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 shadow-sm">
          <p className="text-xs font-medium text-green-700">Paid</p>
          <p className="mt-0.5 text-xl font-bold text-green-700">{usd(totalPaid)}</p>
        </div>
      </div>

      {/* Commission table grouped by employee */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
      ) : commissions.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          No commissions for this pay period.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byEmployee).map(([name, entries]) => {
            const empTotal = entries.reduce((s, c) => s + c.amount, 0);
            const empUnpaid = entries.filter((c) => !c.paid).length;

            return (
              <div key={name} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between border-b border-gray-100 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-gray-900">{name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[entries[0].employee_role] ?? "bg-gray-100 text-gray-700"}`}>
                      {ROLE_LABELS[entries[0].employee_role] ?? entries[0].employee_role}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-900">{usd(empTotal)}</span>
                    {empUnpaid > 0 && (
                      <button
                        onClick={() => handleMarkPaid(name)}
                        disabled={markingPaid}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        Mark All Paid
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Deal</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Gross Basis</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Rate</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {entries.map((c) => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm text-gray-700">{c.deal_description}</td>
                          <td className="px-4 py-2 text-sm text-gray-600 text-right">{usd(c.gross_basis)}</td>
                          <td className="px-4 py-2 text-sm text-gray-600 text-right">{c.rate_percent}%</td>
                          <td className="px-4 py-2 text-sm font-semibold text-gray-900 text-right">{usd(c.amount)}</td>
                          <td className="px-4 py-2 text-center">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                c.paid ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                              }`}
                            >
                              {c.paid ? "Paid" : "Unpaid"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
