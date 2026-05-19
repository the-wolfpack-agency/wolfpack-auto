"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { reportClientError } from "@/lib/client-log";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface FiProduct {
  id: string;
  name: string;
  cost: number;
  retail_price: number;
  term?: string;
}

interface LenderSubmission {
  lender: string;
  status: string;
  apr: number | null;
  submitted_at: string;
}

interface TimelineEntry {
  action: string;
  by: string;
  at: string;
}

interface Deal {
  id: string;
  status: string;
  deal_type: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  customer_credit_score: number | null;
  salesperson: string | null;
  sales_manager: string | null;
  fi_manager: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_vin: string;
  vehicle_stock: string | null;
  vehicle_color: string | null;
  vehicle_mileage: number;
  vehicle_trim: string | null;
  msrp: number;
  selling_price: number;
  invoice: number;
  holdback: number;
  pack: number;
  trade_vehicle: string | null;
  trade_vin: string | null;
  trade_value: number;
  trade_acv: number;
  trade_payoff: number;
  trade_payoff_good_through: string | null;
  down_payment: number;
  rebates: number;
  apr: number;
  term_months: number;
  money_factor: number | null;
  residual_pct: number | null;
  monthly_payment: number;
  amount_financed: number;
  total_interest: number;
  total_cost: number;
  front_gross: number;
  back_gross: number;
  total_gross: number;
  fi_products: FiProduct[];
  lender: string | null;
  lender_status: string | null;
  lender_approval_number: string | null;
  lender_stipulations: string[];
  lender_submissions: LenderSubmission[];
  fees: {
    doc_fee: number;
    title_fee: number;
    registration_fee: number;
    tax_rate: number;
    tax_amount: number;
  };
  notes: string | null;
  timeline: TimelineEntry[];
  created_at: string;
  updated_at: string;
}

interface CalcResult {
  deal_type: string;
  monthly_payment: number;
  amount_financed?: number;
  total_interest?: number;
  total_cost?: number;
  total_due?: number;
  adjusted_cap_cost?: number;
  residual_value?: number;
  depreciation?: number;
  rent_charge?: number;
  monthly_pre_tax?: number;
  monthly_tax?: number;
  implied_apr?: number;
  sales_tax?: number;
  [key: string]: unknown;
}

interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  cost: number;
  retail_price: number;
  margin: number;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_FLOW = ["working", "pending_approval", "approved", "presented", "accepted", "funded", "delivered"];

const STATUS_LABEL: Record<string, string> = {
  working: "Working",
  pending_approval: "Pending Approval",
  approved: "Approved",
  presented: "Presented",
  accepted: "Accepted",
  funded: "Funded",
  delivered: "Delivered",
  unwound: "Unwound",
};

const STATUS_BADGE: Record<string, string> = {
  working: "bg-blue-50 text-blue-700 ring-blue-600/20",
  pending_approval: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  approved: "bg-green-50 text-green-700 ring-green-600/20",
  presented: "bg-purple-50 text-purple-700 ring-purple-600/20",
  accepted: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  funded: "bg-teal-50 text-teal-700 ring-teal-600/20",
  delivered: "bg-gray-100 text-gray-600 ring-gray-400/20",
  unwound: "bg-red-50 text-red-700 ring-red-600/20",
};

