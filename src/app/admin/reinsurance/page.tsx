"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ReinsuranceProgram {
  id: string;
  name: string;
  type: "CFC" | "DOWC" | "trust";
  status: "active" | "inactive" | "pending" | "terminated";
  inception_date: string;
  cession_rate: number;
  admin_fee_rate: number;
  total_premiums: number;
  total_claims: number;
  total_admin_costs: number;
  retained_reserves: number;
  roi_pct?: number;
}

interface ProductBreakdown {
  category: string;
  premiums_earned: number;
  claims_paid: number;
  loss_ratio: number;
  policies_sold: number;
  claims_filed: number;
}

interface RiskAssessment {
  overall_risk: "low" | "medium" | "high";
  claim_frequency: number;
  claim_severity: number;
  frequency_trend: "increasing" | "stable" | "decreasing";
  severity_trend: "increasing" | "stable" | "decreasing";
  exposure_amount: number;
  reserve_adequacy: number;
}

interface ProgramPerformance {
  total_premiums_earned: number;
  total_claims_paid: number;
  loss_ratio: number;
  retained_reserves: number;
  admin_costs: number;
  net_profit: number;
  roi_pct: number;
  product_breakdown: ProductBreakdown[];
  risk_assessment: RiskAssessment;
}

interface ReinsuranceData {
  programs: ReinsuranceProgram[];
  performance: ProgramPerformance;
  summary: { total_programs: number; active_programs: number };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    VSC: "Vehicle Service Contract",
    GAP: "GAP Insurance",
    maintenance: "Maintenance Plan",
    tire_wheel: "Tire & Wheel",
    paint_fabric: "Paint & Fabric",
    key_replacement: "Key Replacement",
    theft: "Theft Protection",
    other: "Other",
  };
  return labels[cat] ?? cat;
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    inactive: "bg-gray-100 text-gray-600",
    pending: "bg-yellow-100 text-yellow-800",
    terminated: "bg-red-100 text-red-800",
  };
  return colors[status] ?? "bg-gray-100 text-gray-600";
}

function riskColor(level: string): string {
  if (level === "low") return "text-green-700 bg-green-50 border-green-200";
  if (level === "medium") return "text-yellow-700 bg-yellow-50 border-yellow-200";
  return "text-red-700 bg-red-50 border-red-200";
}

function trendArrow(trend: string): string {
  if (trend === "increasing") return "Increasing";
  if (trend === "decreasing") return "Decreasing";
  return "Stable";
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ReinsurancePage() {
  const [data, setData] = useState<ReinsuranceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/reinsurance");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="p-6 bg-white min-h-screen">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-white min-h-screen">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Reinsurance</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          Failed to load reinsurance data: {error ?? "Unknown error"}
        </div>
      </div>
    );
  }

  const { programs, performance, summary } = data;

  return (
    <div className="p-6 bg-white min-h-screen text-gray-900">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Reinsurance</h1>
        <p className="text-gray-500 mt-1">
          F&I reinsurance program administration — {summary.active_programs} active program{summary.active_programs !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Performance KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Premiums Earned</p>
          <p className="text-2xl font-semibold text-gray-900">{usd(performance.total_premiums_earned)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Claims Paid</p>
          <p className="text-2xl font-semibold text-gray-900">{usd(performance.total_claims_paid)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Loss Ratio</p>
          <p className="text-2xl font-semibold text-gray-900">{pct(performance.loss_ratio)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">Retained Reserves</p>
          <p className="text-2xl font-semibold text-green-700">{usd(performance.retained_reserves)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-500">ROI</p>
          <p className="text-2xl font-semibold text-green-700">{performance.roi_pct.toFixed(1)}%</p>
        </div>
      </div>

      {/* Program Overview Cards */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Programs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {programs.map((prog) => (
            <div key={prog.id} className="bg-white border border-gray-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{prog.name}</h3>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadge(prog.status)}`}>
                  {prog.status}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Type</span>
                  <span className="font-medium">{prog.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Inception</span>
                  <span className="font-medium">{prog.inception_date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Cession Rate</span>
                  <span className="font-medium">{(prog.cession_rate * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Premiums</span>
                  <span className="font-medium">{usd(prog.total_premiums)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Claims</span>
                  <span className="font-medium">{usd(prog.total_claims)}</span>
                </div>
                {prog.roi_pct !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">ROI</span>
                    <span className={`font-medium ${prog.roi_pct >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {prog.roi_pct.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Product Breakdown Table */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Product Breakdown</h2>
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Premiums</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Claims</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Loss Ratio</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Policies</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Claims Filed</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {performance.product_breakdown.map((row) => (
                <tr key={row.category} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{categoryLabel(row.category)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900">{usd(row.premiums_earned)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900">{usd(row.claims_paid)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900">{pct(row.loss_ratio)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{row.policies_sold}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{row.claims_filed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Risk Assessment Section */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Risk Assessment</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Overall Risk */}
          <div className={`border rounded-lg p-5 ${riskColor(performance.risk_assessment.overall_risk)}`}>
            <p className="text-sm font-medium mb-1">Overall Risk Level</p>
            <p className="text-2xl font-bold capitalize">{performance.risk_assessment.overall_risk}</p>
            <p className="text-sm mt-2">
              Reserve Adequacy: {(performance.risk_assessment.reserve_adequacy * 100).toFixed(0)}%
            </p>
          </div>

          {/* Claim Metrics */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <p className="text-sm font-medium text-gray-500 mb-3">Claim Metrics</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Claim Frequency</span>
                <div className="text-right">
                  <span className="text-sm font-semibold text-gray-900">{performance.risk_assessment.claim_frequency.toFixed(1)}</span>
                  <span className="text-xs text-gray-500 ml-1">per 100 policies</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Avg Claim Severity</span>
                <span className="text-sm font-semibold text-gray-900">{usd(performance.risk_assessment.claim_severity)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Frequency Trend</span>
                <span className="text-sm font-medium text-gray-900">{trendArrow(performance.risk_assessment.frequency_trend)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Severity Trend</span>
                <span className="text-sm font-medium text-gray-900">{trendArrow(performance.risk_assessment.severity_trend)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Exposure</span>
                <span className="text-sm font-semibold text-gray-900">{usd(performance.risk_assessment.exposure_amount)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
