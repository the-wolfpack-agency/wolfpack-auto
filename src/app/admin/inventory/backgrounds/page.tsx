"use client";

/**
 * Admin — Vehicle Background Studio
 *
 * Enterprise-grade background management for vehicle photos:
 *  - Browse & apply 8 built-in presets
 *  - Upload custom dealer backgrounds (drag & drop)
 *  - AI background removal + compositing pipeline
 *  - Batch apply to entire inventory
 *  - Before/after comparison
 *  - Performance analytics (which backgrounds drive most engagement)
 *  - All actions feed into the analytics/learning system
 *
 * Tabs: Manage | Custom Backgrounds | AI Studio | Performance
 */

import { useState, useEffect, useCallback, useRef } from "react";

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

interface CustomBg {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  original_url: string;
  optimized_url: string | null;
  thumbnail_url: string | null;
  width: number;
  height: number;
  file_size: number;
  times_applied: number;
  engagement_score: number;
  created_at: string;
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
  condition: string;
  body_style: string;
  applied_background?: {
    type: string;
    preset_id?: string;
    custom_bg_id?: string;
    composite_url?: string;
  };
}

interface InsightRow {
  background_type: string;
  preset_id: string | null;
  custom_bg_id: string | null;
  name: string;
  total_views: number;
  avg_dwell_ms: number;
  total_clicks: number;
  total_leads: number;
  ctr: number;
  lead_rate: number;
  engagement_score: number;
  sample_size: number;
}

interface AIJob {
  job_id: string;
  vin: string;
  status: string;
  cutout_url?: string;
  composite_url?: string;
  processing_ms?: number;
  error?: string;
}

type Tab = "manage" | "custom" | "ai-studio" | "performance";

/* ------------------------------------------------------------------ */
/*  Demo vehicles (until DB wired)                                     */
/* ------------------------------------------------------------------ */

const DEMO_VEHICLES: VehicleCard[] = [
  { vin: "1HGCG5655WA006001", year: 2024, make: "Honda", model: "Accord", trim: "EX-L", photo_url: null, exterior_color: "White", price: 32000, condition: "new", body_style: "sedan" },
  { vin: "5YJSA1E26MF123456", year: 2024, make: "Tesla", model: "Model 3", trim: "Long Range", photo_url: null, exterior_color: "Black", price: 48000, condition: "new", body_style: "sedan" },
  { vin: "1FTFW1E88NFA00001", year: 2024, make: "Ford", model: "F-150", trim: "XLT", photo_url: null, exterior_color: "Blue", price: 45000, condition: "new", body_style: "truck" },
  { vin: "WBAPH5C55BA000001", year: 2024, make: "BMW", model: "530i", trim: "xDrive", photo_url: null, exterior_color: "Gray", price: 62000, condition: "new", body_style: "sedan" },
  { vin: "1N4BL4BV5LC000001", year: 2023, make: "Nissan", model: "Altima", trim: "SV", photo_url: null, exterior_color: "Red", price: 18500, condition: "used", body_style: "sedan" },
  { vin: "2T1BURHE8JC000001", year: 2024, make: "Toyota", model: "Corolla", trim: "SE", photo_url: null, exterior_color: "Silver", price: 24000, condition: "new", body_style: "sedan" },
];

/* ------------------------------------------------------------------ */
/*  Preset CSS thumbnail renderer                                      */
/* ------------------------------------------------------------------ */

function renderPresetThumb(css: string): React.CSSProperties {
  const bgMatch = css.match(/background:\s*([^;]+)/);
  const bg = bgMatch ? bgMatch[1] : "#f0f0f0";
  return { background: bg };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface SystemBgMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
}

