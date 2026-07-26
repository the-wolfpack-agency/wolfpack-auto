"use client";

/**
 * Tech utilization grid — tech x bay x week. Heat-colored by utilization
 * fraction. Plain-English headline at the top.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

interface Cell {
  tech_id: string;
  tech_name: string;
  bay_id: string | null;
  week_start: string;
  hours_billed: number;
  hours_available: number;
  utilization: number;
  ro_count: number;
}

interface ApiResult {
  cells: Cell[];
  headline: string;
  techs: { id: string; name: string }[];
  bays: (string | null)[];
  weeks: string[];
  generatedAt: string;
  hoursAvailableFromConstant: boolean;
  shadow?: boolean;
}

function utilColor(u: number): string {
  if (u >= 0.9) return "bg-emerald-600 text-white";
  if (u >= 0.7) return "bg-emerald-400 text-white";
  if (u >= 0.5) return "bg-yellow-300 text-gray-900";
  if (u >= 0.3) return "bg-orange-300 text-gray-900";
  return "bg-red-200 text-gray-900";
}

function weekLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const mo = Number(m[2]);
  const day = Number(m[3]);
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return mo >= 1 && mo <= 12 ? `${names[mo - 1]} ${day}` : iso;
}

export default function TechUtilizationGrid() {
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/analytics/tech-utilization", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setError(`Could not load (${res.status}).`);
        return;
      }
      const body: ApiResult = await res.json();
      setData(body);
      if (body.weeks.length > 0 && !selectedWeek) {
        setSelectedWeek(body.weeks[body.weeks.length - 1]);
      }
    } catch {
      setError("Could not load.");
    } finally {
      setLoading(false);
    }
  }, [selectedWeek]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grid = useMemo(() => {
    if (!data || !selectedWeek) return null;
    const weekCells = data.cells.filter((c) => c.week_start === selectedWeek);
    const techs = data.techs;
    const bays = data.bays
      .filter((b): b is string => b !== null)
      .filter((b, i, a) => a.indexOf(b) === i)
      .sort();
    return { weekCells, techs, bays };
  }, [data, selectedWeek]);

  if (loading) {
    return (
      <div data-testid="tu-loading" className="rounded-lg border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
        Loading service-bay utilization...
      </div>
    );
  }
  if (error) {
    return (
      <div data-testid="tu-error" className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (!data || data.cells.length === 0) {
    return (
      <div data-testid="tu-empty" className="rounded-lg border border-gray-200 bg-white p-12 text-center text-sm text-gray-500">
        No labor billed yet. Once your service department writes repair orders with technicians and bays assigned, this view fills in.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="tu-root">
      <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
        <p data-testid="tu-headline" className="text-sm font-medium text-brand-950">
          {data.headline}
        </p>
        {data.hoursAvailableFromConstant && (
          <p className="mt-1 text-xs text-brand-800">
            Hours available default to 40h/week per tech. Set up a tech schedule to refine.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-700">
          Week:{" "}
          <select
            data-testid="tu-week-select"
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="ml-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            {data.weeks.map((w) => (
              <option key={w} value={w}>
                {weekLabel(w)}
              </option>
            ))}
          </select>
        </label>
        {data.shadow && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800" data-testid="tu-shadow">
            demo data
          </span>
        )}
      </div>

      {grid && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Technician</th>
                {grid.bays.map((b) => (
                  <th key={b} className="px-3 py-3 text-center text-xs font-medium uppercase text-gray-500">
                    Bay {b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200" data-testid="tu-grid">
              {grid.techs.map((t) => (
                <tr key={t.id || t.name}>
                  <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                  {grid.bays.map((b) => {
                    const cell = grid.weekCells.find(
                      (c) => (c.tech_id === t.id || c.tech_name === t.name) && c.bay_id === b,
                    );
                    const u = cell?.utilization ?? 0;
                    const hb = cell?.hours_billed ?? 0;
                    return (
                      <td key={b} className="px-2 py-2 text-center">
                        <span
                          className={`inline-block min-w-[5rem] rounded px-2 py-1 text-xs font-semibold ${utilColor(u)}`}
                          title={`${hb.toFixed(1)}h billed of ${cell?.hours_available ?? 40}h (${Math.round(u * 100)}%)`}
                        >
                          {Math.round(u * 100)}%
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
