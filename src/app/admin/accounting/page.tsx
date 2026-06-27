"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/safe-fetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Account {
  id: string;
  number: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  balance: number;
  parent_id: string | null;
  active: boolean;
}

interface JournalEntry {
  id: string;
  date: string;
  description: string;
  reference: string;
  status: "draft" | "posted" | "void";
  lines: JournalLine[];
  created_at: string;
}

interface JournalLine {
  id: string;
  account_id: string;
  account_name: string;
  debit: number;
  credit: number;
  memo: string;
}

interface FinancialStatement {
  type: "trial_balance" | "income_statement" | "balance_sheet";
  title: string;
  as_of: string;
  sections: StatementSection[];
  totals: Record<string, number>;
}

interface StatementSection {
  label: string;
  rows: { account_name: string; amount: number }[];
  subtotal: number;
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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense",
};

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  asset: "bg-blue-50 text-blue-700 ring-blue-600/20",
  liability: "bg-red-50 text-red-700 ring-red-600/20",
  equity: "bg-purple-50 text-purple-700 ring-purple-600/20",
  revenue: "bg-green-50 text-green-700 ring-green-600/20",
  expense: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  posted: "bg-green-50 text-green-700 ring-green-600/20",
  void: "bg-gray-100 text-gray-500 ring-gray-400/20",
};

