"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface Transaction {
  id: string;
  amount: number;
  currency: string;
  status: "succeeded" | "failed" | "pending" | "refunded";
  type: string;
  customer_name: string;
  customer_email: string;
  description: string;
  stripe_id: string | null;
  created_at: string;
}

interface StripeConfig {
  status: "configured" | "test" | "live" | "not_configured";
  publishable_key_set: boolean;
  secret_key_set: boolean;
  webhook_configured: boolean;
  mode: string;
}

interface Reconciliation {
  date: string;
  total_collected: number;
  total_fees: number;
  net_amount: number;
  transaction_count: number;
  successful_count: number;
  failed_count: number;
  pending_count: number;
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

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_BADGE: Record<string, string> = {
  succeeded: "bg-green-50 text-green-700 ring-green-600/20",
  failed: "bg-red-50 text-red-700 ring-red-600/20",
  pending: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  refunded: "bg-gray-100 text-gray-600 ring-gray-400/20",
};

const STATUS_LABEL: Record<string, string> = {
  succeeded: "Succeeded",
  failed: "Failed",
  pending: "Pending",
  refunded: "Refunded",
};

const STRIPE_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; dot: string }
> = {
  live: {
    label: "Live",
    color: "bg-green-50 text-green-700 border-green-200",
    dot: "bg-green-500",
  },
  test: {
    label: "Test Mode",
    color: "bg-yellow-50 text-yellow-700 border-yellow-200",
    dot: "bg-yellow-500",
  },
  configured: {
    label: "Configured",
    color: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
  not_configured: {
    label: "Not Configured",
    color: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
};

const PAYMENT_TYPES = [
  { value: "deposit", label: "Deposit" },
  { value: "down_payment", label: "Down Payment" },
  { value: "service", label: "Service Payment" },
  { value: "parts", label: "Parts Payment" },
  { value: "fi_product", label: "F&I Product" },
  { value: "other", label: "Other" },
];

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function PaymentsDashboard() {
  /* Stripe config */
  const [stripeConfig, setStripeConfig] = useState<StripeConfig | null>(null);

  /* Transactions */
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState("");

  /* Reconciliation */
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [reconLoading, setReconLoading] = useState(true);

  /* New Payment form */
  const [showNewPayment, setShowNewPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentType, setPaymentType] = useState("deposit");
  const [paymentCustomer, setPaymentCustomer] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  /* ---- Data fetching ---- */

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/payments");
      const data = await res.json();
      setStripeConfig(data.config ?? null);
    } catch {
      /* Stripe config is non-critical */
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    setTxError("");
    try {
      const res = await fetch("/api/admin/payments");
      const data = await res.json();
      setTransactions(data.transactions ?? []);
    } catch {
      setTxError("Failed to load transactions.");
    } finally {
      setTxLoading(false);
    }
  }, []);

  const loadReconciliation = useCallback(async () => {
    setReconLoading(true);
    try {
      const res = await fetch("/api/admin/payments/reconciliation");
      const data = await res.json();
      setRecon(data.reconciliation ?? null);
    } catch {
      /* Reconciliation is non-critical */
    } finally {
      setReconLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadTransactions();
    void loadReconciliation();
  }, [loadConfig, loadTransactions, loadReconciliation]);

  /* ---- Form validation ---- */

  const amountValid =
    paymentAmount !== "" &&
    !isNaN(parseFloat(paymentAmount)) &&
    parseFloat(paymentAmount) > 0;
  const formValid = amountValid && paymentCustomer.trim().length > 0;

  /* ---- Submit new payment ---- */

  const handleSubmitPayment = async () => {
    if (!formValid) return;
    setSubmitting(true);
    setTxError("");
    setSuccessMsg("");
    try {
      const res = await fetch("/api/admin/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(paymentAmount),
          type: paymentType,
          customer_name: paymentCustomer.trim(),
          description: paymentDescription.trim(),
        }),
      });
      if (!res.ok) throw new Error("Payment failed");
      setSuccessMsg("Payment submitted successfully.");
      setShowNewPayment(false);
      setPaymentAmount("");
      setPaymentCustomer("");
      setPaymentDescription("");
      setPaymentType("deposit");
      void loadTransactions();
      void loadReconciliation();
    } catch {
      setTxError("Failed to process payment.");
    } finally {
      setSubmitting(false);
    }
  };

  const stripeStatus =
    STRIPE_STATUS_CONFIG[stripeConfig?.status ?? "not_configured"];

  return (
    <div data-testid="payments-page">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="mt-1 text-sm text-gray-500">
            Process payments, track transactions, and reconcile daily totals.
          </p>
        </div>
        <button
          onClick={() => setShowNewPayment(!showNewPayment)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {showNewPayment ? "Cancel" : "New Payment"}
        </button>
      </div>

      {txError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {txError}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      {/* Stripe Status + Reconciliation */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Stripe indicator */}
        <div
          className={`rounded-2xl border p-4 shadow-sm ${stripeStatus.color}`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${stripeStatus.dot}`}
            />
            <p className="text-xs font-medium">Stripe Status</p>
          </div>
          <p className="mt-1 text-lg font-bold">{stripeStatus.label}</p>
          {stripeConfig && (
            <p className="mt-0.5 text-xs opacity-75">
              {stripeConfig.mode === "live" ? "Live keys" : "Test keys"}
              {stripeConfig.webhook_configured ? " + Webhook" : ""}
            </p>
          )}
        </div>

        {/* Reconciliation cards */}
        {reconLoading ? (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">
                Total Collected
              </p>
              <p className="mt-1 text-sm text-gray-300">Loading...</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">Fees</p>
              <p className="mt-1 text-sm text-gray-300">Loading...</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">Net</p>
              <p className="mt-1 text-sm text-gray-300">Loading...</p>
            </div>
          </>
        ) : recon ? (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">
                Total Collected
              </p>
              <p className="mt-1 text-2xl font-bold text-green-600">
                {usd(recon.total_collected)}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {recon.successful_count} successful of{" "}
                {recon.transaction_count} total
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">
                Processing Fees
              </p>
              <p className="mt-1 text-2xl font-bold text-red-600">
                {usd(recon.total_fees)}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {recon.failed_count > 0
                  ? `${recon.failed_count} failed`
                  : "No failures"}
              </p>
            </div>
            <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 shadow-sm">
              <p className="text-xs font-medium text-brand-700">Net Amount</p>
              <p className="mt-1 text-2xl font-bold text-brand-700">
                {usd(recon.net_amount)}
              </p>
              <p className="mt-0.5 text-xs text-brand-600">
                {recon.date} &middot;{" "}
                {recon.pending_count > 0
                  ? `${recon.pending_count} pending`
                  : "All settled"}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">
                Total Collected
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-300">--</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">
                Processing Fees
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-300">--</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-gray-500">Net Amount</p>
              <p className="mt-1 text-2xl font-bold text-gray-300">--</p>
            </div>
          </>
        )}
      </div>

      {/* New Payment Form */}
      {showNewPayment && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-800">
            Process New Payment
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  className={`w-full rounded-lg border py-2 pl-7 pr-3 text-sm focus:outline-none focus:ring-1 ${
                    paymentAmount && !amountValid
                      ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-brand-500 focus:ring-brand-500"
                  }`}
                />
              </div>
              {paymentAmount && !amountValid && (
                <p className="mt-1 text-xs text-red-500">
                  Enter a valid amount greater than $0.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Payment Type
              </label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {PAYMENT_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>
                    {pt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Customer Name
              </label>
              <input
                type="text"
                value={paymentCustomer}
                onChange={(e) => setPaymentCustomer(e.target.value)}
                placeholder="John Smith"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">
                Description
              </label>
              <input
                type="text"
                value={paymentDescription}
                onChange={(e) => setPaymentDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSubmitPayment}
              disabled={!formValid || submitting}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {submitting ? "Processing..." : "Submit Payment"}
            </button>
          </div>
        </div>
      )}

      {/* Transaction List */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-800">
            Recent Transactions
          </h2>
        </div>
        {txLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">
            Loading transactions...
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-400">No transactions yet.</p>
            <p className="mt-1 text-xs text-gray-400">
              Process a payment to see transactions here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hidden sm:table-cell">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hidden md:table-cell">
                    Description
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {fmtDateTime(tx.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {tx.customer_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize hidden sm:table-cell">
                      {tx.type.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell max-w-[200px] truncate">
                      {tx.description || "--"}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                      {usd(tx.amount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          STATUS_BADGE[tx.status] ?? STATUS_BADGE.pending
                        }`}
                      >
                        {STATUS_LABEL[tx.status] ?? tx.status}
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
                    {transactions.length} transactions
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                    {usd(
                      transactions
                        .filter((t) => t.status === "succeeded")
                        .reduce((s, t) => s + t.amount, 0)
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
