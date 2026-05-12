"use client";

/**
 * F&I product penetration heatmap. Renders a manager x product grid for the
 * most-recent month, plus a month-selector dropdown to scrub history. Uses
 * dealership-language labels (no enum values, no decimals leaking through).
 * Same-origin fetch with credentials so the admin session cookie travels
 * (the route handler does `requireAuth`).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

interface Cell {
  fi_manager_id: string;
  fi_manager_name: string;
  product_type: string;
  month: string;
  attach_rate: number;
  gross_total: number;
  deals_count: number;
}

interface ApiResult {
  cells: Cell[];
  headline: string;
  managers: { id: string; name: string }[];
  products: string[];
  months: string[];
  generatedAt: string;
  shadow?: boolean;
}

const PRODUCT_LABEL: Record<string, string> = {
  warranty: "Extended Warranty",
  gap: "GAP",
  paint_protection: "Paint & Fabric",
  tire_wheel: "Tire & Wheel",
  theft: "Theft Protection",
  maintenance: "Prepaid Maintenance",
  appearance: "Appearance",
  other: "Other",
  none: "(none)",
};

function monthLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const yr = Number(m[1]);
  const mo = Number(m[2]);
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return mo >= 1 && mo <= 12 ? `${names[mo - 1]} ${yr}` : iso;
}

function heatColor(rate: number): string {
  if (rate >= 0.75) return "bg-emerald-600 text-white";
  if (rate >= 0.55) return "bg-emerald-400 text-white";
  if (rate >= 0.35) return "bg-yellow-300 text-gray-900";
  if (rate >= 0.15) return "bg-orange-300 text-gray-900";
  return "bg-red-200 text-gray-900";
}

export default function FIPenetrationHeatmap() {
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analytics/fi-penetration", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setError(`Could not load (${res.status}).`);
        return;
      }
      const body: ApiResult = await res.json();
      setData(body);
      if (body.months.length > 0 && !selectedMonth) {
        setSelectedMonth(body.months[body.months.length - 1]);
      }
    } catch {
      setError("Could not load.");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grid = useMemo(() => {
    if (!data || !selectedMonth) return null;
    const monthCells = data.cells.filter((c) => c.month === selectedMonth);
    const managers = data.managers;
    const products = data.products.filter((p) => p !== "none");
    return { monthCells, managers, products };
  }, [data, selectedMonth]);

  if (loading) {
    return (
      <div data-testid="fi-pen-loading" className="rounded-lg border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
        Loading F&amp;I penetration...
      </div>
    );
  }
  if (error) {
    return (
      <div data-testid="fi-pen-error" className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (!data || data.cells.length === 0) {
    return (
      <div data-testid="fi-pen-empty" className="rounded-lg border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
        No F&amp;I activity yet. Once your team funds deals with F&amp;I products attached, this view fills in.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="fi-pen-root">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p data-testid="fi-pen-headline" className="text-sm font-medium text-blue-900">
          {data.headline}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-700">
          Month:{" "}
          <select
            data-testid="fi-pen-month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="ml-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            {data.months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
        {data.shadow && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800" data-testid="fi-pen-shadow">
            demo data
          </span>
        )}
      </div>

      {grid && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">F&amp;I Manager</th>
                {grid.products.map((p) => (
                  <th key={p} className="px-3 py-3 text-center text-xs font-medium uppercase text-gray-500">
                    {PRODUCT_LABEL[p] ?? p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200" data-testid="fi-pen-grid">
              {grid.managers.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                  {grid.products.map((p) => {
                    const cell = grid.monthCells.find(
                      (c) => c.fi_manager_id === m.id && c.product_type === p,
                    );
                    const rate = cell?.attach_rate ?? 0;
                    const deals = cell?.deals_count ?? 0;
                    const gross = cell?.gross_total ?? 0;
                    return (
                      <td key={p} className="px-2 py-2 text-center">
                        <span
                          className={`inline-block min-w-[5rem] rounded px-2 py-1 text-xs font-semibold ${heatColor(rate)}`}
                          title={`${Math.round(rate * 100)}% on ${deals} deals — $${Math.round(gross).toLocaleString()} gross`}
                        >
                          {Math.round(rate * 100)}%
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