type Tab = "chart" | "journal" | "statements";

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function AccountingDashboard() {
  const [tab, setTab] = useState<Tab>("chart");

  /* Chart of Accounts state */
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState("");

  /* Journal Entries state */
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState("");

  /* New Journal Entry form */
  const [showNewEntry, setShowNewEntry] = useState(false);
  const [newEntryDate, setNewEntryDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [newEntryDesc, setNewEntryDesc] = useState("");
  const [newEntryRef, setNewEntryRef] = useState("");
  const [newEntryLines, setNewEntryLines] = useState<
    { account_id: string; debit: string; credit: string; memo: string }[]
  >([
    { account_id: "", debit: "", credit: "", memo: "" },
    { account_id: "", debit: "", credit: "", memo: "" },
  ]);
  const [submittingEntry, setSubmittingEntry] = useState(false);

  /* Financial Statements state */
  const [statement, setStatement] = useState<FinancialStatement | null>(null);
  const [statementsLoading, setStatementsLoading] = useState(false);
  const [statementsError, setStatementsError] = useState("");

  /* ---- Data fetching ---- */

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setAccountsError("");
    try {
      const data = await fetchJson<{ accounts?: Account[] }>("/api/admin/accounting/chart");
      setAccounts(data.accounts ?? []);
    } catch {
      setAccountsError("Failed to load chart of accounts.");
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    setEntriesError("");
    try {
      const data = await fetchJson<{ entries?: JournalEntry[] }>("/api/admin/accounting/journal");
      setEntries(data.entries ?? []);
    } catch {
      setEntriesError("Failed to load journal entries.");
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "chart") void loadAccounts();
    if (tab === "journal") {
      void loadEntries();
      void loadAccounts(); // need accounts list for the new entry form
    }
  }, [tab, loadAccounts, loadEntries]);

  /* ---- Journal Entry form handlers ---- */

  const addEntryLine = () => {
    setNewEntryLines((prev) => [
      ...prev,
      { account_id: "", debit: "", credit: "", memo: "" },
    ]);
  };

  const removeEntryLine = (idx: number) => {
    if (newEntryLines.length <= 2) return;
    setNewEntryLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateEntryLine = (
    idx: number,
    field: "account_id" | "debit" | "credit" | "memo",
    value: string
  ) => {
    setNewEntryLines((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, [field]: value } : line))
    );
  };

  const entryDebitsTotal = newEntryLines.reduce(
    (s, l) => s + (parseFloat(l.debit) || 0),
    0
  );
  const entryCreditsTotal = newEntryLines.reduce(
    (s, l) => s + (parseFloat(l.credit) || 0),
    0
  );
  const entryBalanced =
    Math.abs(entryDebitsTotal - entryCreditsTotal) < 0.01 &&
    entryDebitsTotal > 0;

  const submitEntry = async () => {
    if (!entryBalanced || !newEntryDesc.trim()) return;
    setSubmittingEntry(true);
    setEntriesError("");
    try {
      const res = await fetch("/api/admin/accounting/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: newEntryDate,
          description: newEntryDesc,
          reference: newEntryRef,
          lines: newEntryLines
            .filter((l) => l.account_id && (l.debit || l.credit))
            .map((l) => ({
              account_id: l.account_id,
              debit: parseFloat(l.debit) || 0,
              credit: parseFloat(l.credit) || 0,
              memo: l.memo,
            })),
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setShowNewEntry(false);
      setNewEntryDesc("");
      setNewEntryRef("");
      setNewEntryLines([
        { account_id: "", debit: "", credit: "", memo: "" },
        { account_id: "", debit: "", credit: "", memo: "" },
      ]);
      void loadEntries();
    } catch {
      setEntriesError("Failed to create journal entry.");
    } finally {
      setSubmittingEntry(false);
    }
  };

  /* ---- Financial Statement generation ---- */

  const generateStatement = async (
    type: "trial_balance" | "income_statement" | "balance_sheet"
  ) => {
    setStatementsLoading(true);
    setStatementsError("");
    setStatement(null);
    try {
      const data = await fetchJson<{ statement?: FinancialStatement | null }>(
        `/api/admin/accounting/statements?type=${type}`
      );
      setStatement(data.statement ?? null);
    } catch {
      setStatementsError("Failed to generate statement.");
    } finally {
      setStatementsLoading(false);
    }
  };

  /* ---- Tab buttons ---- */

  const tabs: { key: Tab; label: string }[] = [
    { key: "chart", label: "Chart of Accounts" },
    { key: "journal", label: "Journal Entries" },
    { key: "statements", label: "Financial Statements" },
  ];

  return (
    <div data-testid="accounting-page">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accounting</h1>
        <p className="mt-1 text-sm text-gray-500">
          General ledger, journal entries, and financial statements.
        </p>
      </div>

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

      {/* ---- Chart of Accounts ---- */}
      {tab === "chart" && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          {accountsError && (
            <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {accountsError}
            </div>
          )}
          {accountsLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Loading chart of accounts...
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-400">
                No accounts configured yet.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Set up your chart of accounts to start tracking finances.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Number
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Account Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hidden sm:table-cell">
                      Type
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                      Balance
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500 hidden md:table-cell">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {accounts.map((acct) => (
                    <tr
                      key={acct.id}
                      className={`hover:bg-gray-50 ${!acct.active ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-gray-600">
                        {acct.number}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        {acct.name}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            ACCOUNT_TYPE_COLORS[acct.type] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {ACCOUNT_TYPE_LABELS[acct.type] ?? acct.type}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right text-sm font-semibold ${
                          acct.balance < 0 ? "text-red-600" : "text-gray-900"
                        }`}
                      >
                        {usd(acct.balance)}
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            acct.active
                              ? "bg-green-50 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {acct.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td
                      className="px-4 py-3 text-sm font-bold text-gray-900"
                      colSpan={3}
                    >
                      {accounts.length} accounts
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      {usd(
                        accounts
                          .filter((a) => a.type === "asset")
                          .reduce((s, a) => s + a.balance, 0)
                      )}{" "}
                      assets
                    </td>
                    <td className="hidden md:table-cell" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ---- Journal Entries ---- */}
      {tab === "journal" && (
        <div>
          {/* New Entry Toggle */}
          <div className="mb-4 flex justify-end">
            <button
              onClick={() => setShowNewEntry(!showNewEntry)}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              {showNewEntry ? "Cancel" : "New Journal Entry"}
            </button>
          </div>

          {/* New Entry Form */}
          {showNewEntry && (
            <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-base font-semibold text-gray-800">
                New Journal Entry
              </h3>
              <div className="mb-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Date
                  </label>
                  <input
                    type="date"
                    value={newEntryDate}
                    onChange={(e) => setNewEntryDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newEntryDesc}
                    onChange={(e) => setNewEntryDesc(e.target.value)}
                    placeholder="e.g. Vehicle purchase"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Reference
                  </label>
                  <input
                    type="text"
                    value={newEntryRef}
                    onChange={(e) => setNewEntryRef(e.target.value)}
                    placeholder="e.g. INV-001"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              {/* Lines */}
              <div className="mb-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                        Account
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">
                        Debit
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">
                        Credit
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 hidden sm:table-cell">
                        Memo
                      </th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {newEntryLines.map((line, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <select
                            value={line.account_id}
                            onChange={(e) =>
                              updateEntryLine(idx, "account_id", e.target.value)
                            }
                            className="w-full min-w-[140px] rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                          >
                            <option value="">Select account</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.number} - {a.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.debit}
                            onChange={(e) =>
                              updateEntryLine(idx, "debit", e.target.value)
                            }
                            placeholder="0.00"
                            className="w-24 rounded border border-gray-300 px-2 py-1.5 text-right text-sm focus:border-brand-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.credit}
                            onChange={(e) =>
                              updateEntryLine(idx, "credit", e.target.value)
                            }
                            placeholder="0.00"
                            className="w-24 rounded border border-gray-300 px-2 py-1.5 text-right text-sm focus:border-brand-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2 hidden sm:table-cell">
                          <input
                            type="text"
                            value={line.memo}
                            onChange={(e) =>
                              updateEntryLine(idx, "memo", e.target.value)
                            }
                            placeholder="Optional memo"
                            className="w-full min-w-[100px] rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {newEntryLines.length > 2 && (
                            <button
                              onClick={() => removeEntryLine(idx)}
                              className="text-red-400 hover:text-red-600"
                              title="Remove line"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td className="px-3 py-2 text-sm font-semibold text-gray-700">
                        Totals
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-semibold text-gray-900">
                        {usd(entryDebitsTotal)}
                      </td>
                      <td className="px-3 py-2 text-right text-sm font-semibold text-gray-900">
                        {usd(entryCreditsTotal)}
                      </td>
                      <td className="px-3 py-2 hidden sm:table-cell">
                        {entryBalanced ? (
                          <span className="text-xs font-medium text-green-600">
                            Balanced
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-red-600">
                            Difference: {usd(Math.abs(entryDebitsTotal - entryCreditsTotal))}
                          </span>
                        )}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  onClick={addEntryLine}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  + Add Line
                </button>
                <button
                  onClick={submitEntry}
                  disabled={!entryBalanced || !newEntryDesc.trim() || submittingEntry}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {submittingEntry ? "Posting..." : "Post Entry"}
                </button>
              </div>
            </div>
          )}

          {entriesError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {entriesError}
            </div>
          )}

          {/* Entries List */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            {entriesLoading ? (
              <div className="py-12 text-center text-sm text-gray-400">
                Loading journal entries...
              </div>
            ) : entries.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400">
                  No journal entries recorded yet.
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Click New Journal Entry to create your first entry.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {entries.map((entry) => {
                  const total = entry.lines.reduce(
                    (s, l) => s + l.debit,
                    0
                  );
                  return (
                    <div
                      key={entry.id}
                      className="px-5 py-4 hover:bg-gray-50"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900">
                              {entry.description}
                            </p>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                                STATUS_COLORS[entry.status] ?? STATUS_COLORS.draft
                              }`}
                            >
                              {entry.status.charAt(0).toUpperCase() +
                                entry.status.slice(1)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {fmtDate(entry.date)}
                            {entry.reference && ` | Ref: ${entry.reference}`}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-gray-900">
                          {usd(total)}
                        </p>
                      </div>
                      {entry.lines.length > 0 && (
                        <div className="mt-2 overflow-x-auto rounded-lg border border-gray-100">
                          <table className="min-w-full text-xs">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-1.5 text-left font-medium text-gray-500">
                                  Account
                                </th>
                                <th className="px-3 py-1.5 text-right font-medium text-gray-500">
                                  Debit
                                </th>
                                <th className="px-3 py-1.5 text-right font-medium text-gray-500">
                                  Credit
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {entry.lines.map((line) => (
                                <tr key={line.id}>
                                  <td className="px-3 py-1.5 text-gray-700">
                                    {line.account_name}
                                  </td>
                                  <td className="px-3 py-1.5 text-right text-gray-900">
                                    {line.debit > 0 ? usd(line.debit) : ""}
                                  </td>
                                  <td className="px-3 py-1.5 text-right text-gray-900">
                                    {line.credit > 0 ? usd(line.credit) : ""}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Financial Statements ---- */}
      {tab === "statements" && (
        <div>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => generateStatement("trial_balance")}
              disabled={statementsLoading}
              className="rounded-lg border border-brand-600 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
            >
              Trial Balance
            </button>
            <button
              onClick={() => generateStatement("income_statement")}
              disabled={statementsLoading}
              className="rounded-lg border border-brand-600 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
            >
              Profit & Loss
            </button>
            <button
              onClick={() => generateStatement("balance_sheet")}
              disabled={statementsLoading}
              className="rounded-lg border border-brand-600 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
            >
              Balance Sheet
            </button>
          </div>

          {statementsError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {statementsError}
            </div>
          )}

          {statementsLoading && (
            <div className="py-12 text-center text-sm text-gray-400">
              Generating statement...
            </div>
          )}

          {!statementsLoading && !statement && !statementsError && (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 py-12 text-center">
              <p className="text-sm text-gray-400">
                Select a statement type above to generate a financial report.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Reports are generated from your posted journal entries.
              </p>
            </div>
          )}

          {statement && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 text-center">
                <h2 className="text-lg font-bold text-gray-900">
                  {statement.title}
                </h2>
                <p className="text-sm text-gray-500">
                  As of {fmtDate(statement.as_of)}
                </p>
              </div>

              {statement.sections.map((section, idx) => (
                <div key={idx} className="mb-4">
                  <h3 className="mb-2 border-b border-gray-200 pb-1 text-sm font-semibold uppercase text-gray-600">
                    {section.label}
                  </h3>
                  <div className="space-y-1">
                    {section.rows.map((row, ri) => (
                      <div
                        key={ri}
                        className="flex items-center justify-between px-2 py-1"
                      >
                        <span className="text-sm text-gray-700">
                          {row.account_name}
                        </span>
                        <span
                          className={`text-sm font-medium ${
                            row.amount < 0 ? "text-red-600" : "text-gray-900"
                          }`}
                        >
                          {usd(row.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-gray-200 px-2 pt-1">
                    <span className="text-sm font-semibold text-gray-700">
                      Total {section.label}
                    </span>
                    <span className="text-sm font-bold text-gray-900">
                      {usd(section.subtotal)}
                    </span>
                  </div>
                </div>
              ))}

              {Object.keys(statement.totals).length > 0 && (
                <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
                  {Object.entries(statement.totals).map(([label, amount]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between py-1"
                    >
                      <span className="text-sm font-bold text-brand-700">
                        {label}
                      </span>
                      <span className="text-lg font-bold text-brand-700">
                        {usd(amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
