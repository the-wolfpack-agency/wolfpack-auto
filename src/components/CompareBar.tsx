"use client";

import { useCallback, useEffect, useState } from "react";
import { useAnalytics } from "@/components/EventCollector";

const STORAGE_KEY = "wolfpack_compare_vins";
const MAX_COMPARE = 3;

export function useCompare() {
  const [vins, setVins] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) setVins(JSON.parse(stored));
    } catch { /* sessionStorage unavailable */ }
  }, []);

  const save = useCallback((next: string[]) => {
    setVins(next);
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }, []);

  const toggle = useCallback((vin: string) => {
    setVins((prev) => {
      const wasSelected = prev.includes(vin);
      const next = wasSelected
        ? prev.filter((v) => v !== vin)
        : prev.length < MAX_COMPARE ? [...prev, vin] : prev;
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const clear = useCallback(() => save([]), [save]);
  const isSelected = useCallback((vin: string) => vins.includes(vin), [vins]);

  return { vins, toggle, clear, isSelected, count: vins.length };
}

export function CompareButton({ vin }: { vin: string }) {
  const { toggle, isSelected, vins } = useCompare();
  const { trackComparison } = useAnalytics();
  const selected = isSelected(vin);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const wasSelected = isSelected(vin);
        toggle(vin);
        const nextVins = wasSelected
          ? vins.filter((v) => v !== vin)
          : [...vins, vin].slice(0, MAX_COMPARE);
        trackComparison(wasSelected ? "remove" : "add", { vins: nextVins });
      }}
      className={`absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur-sm transition-all ${
        selected
          ? "bg-brand-600 text-white shadow-lg"
          : "bg-white/80 text-gray-700 hover:bg-white"
      }`}
      aria-label={selected ? "Remove from comparison" : "Add to comparison"}
      data-track="compare-toggle"
      data-track-vehicle={vin}
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
      </svg>
      {selected ? "Added" : "Compare"}
    </button>
  );
}

export default function CompareBar() {
  const { vins, clear, count } = useCompare();
  const { trackComparison } = useAnalytics();

  if (count === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-brand-200 bg-brand-50/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
            {count}
          </span>
          <span className="text-sm font-medium text-gray-700">
            {count === 1 ? "1 vehicle selected" : `${count} vehicles selected`}
            {count < MAX_COMPARE && <span className="text-gray-400"> (select up to {MAX_COMPARE})</span>}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={clear}
            className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-700"
          >
            Clear
          </button>
          <a
            href={`/inventory/compare?vins=${vins.join(",")}`}
            onClick={() => trackComparison("view", { vins })}
            className={`rounded-lg px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all ${
              count >= 2
                ? "bg-brand-600 hover:bg-brand-700"
                : "pointer-events-none bg-gray-400"
            }`}
            aria-disabled={count < 2}
          >
            Compare {count >= 2 ? `(${count})` : ""}
          </a>
        </div>
      </div>
    </div>
  );
}
