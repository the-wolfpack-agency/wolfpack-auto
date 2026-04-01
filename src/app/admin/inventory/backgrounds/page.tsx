"use client";

/**
 * Admin — Vehicle Background Manager
 *
 * Dealer-friendly page for applying, previewing, and analyzing
 * background presets on vehicle photos. Uses plain language throughout
 * (no raw data or dev jargon for dealer users).
 *
 * Features:
 *  - Grid of vehicles with current photo + background preview
 *  - Visual preset picker with hover preview
 *  - "Auto-Apply Best" — applies recommended backgrounds to all
 *  - Batch mode — select multiple vehicles, apply same background
 *  - Performance dashboard — which backgrounds drive the most engagement
 *  - Before/After toggle
 *  - Mobile responsive
 */

import { useState, useEffect, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BackgroundPreset {
  id: string;
  name: string;
  description: string;
  thumbnailCSS: string;
  category: string;
}

interface VehicleCard {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  photo_url: string | null;
  exterior_color: string;
  price: number;
  applied_preset?: string;
}

interface InsightRow {
  preset: string;
  total_views: number;
  avg_dwell_ms: number;
  total_clicks: number;
  total_leads: number;
  engagement_score: number;
  sample_size: number;
}

/* ------------------------------------------------------------------ */
/*  Demo vehicles (placeholder until DB wired)                         */
/* ------------------------------------------------------------------ */

const DEMO_VEHICLES: VehicleCard[] = [
  { vin: "1HGCG5655WA006001", year: 2024, make: "Honda", model: "Accord", trim: "EX-L", photo_url: null, exterior_color: "White", price: 32000 },
  { vin: "5YJSA1E26MF123456", year: 2024, make: "Tesla", model: "Model 3", trim: "Long Range", photo_url: null, exterior_color: "Black", price: 48000 },
  { vin: "1FTFW1E88NFA00001", year: 2024, make: "Ford", model: "F-150", trim: "XLT", photo_url: null, exterior_color: "Blue", price: 45000 },
  { vin: "WBAPH5C55BA000001", year: 2024, make: "BMW", model: "530i", trim: "xDrive", photo_url: null, exterior_color: "Gray", price: 62000 },
  { vin: "1N4BL4BV5LC000001", year: 2023, make: "Nissan", model: "Altima", trim: "SV", photo_url: null, exterior_color: "Red", price: 18500 },
  { vin: "2T1BURHE8JC000001", year: 2024, make: "Toyota", model: "Corolla", trim: "SE", photo_url: null, exterior_color: "Silver", price: 24000 },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function BackgroundsPage() {
  const [presets, setPresets] = useState<BackgroundPreset[]>([]);
  const [vehicles] = useState<VehicleCard[]>(DEMO_VEHICLES);
  const [selectedVins, setSelectedVins] = useState<Set<string>>(new Set());
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [appliedMap, setAppliedMap] = useState<Record<string, string>>({});
  const [showBefore, setShowBefore] = useState<Record<string, boolean>>({});
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"manage" | "insights">("manage");

  // Fetch presets on mount
  useEffect(() => {
    fetch("/api/admin/vehicles/backgrounds")
      .then((r) => r.json())
      .then((d) => setPresets(d.presets ?? []))
      .catch(() => {});
  }, []);

  // Fetch insights when tab switches
  useEffect(() => {
    if (tab !== "insights") return;
    fetch("/api/admin/vehicles/backgrounds/insights")
      .then((r) => r.json())
      .then((d) => setInsights(d.insights ?? []))
      .catch(() => {});
  }, [tab]);

  /* ---- Selection ---- */
  const toggleSelect = (vin: string) => {
    setSelectedVins((prev) => {
      const next = new Set(prev);
      if (next.has(vin)) next.delete(vin);
      else next.add(vin);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedVins.size === vehicles.length) {
      setSelectedVins(new Set());
    } else {
      setSelectedVins(new Set(vehicles.map((v) => v.vin)));
    }
  };

  /* ---- Apply single ---- */
  const applyPreset = useCallback(
    async (vin: string, preset: string) => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/vehicles/backgrounds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vin, preset }),
        });
        if (res.ok) {
          setAppliedMap((prev) => ({ ...prev, [vin]: preset }));
        }
      } catch {
        // Swallow
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /* ---- Batch apply ---- */
  const applyBatch = useCallback(
    async (preset: string) => {
      setLoading(true);
      const vins = Array.from(selectedVins);
      await Promise.all(vins.map((vin) => applyPreset(vin, preset)));
      setLoading(false);
    },
    [selectedVins, applyPreset],
  );

  /* ---- Auto-apply best ---- */
  const autoApplyBest = useCallback(async () => {
    setLoading(true);
    try {
      const vins = vehicles.map((v) => v.vin);
      const res = await fetch("/api/admin/vehicles/backgrounds/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vins }),
      });
      if (res.ok) {
        const { recommendations } = await res.json();
        const newMap: Record<string, string> = { ...appliedMap };
        for (const rec of recommendations) {
          newMap[rec.vin] = rec.recommended_preset;
          // Apply each
          fetch("/api/admin/vehicles/backgrounds", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ vin: rec.vin, preset: rec.recommended_preset }),
          }).catch(() => {});
        }
        setAppliedMap(newMap);
      }
    } catch {
      // Swallow
    } finally {
      setLoading(false);
    }
  }, [vehicles, appliedMap]);

  /* ---- Toggle before/after ---- */
  const toggleBeforeAfter = (vin: string) => {
    setShowBefore((prev) => ({ ...prev, [vin]: !prev[vin] }));
  };

  /* ---- Render a CSS thumbnail ---- */
  const renderPresetThumb = (css: string) => {
    // Parse the CSS string to extract just the background
    const bgMatch = css.match(/background:\s*([^;]+)/);
    const bg = bgMatch ? bgMatch[1] : "#f0f0f0";
    return { background: bg };
  };

  return (
    <div className="space-y-6" data-testid="backgrounds-page">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Photo Backgrounds</h1>
          <p className="mt-1 text-sm text-gray-500">
            Make your photos stand out with professional backgrounds. Pick a style
            or let us recommend the best one for each vehicle.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("manage")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "manage"
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Manage
          </button>
          <button
            onClick={() => setTab("insights")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "insights"
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Performance
          </button>
        </div>
      </div>

      {tab === "manage" && (
        <>
          {/* Preset picker */}
          <section
            aria-labelledby="preset-picker-heading"
            className="rounded-2xl border border-surface-border bg-white p-6 shadow-card"
          >
            <h2 id="preset-picker-heading" className="text-lg font-bold text-gray-900">
              Choose a Background Style
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActivePreset(p.id === activePreset ? null : p.id)}
                  className={`group relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all hover:shadow-md ${
                    activePreset === p.id
                      ? "border-brand-600 ring-2 ring-brand-200"
                      : "border-surface-border hover:border-gray-300"
                  }`}
                  data-testid={`preset-card-${p.id}`}
                >
                  <div
                    className="h-16 w-full rounded-lg"
                    style={renderPresetThumb(p.thumbnailCSS)}
                  />
                  <span className="text-xs font-medium text-gray-700">{p.name}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Actions bar */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={selectAll}
              className="rounded-lg border border-surface-border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {selectedVins.size === vehicles.length ? "Deselect All" : "Select All"}
            </button>

            {selectedVins.size > 0 && activePreset && (
              <button
                onClick={() => applyBatch(activePreset)}
                disabled={loading}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Apply to {selectedVins.size} Vehicle{selectedVins.size > 1 ? "s" : ""}
              </button>
            )}

            <button
              onClick={autoApplyBest}
              disabled={loading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              data-testid="auto-apply-btn"
            >
              {loading ? "Applying..." : "Auto-Apply Best for All"}
            </button>
          </div>

          {/* Vehicle grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => {
              const applied = appliedMap[v.vin];
              const isSelected = selectedVins.has(v.vin);
              const isBefore = showBefore[v.vin];
              const presetDef = presets.find((p) => p.id === applied);

              return (
                <div
                  key={v.vin}
                  className={`overflow-hidden rounded-2xl border-2 bg-white shadow-card transition-all ${
                    isSelected ? "border-brand-600 ring-2 ring-brand-100" : "border-surface-border"
                  }`}
                  data-testid={`vehicle-card-${v.vin}`}
                >
                  {/* Photo area */}
                  <div className="relative aspect-video">
                    {isBefore || !applied ? (
                      /* Original / no background */
                      <div className="flex h-full w-full items-center justify-center bg-gray-100">
                        {v.photo_url ? (
                          <img
                            src={v.photo_url}
                            alt={`${v.year} ${v.make} ${v.model}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="text-center text-gray-400">
                            <svg
                              className="mx-auto h-12 w-12"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1}
                                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                              />
                            </svg>
                            <p className="mt-1 text-xs">No photo</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* With background applied */
                      <div
                        className="flex h-full w-full items-center justify-center"
                        style={renderPresetThumb(
                          presetDef?.thumbnailCSS ?? "background: #f0f0f0;",
                        )}
                      >
                        {v.photo_url ? (
                          <img
                            src={v.photo_url}
                            alt={`${v.year} ${v.make} ${v.model}`}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="text-center text-white/60">
                            <svg
                              className="mx-auto h-12 w-12"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1}
                                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                              />
                            </svg>
                            <p className="mt-1 text-xs">Preview</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelect(v.vin)}
                      className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded border-2 border-white bg-white/80 shadow"
                      aria-label={`Select ${v.year} ${v.make} ${v.model}`}
                    >
                      {isSelected && (
                        <svg className="h-4 w-4 text-brand-600" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>

                    {/* Before/After toggle */}
                    {applied && (
                      <button
                        onClick={() => toggleBeforeAfter(v.vin)}
                        className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white backdrop-blur"
                      >
                        {isBefore ? "After" : "Before"}
                      </button>
                    )}

                    {/* Applied badge */}
                    {applied && presetDef && (
                      <div className="absolute bottom-2 left-2 z-10 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                        {presetDef.name}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-bold text-gray-900">
                      {v.year} {v.make} {v.model} {v.trim}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {v.exterior_color} &middot; ${v.price.toLocaleString()}
                    </p>

                    {/* Quick-apply row */}
                    {activePreset && !applied && (
                      <button
                        onClick={() => applyPreset(v.vin, activePreset)}
                        disabled={loading}
                        className="mt-3 w-full rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
                      >
                        Apply {presets.find((p) => p.id === activePreset)?.name ?? activePreset}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Insights tab */}
      {tab === "insights" && (
        <section
          aria-labelledby="insights-heading"
          className="rounded-2xl border border-surface-border bg-white p-6 shadow-card"
        >
          <h2 id="insights-heading" className="text-lg font-bold text-gray-900">
            Which Backgrounds Work Best
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            See which background styles get the most views, clicks, and leads from shoppers.
          </p>

          {insights.length === 0 ? (
            <div className="mt-8 text-center text-gray-400">
              <p className="text-sm">
                No data yet. Apply backgrounds and let shoppers browse to start seeing results.
              </p>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="insights-table">
                <thead>
                  <tr className="border-b border-surface-border text-xs uppercase text-gray-500">
                    <th className="pb-3 pr-4">Style</th>
                    <th className="pb-3 pr-4 text-right">Views</th>
                    <th className="pb-3 pr-4 text-right">Avg. Time</th>
                    <th className="pb-3 pr-4 text-right">Clicks</th>
                    <th className="pb-3 pr-4 text-right">Leads</th>
                    <th className="pb-3 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.map((row) => (
                    <tr key={row.preset} className="border-b border-surface-border last:border-0">
                      <td className="py-3 pr-4 font-medium text-gray-900">
                        {presets.find((p) => p.id === row.preset)?.name ?? row.preset}
                      </td>
                      <td className="py-3 pr-4 text-right">{row.total_views.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right">
                        {(row.avg_dwell_ms / 1000).toFixed(1)}s
                      </td>
                      <td className="py-3 pr-4 text-right">{row.total_clicks.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right">{row.total_leads.toLocaleString()}</td>
                      <td className="py-3 text-right font-bold text-brand-700">
                        {row.engagement_score.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
