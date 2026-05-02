"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface HeatmapPoint {
  x: number;
  y: number;
  intensity: number;
  count: number;
}

interface ScrollBand {
  label: string;
  minPercent: number;
  maxPercent: number;
  visitorCount: number;
  visitorPercent: number;
}

interface AttentionZone {
  y: number;
  height: number;
  dwellMs: number;
  intensity: number;
}

interface TopPage {
  url: string;
  pageviews: number;
  uniqueVisitors: number;
}

interface HeatmapStats {
  totalClicks: number;
  avgScrollDepth: number;
  hottestElement: string;
}

type HeatmapType = "click" | "scroll" | "attention";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function intensityColor(intensity: number): string {
  if (intensity > 0.8) return "rgba(239, 68, 68, 0.85)";   // red
  if (intensity > 0.6) return "rgba(249, 115, 22, 0.75)";  // orange
  if (intensity > 0.4) return "rgba(234, 179, 8, 0.7)";    // yellow
  if (intensity > 0.2) return "rgba(34, 197, 94, 0.65)";   // green
  return "rgba(59, 130, 246, 0.6)";                         // blue
}

function scrollBandColor(percent: number): string {
  if (percent >= 80) return "bg-green-100 border-green-300 text-green-800";
  if (percent >= 60) return "bg-blue-100 border-blue-300 text-blue-800";
  if (percent >= 40) return "bg-yellow-100 border-yellow-300 text-yellow-800";
  return "bg-red-100 border-red-300 text-red-800";
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function HeatmapsPage() {
  const [type, setType] = useState<HeatmapType>("click");
  const [days, setDays] = useState(7);
  const [page, setPage] = useState("/");
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const [scrollBands, setScrollBands] = useState<ScrollBand[]>([]);
  const [attentionZones, setAttentionZones] = useState<AttentionZone[]>([]);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [stats, setStats] = useState<HeatmapStats | null>(null);
  const [noData, setNoData] = useState(false);
  const [noDataReason, setNoDataReason] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/heatmaps?page=${encodeURIComponent(page)}&type=${type}&days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        setPoints(data.points ?? []);
        setScrollBands(data.scrollBands ?? []);
        setAttentionZones(data.attentionZones ?? []);
        setTopPages(data.topPages ?? []);
        setStats(data.stats ?? null);
        setNoData(Boolean(data.noData));
        setNoDataReason(data.noDataReason ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, type, days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Comparison mode state
  const [compareMode, setCompareMode] = useState(false);
  const [compareDays, setCompareDays] = useState(14);
  const [comparePoints, setComparePoints] = useState<HeatmapPoint[]>([]);
  const [diffPoints, setDiffPoints] = useState<{ increased: HeatmapPoint[]; decreased: HeatmapPoint[]; netChangePercent: number } | null>(null);

  const fetchCompareData = useCallback(() => {
    if (!compareMode) return;
    fetch(`/api/admin/heatmaps?page=${encodeURIComponent(page)}&type=click&days=${compareDays}&compare=true&compareDays=${days}`)
      .then((r) => r.json())
      .then((data) => {
        setComparePoints(data.points ?? []);
        setDiffPoints(data.diff ?? null);
      })
      .catch(() => {});
  }, [compareMode, page, days, compareDays]);

  useEffect(() => {
    fetchCompareData();
  }, [fetchCompareData]);

  const tabs: { key: HeatmapType; label: string }[] = [
    { key: "click", label: "Clicks" },
    { key: "scroll", label: "Scroll Depth" },
    { key: "attention", label: "Attention" },
  ];

  const dateRanges = [
    { value: 7, label: "7 days" },
    { value: 14, label: "14 days" },
    { value: 30, label: "30 days" },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Heatmaps</h1>
          <p className="text-gray-500 mt-1">
            See where visitors click, scroll, and spend time on your pages
          </p>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Total Clicks</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalClicks.toLocaleString()}
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Avg Scroll Depth</p>
              <p className="text-2xl font-bold text-gray-900">{stats.avgScrollDepth}%</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-500">Hottest Element</p>
              <p className="text-2xl font-bold text-gray-900">{stats.hottestElement}</p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          {/* Page selector */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Page</label>
            <select
              value={page}
              onChange={(e) => setPage(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-gray-900 bg-white"
            >
              {topPages.length > 0
                ? topPages.map((p) => (
                    <option key={p.url} value={p.url}>
                      {p.url} ({p.pageviews.toLocaleString()} views)
                    </option>
                  ))
                : <option value="/">/</option>
              }
            </select>
          </div>

          {/* Date range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
            <div className="flex gap-1">
              {dateRanges.map((dr) => (
                <button
                  key={dr.value}
                  onClick={() => setDays(dr.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${
                    days === dr.value
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {dr.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Type tabs + Compare toggle */}
        <div className="flex items-center justify-between mb-6 border-b border-gray-200">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setType(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  type === tab.key
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {type === "click" && (
            <button
              onClick={() => setCompareMode(!compareMode)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md border ${
                compareMode
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {compareMode ? "Exit Comparison" : "Compare Periods"}
            </button>
          )}
        </div>

        {/* Empty-state banner — surfaces the honest "no real data yet"
            signal from the API instead of rendering synthetic clusters
            that would mislead the dealer about visitor behavior. */}
        {!loading && noData && (
          <div
            data-testid="heatmap-no-data-banner"
            className="border border-amber-200 bg-amber-50 rounded-lg p-4 mb-4 text-sm text-amber-900"
          >
            <p className="font-medium">No interactions tracked for this page yet.</p>
            <p className="mt-1 text-amber-800">
              {noDataReason === "database_unavailable"
                ? "The analytics database isn't connected yet — set DATABASE_URL in your environment, then visitors' clicks, scrolls, and dwell time will populate this view."
                : noDataReason === "no_click_events_in_window"
                  ? `Real visitors haven't clicked on ${page} in the selected window. Two reasons this can happen on a public page: (1) no traffic yet — share the URL or wait for visitors; (2) visitors haven't accepted the analytics cookie banner, which gates click tracking on public pages. Admin pages (/admin/*) auto-track since dealer staff are authenticated operators, not regulated visitors.`
                  : noDataReason === "no_scroll_events_in_window"
                    ? `No scroll-depth events on ${page}. Same gating as clicks: public-page tracking requires visitors to accept the analytics cookie banner. /admin/* pages track automatically.`
                    : noDataReason === "no_attention_events_in_window"
                      ? `No cursor-dwell data on ${page}. Attention zones build up as visitors hover with analytics consent enabled, or instantly when staff browse /admin/*.`
                      : noDataReason === "query_failed"
                        ? "We couldn't load real data — the query failed. Check the server logs."
                        : "Waiting on real interactions. Heatmaps populate as people use the site."}
            </p>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
          </div>
        ) : (
          <>
            {/* Click heatmap */}
            {type === "click" && (
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-4">Click Density Map</h3>
                <div className="relative bg-gray-50 rounded-lg" style={{ height: 600, width: "100%" }}>
                  {/* Page outline */}
                  <div className="absolute inset-0 border border-dashed border-gray-300 rounded-lg">
                    {/* Nav bar */}
                    <div className="h-12 bg-gray-100 border-b border-gray-200 rounded-t-lg flex items-center px-4">
                      <div className="w-24 h-4 bg-gray-300 rounded" />
                      <div className="flex gap-4 ml-8">
                        <div className="w-16 h-3 bg-gray-300 rounded" />
                        <div className="w-16 h-3 bg-gray-300 rounded" />
                        <div className="w-16 h-3 bg-gray-300 rounded" />
                      </div>
                    </div>
                    {/* Hero */}
                    <div className="mt-8 mx-auto w-3/4 h-32 bg-gray-100 rounded flex items-center justify-center">
                      <div className="w-32 h-8 bg-gray-200 rounded" />
                    </div>
                    {/* Cards */}
                    <div className="mt-8 mx-8 flex gap-4">
                      <div className="flex-1 h-40 bg-gray-100 rounded" />
                      <div className="flex-1 h-40 bg-gray-100 rounded" />
                      <div className="flex-1 h-40 bg-gray-100 rounded" />
                    </div>
                  </div>
                  {/* Heatmap overlay */}
                  {points.map((point, i) => (
                    <div
                      key={i}
                      className="absolute rounded-full"
                      style={{
                        left: `${(point.x / 800) * 100}%`,
                        top: `${(point.y / 1400) * 100}%`,
                        width: Math.max(30, point.intensity * 80),
                        height: Math.max(30, point.intensity * 80),
                        backgroundColor: intensityColor(point.intensity),
                        transform: "translate(-50%, -50%)",
                        filter: `blur(${Math.max(2, point.intensity * 6)}px)`,
                        boxShadow: `0 0 ${Math.max(8, point.intensity * 20)}px ${intensityColor(point.intensity)}`,
                      }}
                      title={`${point.count} clicks`}
                    />
                  ))}
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
                  <span>Low</span>
                  <div className="flex gap-1">
                    {["bg-blue-300", "bg-green-300", "bg-yellow-300", "bg-orange-300", "bg-red-400"].map((c) => (
                      <div key={c} className={`w-6 h-3 rounded ${c}`} />
                    ))}
                  </div>
                  <span>High</span>
                </div>
              </div>
            )}

            {/* Side-by-side comparison */}
            {type === "click" && compareMode && (
              <div className="border border-gray-200 rounded-lg p-4 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Side-by-Side Comparison</h3>
                  {diffPoints && (
                    <span className={`text-sm font-medium ${diffPoints.netChangePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {diffPoints.netChangePercent >= 0 ? "+" : ""}{diffPoints.netChangePercent}% change
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Current ({days} days)</p>
                    <div className="relative bg-gray-50 rounded-lg" style={{ height: 300 }}>
                      {points.map((point, i) => (
                        <div
                          key={i}
                          className="absolute rounded-full"
                          style={{
                            left: `${(point.x / 800) * 100}%`,
                            top: `${(point.y / 1400) * 100}%`,
                            width: Math.max(12, point.intensity * 40),
                            height: Math.max(12, point.intensity * 40),
                            backgroundColor: intensityColor(point.intensity),
                            transform: "translate(-50%, -50%)",
                            filter: `blur(${Math.max(3, point.intensity * 8)}px)`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Previous ({compareDays} days)</p>
                    <div className="relative bg-gray-50 rounded-lg" style={{ height: 300 }}>
                      {comparePoints.map((point, i) => (
                        <div
                          key={i}
                          className="absolute rounded-full"
                          style={{
                            left: `${(point.x / 800) * 100}%`,
                            top: `${(point.y / 1400) * 100}%`,
                            width: Math.max(12, point.intensity * 40),
                            height: Math.max(12, point.intensity * 40),
                            backgroundColor: intensityColor(point.intensity),
                            transform: "translate(-50%, -50%)",
                            filter: `blur(${Math.max(3, point.intensity * 8)}px)`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Scroll depth */}
            {type === "scroll" && (
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-4">Scroll Depth</h3>
                <div className="space-y-3">
                  {scrollBands.map((band) => (
                    <div key={band.label} className={`border rounded-lg p-4 ${scrollBandColor(band.visitorPercent)}`}>
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-semibold">{band.label}</span>
                          <span className="ml-2 text-sm opacity-75">
                            {band.visitorCount.toLocaleString()} visitors
                          </span>
                        </div>
                        <span className="text-2xl font-bold">{band.visitorPercent}%</span>
                      </div>
                      <div className="mt-2 w-full bg-white/50 rounded-full h-2">
                        <div
                          className="h-2 rounded-full bg-current opacity-40"
                          style={{ width: `${band.visitorPercent}%` }}
                        />
                      </div>
                      <p className="text-sm mt-1 opacity-75">
                        {band.visitorPercent}% of visitors saw this area
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attention map */}
            {type === "attention" && (
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-4">Attention Map</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Shows how long visitors spent looking at each section, weighted by dwell time.
                </p>
                <div className="relative bg-gray-50 rounded-lg" style={{ height: 500 }}>
                  {attentionZones.map((zone, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-b border-gray-200"
                      style={{
                        top: `${(zone.y / 1400) * 100}%`,
                        height: `${(zone.height / 1400) * 100}%`,
                        backgroundColor: intensityColor(zone.intensity),
                      }}
                    >
                      <div className="flex justify-between items-center px-4 py-1 text-sm">
                        <span className="font-medium text-gray-700">
                          {zone.y}px - {zone.y + zone.height}px
                        </span>
                        <span className="text-gray-600">
                          {(zone.dwellMs / 1000).toFixed(1)}s avg dwell
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