const LENDER_STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  submitted: "bg-blue-50 text-blue-700",
  approved: "bg-green-50 text-green-700",
  declined: "bg-red-50 text-red-700",
  funded: "bg-teal-50 text-teal-700",
  conditional: "bg-orange-50 text-orange-700",
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtFull(n: number): string {
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
    hour: "numeric",
    minute: "2-digit",
  });
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = params.dealId as string;

  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* Calculator state */
  const [calcTab, setCalcTab] = useState<"retail" | "lease" | "cash">("retail");
  const [calcForm, setCalcForm] = useState({
    selling_price: 0,
    trade_value: 0,
    trade_payoff: 0,
    down_payment: 0,
    rebates: 0,
    apr: 5.99,
    term_months: 60,
    residual_pct: 55,
    money_factor: 0.00125,
    fi_total: 0,
    doc_fee: 150,
    tax_rate: 6.25,
  });
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  /* F&I product catalog */
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [selectedFiIds, setSelectedFiIds] = useState<Set<string>>(new Set());

  /* Fetch deal */
  const fetchDeal = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/deals/${dealId}`);
      if (res.ok) {
        const data = await res.json();
        const d = data.deal as Deal;
        setDeal(d);
        setCalcTab(d.deal_type as "retail" | "lease" | "cash");
        setCalcForm((prev) => ({
          ...prev,
          selling_price: d.selling_price,
          trade_value: d.trade_value,
          trade_payoff: d.trade_payoff,
          down_payment: d.down_payment,
          rebates: d.rebates,
          apr: d.apr || prev.apr,
          term_months: d.term_months || prev.term_months,
          residual_pct: d.residual_pct || prev.residual_pct,
          money_factor: d.money_factor || prev.money_factor,
          tax_rate: d.fees?.tax_rate || prev.tax_rate,
          doc_fee: d.fees?.doc_fee || prev.doc_fee,
        }));
        setSelectedFiIds(new Set(d.fi_products.map((p) => p.id)));
      }
    } catch (err) {
      reportClientError("admin.deal_detail.fetch_failed", err);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  /* Fetch F&I catalog */
  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/fi-products");
      if (res.ok) {
        const data = await res.json();
        setCatalog(data.products ?? []);
      }
    } catch (err) {
      reportClientError("admin.deal_detail.fi_catalog_failed", err);
    }
  }, []);

  useEffect(() => {
    fetchDeal();
    fetchCatalog();
  }, [fetchDeal, fetchCatalog]);

  /* Calculate payment */
  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const fiTotal = catalog
        .filter((p) => selectedFiIds.has(p.id))
        .reduce((s, p) => s + p.retail_price, 0);

      const res = await fetch(`/api/admin/deals/${dealId}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...calcForm,
          deal_type: calcTab,
          fi_total: fiTotal,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCalcResult(data.calculation);
      }
    } catch (err) {
      reportClientError("admin.deal_detail.calculate_failed", err);
    } finally {
      setCalculating(false);
    }
  };

  /* Update deal status */
  const handleStatusChange = async (newStatus: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setDeal(data.deal);
      }
    } catch (err) {
      reportClientError("admin.deal_detail.status_update_failed", err);
    } finally {
      setSaving(false);
    }
  };

  /* Toggle F&I product */
  const toggleFi = (productId: string) => {
    setSelectedFiIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  /* F&I running totals */
  const fiSelected = catalog.filter((p) => selectedFiIds.has(p.id));
  const fiRetailTotal = fiSelected.reduce((s, p) => s + p.retail_price, 0);
  const fiCostTotal = fiSelected.reduce((s, p) => s + p.cost, 0);
  const fiMarginTotal = fiRetailTotal - fiCostTotal;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <p className="text-gray-400">Loading deal...</p>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <div className="text-center">
          <p className="text-gray-500">Deal not found</p>
          <Link href="/admin/deals" className="mt-2 inline-block text-sm text-brand-600 hover:text-brand-700">
            Back to deals
          </Link>
        </div>
      </div>
    );
  }

  const currentStatusIdx = STATUS_FLOW.indexOf(deal.status);
  const nextStatus = currentStatusIdx >= 0 && currentStatusIdx < STATUS_FLOW.length - 1
    ? STATUS_FLOW[currentStatusIdx + 1]
    : null;

  /* Gross breakdown */
  const frontGross = deal.selling_price - deal.invoice;
  const backGross = fiMarginTotal;
  const totalGross = frontGross + backGross;

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Breadcrumb + header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/admin/deals" className="text-xs text-brand-600 hover:text-brand-700">
              &larr; Back to Deal Desking
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">
              {deal.customer_name}
            </h1>
            <p className="text-sm text-gray-500">
              {[deal.vehicle_year, deal.vehicle_make, deal.vehicle_model].filter(Boolean).join(" ")}
              {deal.vehicle_stock && <span className="ml-2 text-gray-400">#{deal.vehicle_stock}</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${STATUS_BADGE[deal.status] || "bg-gray-100 text-gray-600"}`}
            >
              {STATUS_LABEL[deal.status] || deal.status}
            </span>
            {nextStatus && (
              <button
                onClick={() => handleStatusChange(nextStatus)}
                disabled={saving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "..." : `Advance to ${STATUS_LABEL[nextStatus]}`}
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ---- LEFT COLUMN (2/3) ---- */}
          <div className="space-y-6 lg:col-span-2">
            {/* Vehicle + Customer info */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* Vehicle */}
              <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Vehicle</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <Row label="Year/Make/Model" value={`${deal.vehicle_year} ${deal.vehicle_make} ${deal.vehicle_model}`} />
                  {deal.vehicle_trim && <Row label="Trim" value={deal.vehicle_trim} />}
                  <Row label="VIN" value={deal.vehicle_vin} mono />
                  {deal.vehicle_stock && <Row label="Stock #" value={deal.vehicle_stock} />}
                  {deal.vehicle_color && <Row label="Color" value={deal.vehicle_color} />}
                  <Row label="Mileage" value={deal.vehicle_mileage.toLocaleString()} />
                  <Row label="MSRP" value={fmt(deal.msrp)} />
                  <Row label="Invoice" value={fmt(deal.invoice)} />
                  <Row label="Selling Price" value={fmt(deal.selling_price)} bold />
                </div>
              </div>

              {/* Customer */}
              <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Customer</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <Row label="Name" value={deal.customer_name} bold />
                  {deal.customer_email && <Row label="Email" value={deal.customer_email} />}
                  {deal.customer_phone && <Row label="Phone" value={deal.customer_phone} />}
                  {deal.customer_address && <Row label="Address" value={deal.customer_address} />}
                  {deal.customer_credit_score && <Row label="Credit Score" value={String(deal.customer_credit_score)} />}
                  <div className="border-t border-surface-border pt-2" />
                  {deal.salesperson && <Row label="Salesperson" value={deal.salesperson} />}
                  {deal.sales_manager && <Row label="Sales Mgr" value={deal.sales_manager} />}
                  {deal.fi_manager && <Row label="F&I Mgr" value={deal.fi_manager} />}
                </div>
              </div>
            </div>

            {/* Trade-in */}
            {deal.trade_vehicle && (
              <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Trade-In</h3>
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  <Row label="Vehicle" value={deal.trade_vehicle} />
                  {deal.trade_vin && <Row label="Trade VIN" value={deal.trade_vin} mono />}
                  <Row label="ACV" value={fmt(deal.trade_acv)} />
                  <Row label="Allowance" value={fmt(deal.trade_value)} bold />
                  <Row label="Payoff" value={fmt(deal.trade_payoff)} />
                  <Row label="Equity" value={fmt(deal.trade_value - deal.trade_payoff)} bold />
                  {deal.trade_payoff_good_through && (
                    <Row label="Payoff Good Thru" value={deal.trade_payoff_good_through} />
                  )}
                </div>
              </div>
            )}

            {/* Payment Calculator */}
            <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Payment Calculator</h3>

              {/* Tabs */}
              <div className="mt-3 flex gap-1 rounded-lg bg-surface-subtle p-1">
                {(["retail", "lease", "cash"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setCalcTab(tab)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      calcTab === tab
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {tab === "retail" ? "Retail (Loan)" : tab === "lease" ? "Lease" : "Cash"}
                  </button>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <CalcField
                  label="Selling Price"
                  value={calcForm.selling_price}
                  onChange={(v) => setCalcForm({ ...calcForm, selling_price: v })}
                  prefix="$"
                />
                <CalcField
                  label="Trade Value"
                  value={calcForm.trade_value}
                  onChange={(v) => setCalcForm({ ...calcForm, trade_value: v })}
                  prefix="$"
                />
                <CalcField
                  label="Trade Payoff"
                  value={calcForm.trade_payoff}
                  onChange={(v) => setCalcForm({ ...calcForm, trade_payoff: v })}
                  prefix="$"
                />
                <CalcField
                  label="Down Payment"
                  value={calcForm.down_payment}
                  onChange={(v) => setCalcForm({ ...calcForm, down_payment: v })}
                  prefix="$"
                />
                <CalcField
                  label="Rebates"
                  value={calcForm.rebates}
                  onChange={(v) => setCalcForm({ ...calcForm, rebates: v })}
                  prefix="$"
                />
                {calcTab === "retail" && (
                  <>
                    <CalcField
                      label="APR %"
                      value={calcForm.apr}
                      onChange={(v) => setCalcForm({ ...calcForm, apr: v })}
                      suffix="%"
                      step={0.01}
                    />
                    <CalcField
                      label="Term (months)"
                      value={calcForm.term_months}
                      onChange={(v) => setCalcForm({ ...calcForm, term_months: v })}
                      step={1}
                    />
                  </>
                )}
                {calcTab === "lease" && (
                  <>
                    <CalcField
                      label="Residual %"
                      value={calcForm.residual_pct}
                      onChange={(v) => setCalcForm({ ...calcForm, residual_pct: v })}
                      suffix="%"
                    />
                    <CalcField
                      label="Money Factor"
                      value={calcForm.money_factor}
                      onChange={(v) => setCalcForm({ ...calcForm, money_factor: v })}
                      step={0.00001}
                    />
                    <CalcField
                      label="Term (months)"
                      value={calcForm.term_months}
                      onChange={(v) => setCalcForm({ ...calcForm, term_months: v })}
                      step={1}
                    />
                  </>
                )}
                <CalcField
                  label="Tax Rate %"
                  value={calcForm.tax_rate}
                  onChange={(v) => setCalcForm({ ...calcForm, tax_rate: v })}
                  suffix="%"
                  step={0.01}
                />
                <CalcField
                  label="Doc Fee"
                  value={calcForm.doc_fee}
                  onChange={(v) => setCalcForm({ ...calcForm, doc_fee: v })}
                  prefix="$"
                />
              </div>

              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={handleCalculate}
                  disabled={calculating}
                  className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                >
                  {calculating ? "Calculating..." : "Calculate Payment"}
                </button>

                {calcResult && (
                  <div className="flex flex-wrap items-baseline gap-4">
                    <div>
                      <span className="text-xs text-gray-500">Monthly</span>
                      <p className="text-2xl font-bold text-brand-700">
                        {fmtFull(calcResult.monthly_payment)}
                        <span className="text-sm font-normal text-gray-400">/mo</span>
                      </p>
                    </div>
                    {calcResult.amount_financed !== undefined && calcResult.amount_financed > 0 && (
                      <div>
                        <span className="text-xs text-gray-500">Financed</span>
                        <p className="text-lg font-semibold text-gray-700">{fmt(calcResult.amount_financed)}</p>
                      </div>
                    )}
                    {calcResult.total_interest !== undefined && calcResult.total_interest > 0 && (
                      <div>
                        <span className="text-xs text-gray-500">Total Interest</span>
                        <p className="text-lg font-semibold text-gray-700">{fmt(calcResult.total_interest)}</p>
                      </div>
                    )}
                    {calcResult.total_cost !== undefined && calcResult.total_cost > 0 && (
                      <div>
                        <span className="text-xs text-gray-500">Total Cost</span>
                        <p className="text-lg font-semibold text-gray-700">{fmt(calcResult.total_cost)}</p>
                      </div>
                    )}
                    {calcResult.total_due !== undefined && (
                      <div>
                        <span className="text-xs text-gray-500">Total Due</span>
                        <p className="text-lg font-semibold text-gray-700">{fmt(calcResult.total_due)}</p>
                      </div>
                    )}
                    {calcResult.residual_value !== undefined && (
                      <div>
                        <span className="text-xs text-gray-500">Residual</span>
                        <p className="text-lg font-semibold text-gray-700">{fmt(calcResult.residual_value)}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* F&I Product Menu */}
            <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">F&I Products</h3>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Back Gross (F&I)</p>
                  <p className="text-lg font-bold text-purple-600">{fmt(fiMarginTotal)}</p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {catalog.map((product) => {
                  const isSelected = selectedFiIds.has(product.id);
                  return (
                    <label
                      key={product.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                        isSelected
                          ? "border-brand-300 bg-brand-50"
                          : "border-surface-border hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleFi(product.id)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{product.name}</p>
                        <p className="text-xs text-gray-500">{product.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">{fmt(product.retail_price)}</p>
                        <p className="text-xs text-green-600">+{fmt(product.margin)} margin</p>
                      </div>
                    </label>
                  );
                })}
              </div>

              {fiSelected.length > 0 && (
                <div className="mt-4 rounded-lg bg-surface-subtle p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Products selected</span>
                    <span className="font-medium">{fiSelected.length}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-gray-500">Retail total</span>
                    <span className="font-medium">{fmt(fiRetailTotal)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-gray-500">Cost</span>
                    <span className="font-medium text-gray-600">{fmt(fiCostTotal)}</span>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-surface-border pt-1 text-sm">
                    <span className="font-medium text-gray-700">Back Gross</span>
                    <span className="font-bold text-purple-600">{fmt(fiMarginTotal)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Lender Submissions */}
            {deal.lender_submissions && deal.lender_submissions.length > 0 && (
              <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Lender Submissions</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-border text-left text-xs font-medium uppercase text-gray-500">
                        <th className="pb-2 pr-4">Lender</th>
                        <th className="pb-2 pr-4">Status</th>
                        <th className="pb-2 pr-4">APR</th>
                        <th className="pb-2">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deal.lender_submissions.map((sub, i) => (
                        <tr key={i} className="border-b border-surface-border last:border-0">
                          <td className="py-2 pr-4 font-medium text-gray-900">{sub.lender}</td>
                          <td className="py-2 pr-4">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${LENDER_STATUS_BADGE[sub.status] || "bg-gray-100 text-gray-600"}`}
                            >
                              {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                            </span>
                          </td>
                          <td className="py-2 pr-4 text-gray-600">
                            {sub.apr ? `${sub.apr}%` : "--"}
                          </td>
                          <td className="py-2 text-xs text-gray-400">{fmtDate(sub.submitted_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {deal.lender_stipulations && deal.lender_stipulations.length > 0 && (
                  <div className="mt-3 rounded-lg bg-yellow-50 p-3">
                    <p className="text-xs font-semibold text-yellow-800">Stipulations:</p>
                    <ul className="mt-1 list-disc pl-4 text-xs text-yellow-700">
                      {deal.lender_stipulations.map((stip, i) => (
                        <li key={i}>{stip}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ---- RIGHT COLUMN (1/3) ---- */}
          <div className="space-y-6">
            {/* Gross Breakdown */}
            <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Gross Breakdown</h3>
              <div className="mt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Selling Price</span>
                  <span className="font-medium">{fmt(deal.selling_price)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Invoice</span>
                  <span className="font-medium text-gray-600">{fmt(deal.invoice)}</span>
                </div>
                <div className="flex justify-between border-t border-surface-border pt-2 text-sm">
                  <span className="font-medium text-gray-700">Front Gross</span>
                  <span className={`font-bold ${frontGross >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {fmt(frontGross)}
                  </span>
                </div>
                {deal.holdback > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">+ Holdback</span>
                    <span className="font-medium text-green-600">{fmt(deal.holdback)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-surface-border pt-2 text-sm">
                  <span className="font-medium text-gray-700">Back Gross (F&I)</span>
                  <span className="font-bold text-purple-600">{fmt(backGross)}</span>
                </div>
                <div className="flex justify-between border-t-2 border-gray-900 pt-2">
                  <span className="text-base font-bold text-gray-900">Total Gross</span>
                  <span className={`text-xl font-bold ${totalGross >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {fmt(totalGross)}
                  </span>
                </div>
              </div>
            </div>

            {/* Deal Status Actions */}
            <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Deal Status</h3>
              <div className="mt-3 space-y-2">
                {STATUS_FLOW.map((s, idx) => {
                  const isCurrent = s === deal.status;
                  const isPast = idx < currentStatusIdx;
                  const isFuture = idx > currentStatusIdx;
                  return (
                    <div key={s} className="flex items-center gap-2">
                      <div
                        className={`h-3 w-3 rounded-full ${
                          isCurrent
                            ? "bg-brand-600 ring-2 ring-brand-200"
                            : isPast
                              ? "bg-green-500"
                              : "bg-gray-200"
                        }`}
                      />
                      <span
                        className={`text-sm ${
                          isCurrent
                            ? "font-semibold text-brand-700"
                            : isPast
                              ? "text-green-700"
                              : "text-gray-400"
                        }`}
                      >
                        {STATUS_LABEL[s]}
                      </span>
                      {isFuture && idx === currentStatusIdx + 1 && (
                        <button
                          onClick={() => handleStatusChange(s)}
                          disabled={saving}
                          className="ml-auto text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
                        >
                          Advance
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {deal.status !== "unwound" && (
                <button
                  onClick={() => handleStatusChange("unwound")}
                  disabled={saving}
                  className="mt-4 w-full rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  Unwind Deal
                </button>
              )}
            </div>

            {/* Notes */}
            {deal.notes && (
              <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Notes</h3>
                <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{deal.notes}</p>
              </div>
            )}

            {/* Timeline */}
            {deal.timeline && deal.timeline.length > 0 && (
              <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Timeline</h3>
                <div className="mt-3 space-y-3">
                  {deal.timeline.map((entry, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-brand-400" />
                      <div>
                        <p className="text-sm text-gray-700">{entry.action}</p>
                        <p className="text-xs text-gray-400">
                          {entry.by} &middot; {fmtDate(entry.at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fees */}
            {deal.fees && (
              <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Fees & Taxes</h3>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Doc Fee</span>
                    <span>{fmt(deal.fees.doc_fee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Title</span>
                    <span>{fmt(deal.fees.title_fee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Registration</span>
                    <span>{fmt(deal.fees.registration_fee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tax ({deal.fees.tax_rate}%)</span>
                    <span>{fmt(deal.fees.tax_amount)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Subcomponents                                                              */
/* -------------------------------------------------------------------------- */

function Row({
  label,
  value,
  mono,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="flex-shrink-0 text-gray-500">{label}</span>
      <span
        className={`text-right ${mono ? "font-mono text-xs" : ""} ${bold ? "font-semibold text-gray-900" : "text-gray-700"}`}
      >
        {value}
      </span>
    </div>
  );
}

function CalcField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500">{label}</label>
      <div className="relative mt-1">
        {prefix && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          step={step || 1}
          className={`block w-full rounded-md border border-surface-border py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${prefix ? "pl-7" : "pl-3"} ${suffix ? "pr-8" : "pr-3"}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