export default function BackgroundStudioPage() {
  const [presets, setPresets] = useState<BackgroundPreset[]>([]);
  const [systemBgs, setSystemBgs] = useState<(CustomBg | SystemBgMeta)[]>([]);
  const [customBgs, setCustomBgs] = useState<CustomBg[]>([]);
  const [vehicles] = useState<VehicleCard[]>(DEMO_VEHICLES);
  const [selectedVins, setSelectedVins] = useState<Set<string>>(new Set());
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activeCustomBg, setActiveCustomBg] = useState<string | null>(null);
  const [appliedMap, setAppliedMap] = useState<Record<string, { type: string; id: string; name: string; compositeUrl?: string }>>({});
  const [showBefore, setShowBefore] = useState<Record<string, boolean>>({});
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [aiJobs, setAiJobs] = useState<Record<string, AIJob>>({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<Tab>("manage");
  const [aiAvailable, setAiAvailable] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch data on mount
  useEffect(() => {
    // Load presets + system + custom backgrounds
    fetch("/api/admin/vehicles/backgrounds")
      .then((r) => r.json())
      .then((d) => {
        setPresets(d.presets ?? []);
        // System backgrounds from DB or fallback metadata
        const sys = (d.system?.length > 0 ? d.system : d.system_meta) ?? [];
        setSystemBgs(sys);
        setCustomBgs(d.custom ?? []);
      })
      .catch(() => {});

    // Check AI availability
    fetch("/api/admin/vehicles/backgrounds/remove-bg")
      .then((r) => r.json())
      .then((d) => setAiAvailable(d.available ?? false))
      .catch(() => {});
  }, []);

  // Fetch insights when tab switches
  useEffect(() => {
    if (tab !== "performance") return;
    fetch("/api/admin/vehicles/backgrounds/insights")
      .then((r) => r.json())
      .then((d) => setInsights(d.insights ?? []))
      .catch(() => {});
  }, [tab]);

  /* ---- Selection ---- */
  const toggleSelect = (vin: string) => {
    setSelectedVins((prev) => {
      const next = new Set(prev);
      if (next.has(vin)) next.delete(vin); else next.add(vin);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedVins(
      selectedVins.size === vehicles.length
        ? new Set()
        : new Set(vehicles.map((v) => v.vin)),
    );
  };

  /* ---- Apply preset ---- */
  const applyPreset = useCallback(async (vin: string, presetId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/vehicles/backgrounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, background_type: "preset", preset_id: presetId }),
      });
      if (res.ok) {
        const data = await res.json();
        setAppliedMap((prev) => ({
          ...prev,
          [vin]: { type: "preset", id: presetId, name: data.preset_name ?? presetId },
        }));
      }
    } catch { /* swallow */ } finally {
      setLoading(false);
    }
  }, []);

  /* ---- Apply custom background ---- */
  const applyCustomBg = useCallback(async (vin: string, bgId: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/vehicles/backgrounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, background_type: "custom", custom_bg_id: bgId }),
      });
      if (res.ok) {
        const bg = customBgs.find((b) => b.id === bgId);
        setAppliedMap((prev) => ({
          ...prev,
          [vin]: { type: "custom", id: bgId, name: bg?.name ?? "Custom" },
        }));
      }
    } catch { /* swallow */ } finally {
      setLoading(false);
    }
  }, [customBgs]);

  /* ---- Batch apply ---- */
  const batchApply = useCallback(async (mode: string) => {
    setLoading(true);
    const vins = Array.from(selectedVins);
    try {
      const body: Record<string, unknown> = { vins, mode };
      if (mode === "apply_preset" && activePreset) body.preset_id = activePreset;
      if (mode === "apply_custom" && activeCustomBg) body.custom_bg_id = activeCustomBg;

      const res = await fetch("/api/admin/vehicles/backgrounds/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const { applied } = await res.json();
        const newMap: Record<string, { type: string; id: string; name: string }> = { ...appliedMap };
        for (const item of applied) {
          const preset = presets.find((p) => p.id === item.preset_id);
          const custom = customBgs.find((b) => b.id === item.custom_bg_id);
          newMap[item.vin] = {
            type: item.background_type,
            id: item.preset_id ?? item.custom_bg_id ?? "",
            name: preset?.name ?? custom?.name ?? item.preset_id ?? "Applied",
          };
        }
        setAppliedMap(newMap);
      }
    } catch { /* swallow */ } finally {
      setLoading(false);
    }
  }, [selectedVins, activePreset, activeCustomBg, appliedMap, presets, customBgs]);

  /* ---- Upload custom background ---- */
  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name.replace(/\.[^.]+$/, ""));
      formData.append("category", "custom");

      const res = await fetch("/api/admin/vehicles/backgrounds/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const newBg = await res.json();
        setCustomBgs((prev) => [newBg, ...prev]);
      }
    } catch { /* swallow */ } finally {
      setUploading(false);
    }
  }, []);

  /* ---- Delete custom background ---- */
  const deleteCustomBg = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/vehicles/backgrounds/custom/${id}`, { method: "DELETE" });
      if (res.ok) {
        setCustomBgs((prev) => prev.filter((b) => b.id !== id));
      }
    } catch { /* swallow */ }
  }, []);

  /* ---- AI Background Removal ---- */
  const runAiRemoval = useCallback(async (vin: string, photoUrl: string) => {
    setAiJobs((prev) => ({
      ...prev,
      [vin]: { job_id: "", vin, status: "processing" },
    }));

    try {
      const res = await fetch("/api/admin/vehicles/backgrounds/remove-bg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin, source_photo_url: photoUrl }),
      });
      const data = await res.json();

      if (res.ok) {
        setAiJobs((prev) => ({
          ...prev,
          [vin]: { ...prev[vin], job_id: data.job_id, status: "completed", cutout_url: data.cutout_url, processing_ms: data.processing_ms },
        }));
      } else {
        setAiJobs((prev) => ({
          ...prev,
          [vin]: { ...prev[vin], status: "failed", error: data.error },
        }));
      }
    } catch (err) {
      setAiJobs((prev) => ({
        ...prev,
        [vin]: { ...prev[vin], status: "failed", error: err instanceof Error ? err.message : "Unknown error" },
      }));
    }
  }, []);

  /* ---- Drag & Drop ---- */
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      ["image/jpeg", "image/png", "image/webp"].includes(f.type),
    );
    if (files.length > 0) handleUpload(files[0]);
  }, [handleUpload]);

  /* ---- Tab renderer ---- */
  const TABS: { id: Tab; label: string }[] = [
    { id: "manage", label: "Manage" },
    { id: "custom", label: "My Backgrounds" },
    { id: "ai-studio", label: "AI Studio" },
    { id: "performance", label: "Performance" },
  ];

  return (
    <div className="space-y-6" data-testid="backgrounds-page">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Background Studio</h1>
          <p className="mt-1 text-sm text-gray-500">
            Professional vehicle photo backgrounds. Upload your own, use our presets,
            or let AI create studio-quality composites automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ================================================================ */}
      {/* TAB: Manage (preset + apply)                                      */}
      {/* ================================================================ */}
      {tab === "manage" && (
        <>
          {/* Background picker */}
          <section className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
            {/* System backgrounds (hero section) */}
            {systemBgs.length > 0 && (
              <>
                <h2 className="text-lg font-bold text-gray-900">Professional Backgrounds</h2>
                <p className="mt-1 text-sm text-gray-500">High-quality studio and outdoor backgrounds, ready to use.</p>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {systemBgs.map((bg) => {
                    const hasThumbnail = "thumbnail_url" in bg && bg.thumbnail_url;
                    const isActive = activeCustomBg === bg.id;
                    return (
                      <button
                        key={bg.id}
                        onClick={() => { setActiveCustomBg(bg.id === activeCustomBg ? null : bg.id); setActivePreset(null); }}
                        className={`group relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all hover:shadow-md ${
                          isActive
                            ? "border-brand-600 ring-2 ring-brand-200"
                            : "border-surface-border hover:border-gray-300"
                        }`}
                        data-testid={`system-bg-${bg.id}`}
                      >
                        <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-100">
                          {hasThumbnail ? (
                            <img src={(bg as CustomBg).thumbnail_url!} alt={bg.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                          ) : (
                            <img
                              src={`/api/admin/vehicles/backgrounds/system/${bg.id}?thumb=true`}
                              alt={bg.name}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              loading="lazy"
                            />
                          )}
                        </div>
                        <span className="text-xs font-medium text-gray-700">{bg.name}</span>
                        <span className="text-[10px] text-gray-400">{bg.description.split(".")[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* CSS Presets (secondary) */}
            <h3 className={`${systemBgs.length > 0 ? "mt-6" : ""} text-sm font-semibold text-gray-700`}>
              {systemBgs.length > 0 ? "Color Presets" : "Choose a Background Style"}
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setActivePreset(p.id === activePreset ? null : p.id); setActiveCustomBg(null); }}
                  className={`group relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all hover:shadow-md ${
                    activePreset === p.id
                      ? "border-brand-600 ring-2 ring-brand-200"
                      : "border-surface-border hover:border-gray-300"
                  }`}
                  data-testid={`preset-card-${p.id}`}
                >
                  <div className="h-16 w-full rounded-lg" style={renderPresetThumb(p.thumbnailCSS)} />
                  <span className="text-xs font-medium text-gray-700">{p.name}</span>
                </button>
              ))}
            </div>

            {/* Custom backgrounds inline */}
            {customBgs.length > 0 && (
              <>
                <h3 className="mt-6 text-sm font-semibold text-gray-700">Your Custom Backgrounds</h3>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                  {customBgs.map((bg) => (
                    <button
                      key={bg.id}
                      onClick={() => { setActiveCustomBg(bg.id === activeCustomBg ? null : bg.id); setActivePreset(null); }}
                      className={`group relative flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all hover:shadow-md ${
                        activeCustomBg === bg.id
                          ? "border-brand-600 ring-2 ring-brand-200"
                          : "border-surface-border hover:border-gray-300"
                      }`}
                    >
                      <div className="h-16 w-full overflow-hidden rounded-lg bg-gray-100">
                        {bg.thumbnail_url ? (
                          <img src={bg.thumbnail_url} alt={bg.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-gray-400">IMG</div>
                        )}
                      </div>
                      <span className="truncate text-xs font-medium text-gray-700">{bg.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Actions bar */}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={selectAll} className="rounded-lg border border-surface-border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              {selectedVins.size === vehicles.length ? "Deselect All" : "Select All"}
            </button>

            {selectedVins.size > 0 && activePreset && (
              <button onClick={() => batchApply("apply_preset")} disabled={loading}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                Apply Preset to {selectedVins.size} Vehicle{selectedVins.size > 1 ? "s" : ""}
              </button>
            )}

            {selectedVins.size > 0 && activeCustomBg && (
              <button onClick={() => batchApply("apply_custom")} disabled={loading}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                Apply Custom to {selectedVins.size} Vehicle{selectedVins.size > 1 ? "s" : ""}
              </button>
            )}

            <button onClick={() => batchApply("auto_recommend")} disabled={loading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              data-testid="auto-apply-btn">
              {loading ? "Applying..." : "Auto-Apply Best for All"}
            </button>
          </div>

          {/* Vehicle grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => {
              const applied = appliedMap[v.vin];
              const isSelected = selectedVins.has(v.vin);
              const isBefore = showBefore[v.vin];
              const presetDef = presets.find((p) => p.id === applied?.id);
              const customDef = customBgs.find((b) => b.id === applied?.id);

              // Resolve background style
              let bgStyle: React.CSSProperties = {};
              if (applied && !isBefore) {
                if (applied.type === "preset" && presetDef) {
                  bgStyle = renderPresetThumb(presetDef.thumbnailCSS);
                } else if (applied.type === "custom" && customDef?.thumbnail_url) {
                  bgStyle = { backgroundImage: `url(${customDef.thumbnail_url})`, backgroundSize: "cover", backgroundPosition: "center" };
                }
              }

              return (
                <div key={v.vin}
                  className={`overflow-hidden rounded-2xl border-2 bg-white shadow-card transition-all ${
                    isSelected ? "border-brand-600 ring-2 ring-brand-100" : "border-surface-border"
                  }`}
                  data-testid={`vehicle-card-${v.vin}`}
                >
                  {/* Photo area */}
                  <div className="relative aspect-video">
                    {isBefore || !applied ? (
                      <div className="flex h-full w-full items-center justify-center bg-gray-100">
                        {v.photo_url ? (
                          <img src={v.photo_url} alt={`${v.year} ${v.make} ${v.model}`} className="h-full w-full object-cover" />
                        ) : (
                          <PhotoPlaceholder />
                        )}
                      </div>
                    ) : applied.compositeUrl ? (
                      <img src={applied.compositeUrl} alt={`${v.year} ${v.make} ${v.model}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center" style={bgStyle}>
                        {v.photo_url ? (
                          <img src={v.photo_url} alt={`${v.year} ${v.make} ${v.model}`} className="h-full w-full object-contain" />
                        ) : (
                          <PhotoPlaceholder light={applied.type === "preset" && (applied.id === "showroom_dark" || applied.id === "urban_night")} />
                        )}
                      </div>
                    )}

                    {/* Checkbox */}
                    <button onClick={() => toggleSelect(v.vin)}
                      className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded border-2 border-white bg-white/80 shadow"
                      aria-label={`Select ${v.year} ${v.make} ${v.model}`}>
                      {isSelected && (
                        <svg className="h-4 w-4 text-brand-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>

                    {/* Before/After toggle */}
                    {applied && (
                      <button onClick={() => setShowBefore((p) => ({ ...p, [v.vin]: !p[v.vin] }))}
                        className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
                        {isBefore ? "After" : "Before"}
                      </button>
                    )}

                    {/* Applied badge */}
                    {applied && !isBefore && (
                      <div className="absolute bottom-2 left-2 z-10 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                        {applied.compositeUrl ? "AI Composite" : applied.name}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-bold text-gray-900">{v.year} {v.make} {v.model} {v.trim}</h3>
                    <p className="text-sm text-gray-500">
                      {v.exterior_color} &middot; ${v.price.toLocaleString()} &middot; {v.condition}
                    </p>

                    {/* Quick-apply buttons */}
                    <div className="mt-3 flex gap-2">
                      {activePreset && !applied && (
                        <button onClick={() => applyPreset(v.vin, activePreset)} disabled={loading}
                          className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50">
                          Apply {presets.find((p) => p.id === activePreset)?.name}
                        </button>
                      )}
                      {activeCustomBg && !applied && (
                        <button onClick={() => applyCustomBg(v.vin, activeCustomBg)} disabled={loading}
                          className="flex-1 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-50">
                          Apply Custom
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ================================================================ */}
      {/* TAB: Custom Backgrounds (upload + gallery)                        */}
      {/* ================================================================ */}
      {tab === "custom" && (
        <>
          {/* Upload area */}
          <section
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? "border-brand-600 bg-brand-50" : "border-gray-300 bg-white"
            }`}
          >
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
            <h3 className="mt-2 text-sm font-semibold text-gray-900">Upload Background Images</h3>
            <p className="mt-1 text-xs text-gray-500">Drag and drop or click to upload. JPEG, PNG, WebP up to 10 MB.</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="mt-4 rounded-lg bg-brand-600 px-6 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Choose File"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
          </section>

          {/* Custom backgrounds gallery */}
          {customBgs.length === 0 ? (
            <div className="rounded-2xl border border-surface-border bg-white p-12 text-center">
              <p className="text-sm text-gray-500">No custom backgrounds yet. Upload your first one above.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {customBgs.map((bg) => (
                <div key={bg.id} className="group overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
                  <div className="aspect-video overflow-hidden bg-gray-100">
                    {bg.thumbnail_url ? (
                      <img src={bg.thumbnail_url} alt={bg.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    ) : bg.original_url ? (
                      <img src={bg.original_url} alt={bg.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-gray-400">No preview</div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-gray-900">{bg.name}</h3>
                    <p className="mt-1 text-xs text-gray-500">
                      {bg.width}x{bg.height} &middot; {(bg.file_size / 1024).toFixed(0)} KB
                      {bg.times_applied > 0 && <> &middot; Applied {bg.times_applied}x</>}
                    </p>
                    {bg.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {bg.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">{tag}</span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => { setActiveCustomBg(bg.id); setTab("manage"); }}
                        className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
                      >
                        Use This
                      </button>
                      <button
                        onClick={() => deleteCustomBg(bg.id)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* TAB: AI Studio                                                    */}
      {/* ================================================================ */}
      {tab === "ai-studio" && (
        <section className="space-y-6">
          <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
            <div className="flex items-center gap-3">
              <div className={`h-3 w-3 rounded-full ${aiAvailable ? "bg-emerald-500" : "bg-red-500"}`} />
              <h2 className="text-lg font-bold text-gray-900">AI Background Removal</h2>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              {aiAvailable
                ? "AI is ready. Select vehicles below to automatically remove backgrounds and create studio-quality composites."
                : "AI providers not configured. Set REPLICATE_API_TOKEN or REMOVE_BG_API_KEY in your environment to enable."}
            </p>
            {aiAvailable && (
              <p className="mt-1 text-xs text-gray-400">
                Cost: ~$0.01 per vehicle. Processing time: ~3-5 seconds each.
              </p>
            )}
          </div>

          {/* Vehicle list for AI processing */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => {
              const job = aiJobs[v.vin];
              return (
                <div key={v.vin} className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
                  <div className="relative aspect-video bg-gray-100">
                    {job?.status === "completed" && job.cutout_url ? (
                      <div className="flex h-full items-center justify-center bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] bg-[size:16px_16px]">
                        <img src={job.cutout_url} alt={`${v.year} ${v.make} ${v.model} cutout`} className="h-full w-full object-contain" />
                      </div>
                    ) : v.photo_url ? (
                      <img src={v.photo_url} alt={`${v.year} ${v.make} ${v.model}`} className="h-full w-full object-cover" />
                    ) : (
                      <PhotoPlaceholder />
                    )}

                    {/* Status overlay */}
                    {job?.status === "processing" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-2">
                          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          <span className="text-xs font-bold text-white">Removing background...</span>
                        </div>
                      </div>
                    )}

                    {job?.status === "completed" && (
                      <div className="absolute bottom-2 right-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        {job.processing_ms ? `${(job.processing_ms / 1000).toFixed(1)}s` : "Done"}
                      </div>
                    )}

                    {job?.status === "failed" && (
                      <div className="absolute bottom-2 right-2 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        Failed
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <h3 className="font-bold text-gray-900">{v.year} {v.make} {v.model} {v.trim}</h3>
                    {job?.status === "failed" && (
                      <p className="mt-1 text-xs text-red-500">{job.error}</p>
                    )}
                    <div className="mt-3 flex gap-2">
                      {(!job || job.status === "failed") && (
                        <button
                          onClick={() => v.photo_url && runAiRemoval(v.vin, v.photo_url)}
                          disabled={!aiAvailable || !v.photo_url}
                          className="flex-1 rounded-lg bg-purple-600 px-3 py-2 text-xs font-bold text-white hover:bg-purple-700 disabled:opacity-50"
                        >
                          {v.photo_url ? "Remove Background" : "No Photo"}
                        </button>
                      )}
                      {job?.status === "completed" && job.cutout_url && (
                        <button
                          onClick={() => {
                            setAppliedMap((prev) => ({
                              ...prev,
                              [v.vin]: { type: "composite", id: "ai", name: "AI Composite", compositeUrl: job.cutout_url },
                            }));
                            setTab("manage");
                          }}
                          className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          Use Cutout
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* TAB: Performance                                                  */}
      {/* ================================================================ */}
      {tab === "performance" && (
        <section className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
          <h2 className="text-lg font-bold text-gray-900">Which Backgrounds Work Best</h2>
          <p className="mt-1 text-sm text-gray-500">
            See which background styles drive the most views, clicks, and leads from shoppers.
            The system uses this data to improve its recommendations automatically.
          </p>

          {insights.length === 0 ? (
            <div className="mt-8 text-center text-gray-400">
              <p className="text-sm">No data yet. Apply backgrounds and let shoppers browse to start seeing results.</p>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="insights-table">
                <thead>
                  <tr className="border-b border-surface-border text-xs uppercase text-gray-500">
                    <th className="pb-3 pr-4">Style</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4 text-right">Views</th>
                    <th className="pb-3 pr-4 text-right">Avg. Time</th>
                    <th className="pb-3 pr-4 text-right">Clicks</th>
                    <th className="pb-3 pr-4 text-right">CTR</th>
                    <th className="pb-3 pr-4 text-right">Leads</th>
                    <th className="pb-3 pr-4 text-right">Lead Rate</th>
                    <th className="pb-3 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {insights.map((row, i) => (
                    <tr key={i} className="border-b border-surface-border last:border-0">
                      <td className="py-3 pr-4 font-medium text-gray-900">{row.name}</td>
                      <td className="py-3 pr-4">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          row.background_type === "composite" ? "bg-purple-100 text-purple-700" :
                          row.background_type === "custom" ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-700"
                        }`}>
                          {row.background_type}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right">{row.total_views.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right">{(row.avg_dwell_ms / 1000).toFixed(1)}s</td>
                      <td className="py-3 pr-4 text-right">{row.total_clicks.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right">{(row.ctr * 100).toFixed(1)}%</td>
                      <td className="py-3 pr-4 text-right">{row.total_leads.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-right">{(row.lead_rate * 100).toFixed(2)}%</td>
                      <td className="py-3 text-right font-bold text-brand-700">{row.engagement_score.toLocaleString()}</td>
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

/* ------------------------------------------------------------------ */
/*  Placeholder component                                              */
/* ------------------------------------------------------------------ */

function PhotoPlaceholder({ light = false }: { light?: boolean }) {
  return (
    <div className={`flex h-full w-full items-center justify-center ${light ? "" : ""}`}>
      <div className={`text-center ${light ? "text-white/60" : "text-gray-400"}`}>
        <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
        </svg>
        <p className="mt-1 text-xs">No photo</p>
      </div>
    </div>
  );
}
