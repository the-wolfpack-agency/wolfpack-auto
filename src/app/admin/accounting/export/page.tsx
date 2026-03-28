"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface Account {
  code: string;
  name: string;
  type: string;
  category: string;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

const TYPE_STYLES: Record<string, string> = {
  asset: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20",
  liability: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
  revenue: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  expense: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20",
};

const FORMAT_OPTIONS = [
  { value: "csv", label: "CSV", desc: "Standard comma-separated values" },
  { value: "quickbooks", label: "QuickBooks IIF", desc: "QuickBooks Desktop import format" },
  { value: "sage", label: "Sage 50", desc: "Sage 50 CSV import format" },
];

/* -------------------------------------------------------------------------- */
/* Mock preview data — matches API mock                                       */
/* -------------------------------------------------------------------------- */

const PREVIEW_ROWS = [
  { date: "2026-03-25", account: "4000", description: "Vehicle Sale — 2024 Toyota Camry SE", debit: 0, credit: 28500 },
  { date: "2026-03-25", account: "5000", description: "COGS — 2024 Toyota Camry SE", debit: 22800, credit: 0 },
  { date: "2026-03-25", account: "1000", description: "Cash receipt — Toyota Camry sale", debit: 28500, credit: 0 },
  { date: "2026-03-24", account: "4100", description: "F&I — GAP Insurance", debit: 0, credit: 895 },
  { date: "2026-03-24", account: "4100", description: "F&I — Extended Warranty", debit: 0, credit: 1450 },
  { date: "2026-03-24", account: "4000", description: "Vehicle Sale — 2023 Honda CR-V EX-L", debit: 0, credit: 32900 },
  { date: "2026-03-24", account: "5000", description: "COGS — 2023 Honda CR-V EX-L", debit: 26800, credit: 0 },
  { date: "2026-03-23", account: "4200", description: "Service — Oil change + tire rotation", debit: 0, credit: 189.95 },
  { date: "2026-03-23", account: "4300", description: "Parts — Brake pads (front)", debit: 0, credit: 124.50 },
  { date: "2026-03-23", account: "5100", description: "Floor Plan Interest — March batch", debit: 247.83, credit: 0 },
];

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function AccountingExportPage() {
  const [format, setFormat] = useState("csv");
  const [dateFrom, setDateFrom] = useState("2026-03-01");
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);

  // Chart of accounts
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("expense");
  const [addingAccount, setAddingAccount] = useState(false);

  useEffect(() => {
    setLoadingAccounts(true);
    fetch("/api/admin/accounting/chart-of-accounts")
      .then((r) => r.json())
      .then((data) => setAccounts(data.accounts ?? []))
      .catch(() => {})
      .finally(() => setLoadingAccounts(false));
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/accounting/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, date_from: dateFrom, date_to: dateTo }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "Export failed");
        return;
      }

      // Download the file
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] ?? `export.${format === "quickbooks" ? "iif" : "csv"}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newName.trim()) return;
    setAddingAccount(true);
    try {
      const res = await fetch("/api/admin/accounting/chart-of-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.trim(), name: newName.trim(), type: newType }),
      });
      if (res.ok) {
        const data = await res.json();
        setAccounts((prev) => [...prev, data.account].sort((a, b) => a.code.localeCompare(b.code)));
        setNewCode("");
        setNewName("");
        setShowAddAccount(false);
      }
    } finally {
      setAddingAccount(false);
    }
  };

  // Filter preview rows by date range
  const filteredPreview = PREVIEW_ROWS.filter(
    (r) => r.date >= dateFrom && r.date <= dateTo,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accounting Export</h1>
        <p className="mt-1 text-sm text-gray-500">Export transactions to QuickBooks, Sage, or CSV format</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Export controls */}
        <div className="lg:col-span-2 space-y-6">
          {/* Format selector */}
          <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Export Settings</h2>

            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">Format</label>
              <div className="grid gap-2 sm:grid-cols-3">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFormat(opt.value)}
                    className={`rounded-lg border-2 p-3 text-left transition ${
                      format === opt.value
                        ? "border-brand-500 bg-brand-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className={`text-sm font-medium ${format === opt.value ? "text-brand-700" : "text-gray-900"}`}>
                      {opt.label}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">From Date</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">To Date</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500" />
              </div>
            </div>

            <button
              onClick={handleExport}
              disabled={exporting}
              className="mt-4 w-full rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 sm:w-auto"
            >
              {exporting ? "Generating..." : "Download Export"}
            </button>
          </div>

          {/* Preview */}
          <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Preview ({filteredPreview.length} transactions)</h2>
            {filteredPreview.length === 0 ? (
              <p className="text-sm text-gray-400">No transactions in the selected date range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Account</th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Description</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Debit</th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredPreview.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-600">{row.date}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-sm font-mono text-gray-600">{row.account}</td>
                        <td className="px-3 py-2 text-sm text-gray-900">{row.description}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-sm text-gray-900">
                          {row.debit > 0 ? formatCurrency(row.debit) : ""}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right text-sm text-gray-900">
                          {row.credit > 0 ? formatCurrency(row.credit) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Chart of Accounts sidebar */}
        <div>
          <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Chart of Accounts</h2>
              <button
                onClick={() => setShowAddAccount(!showAddAccount)}
                className="rounded-lg border border-brand-300 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
              >
                Add Account
              </button>
            </div>

            {/* Add account form */}
            {showAddAccount && (
              <form onSubmit={handleAddAccount} className="mb-4 space-y-2 rounded-lg bg-gray-50 p-3">
                <input type="text" value={newCode} onChange={(e) => setNewCode(e.target.value)} required
                  placeholder="Account code (e.g. 6800)"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required
                  placeholder="Account name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
                <select value={newType} onChange={(e) => setNewType(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </select>
                <div className="flex gap-2">
                  <button type="submit" disabled={addingAccount}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                    {addingAccount ? "Adding..." : "Add"}
                  </button>
                  <button type="button" onClick={() => setShowAddAccount(false)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {loadingAccounts ? (
              <p className="text-sm text-gray-400">Loading...</p>
            ) : (
              <div className="max-h-[600px] overflow-y-auto">
                <table className="min-w-full">
                  <tbody className="divide-y divide-gray-100">
                    {accounts.map((acct) => (
                      <tr key={acct.code} className="hover:bg-gray-50">
                        <td className="py-1.5 pr-2 text-xs font-mono text-gray-500">{acct.code}</td>
                        <td className="py-1.5 pr-2 text-xs text-gray-900">{acct.name}</td>
                        <td className="py-1.5">
                          <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize ${TYPE_STYLES[acct.type] ?? "bg-gray-100 text-gray-600"}`}>
                            {acct.type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
