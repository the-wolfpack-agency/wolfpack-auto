"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface FeedConfig {
  id: string;
  platform: string;
  platform_label: string;
  enabled: boolean;
  api_key: string;
  dealer_identifier: string;
  auto_sync: boolean;
  sync_interval_hours: number;
  vehicles_synced: number;
  last_sync_at: string | null;
  errors: number;
  created_at: string;
  updated_at: string;
}

interface SyncRecord {
  id: string;
  platform: string;
  status: string;
  vehicles: number;
  errors: number;
  duration_ms: number;
  completed_at: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const PLATFORM_LABELS: Record<string, string> = {
  autotrader: "AutoTrader",
  cars_com: "Cars.com",
  cargurus: "CarGurus",
  facebook_marketplace: "Facebook Marketplace",
  craigslist: "Craigslist",
};

const PLATFORM_COLORS: Record<string, string> = {
  autotrader: "bg-orange-50 text-orange-700 ring-orange-600/20",
  cars_com: "bg-blue-50 text-blue-700 ring-blue-600/20",
  cargurus: "bg-green-50 text-green-700 ring-green-600/20",
  facebook_marketplace: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  craigslist: "bg-purple-50 text-purple-700 ring-purple-600/20",
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-50 text-green-700 ring-green-600/20",
  inactive: "bg-gray-100 text-gray-600 ring-gray-400/20",
  error: "bg-red-50 text-red-700 ring-red-600/20",
};

const SYNC_STATUS_BADGE: Record<string, string> = {
  success: "bg-green-50 text-green-700 ring-green-600/20",
  partial: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  error: "bg-red-50 text-red-700 ring-red-600/20",
};

const FORMAT_OPTIONS: Record<string, string[]> = {
  autotrader: ["xml", "csv"],
  cars_com: ["csv"],
  cargurus: ["json"],
  facebook_marketplace: ["json"],
  craigslist: ["csv"],
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function feedStatus(feed: FeedConfig): string {
  if (!feed.enabled) return "inactive";
  if (feed.errors > 0) return "error";
  return "active";
}

function feedStatusLabel(feed: FeedConfig): string {
  const s = feedStatus(feed);
  if (s === "active") return "Active";
  if (s === "error") return "Errors";
  return "Inactive";
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function SyndicationPage() {
  const [feeds, setFeeds] = useState<FeedConfig[]>([]);
  const [syncHistory, setSyncHistory] = useState<SyncRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* Modals */
  const [configFeed, setConfigFeed] = useState<FeedConfig | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  /* Config form */
  const [configForm, setConfigForm] = useState({
    api_key: "",
    dealer_identifier: "",
    auto_sync: false,
    sync_interval_hours: 4,
    enabled: false,
  });

  /* Export form */
  const [exportPlatform, setExportPlatform] = useState("");
  const [exportFormat, setExportFormat] = useState("");
  const [exporting, setExporting] = useState(false);

  /* -------------------------------------------------------------------------- */
  /* Fetch data                                                                 */
  /* -------------------------------------------------------------------------- */

  const fetchFeeds = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/syndication");
      if (res.ok) {
        const data = await res.json();
        setFeeds(data.feeds ?? []);
        setSyncHistory(data.sync_history ?? []);
      } else {
        setError("Failed to load syndication feeds.");
      }
    } catch (err) {
      console.error("Failed to fetch syndication feeds:", err);
      setError("Failed to load syndication feeds.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFeeds();
  }, [fetchFeeds]);

  /* -------------------------------------------------------------------------- */
  /* Stats                                                                      */
  /* -------------------------------------------------------------------------- */

  const stats = useMemo(() => {
    const totalListings = feeds.reduce((s, f) => s + f.vehicles_synced, 0);
    const activePlatforms = feeds.filter((f) => f.enabled).length;
    const lastSync = feeds
      .filter((f) => f.last_sync_at)
      .sort((a, b) => new Date(b.last_sync_at!).getTime() - new Date(a.last_sync_at!).getTime())[0];
    const totalErrors = feeds.reduce((s, f) => s + f.errors, 0);
    const totalSynced = feeds.reduce((s, f) => s + f.vehicles_synced, 0);
    const errorRate = totalSynced > 0 ? ((totalErrors / totalSynced) * 100).toFixed(1) : "0.0";

    return {
      totalListings,
      activePlatforms,
      lastSyncTime: lastSync?.last_sync_at ?? null,
      errorRate,
    };
  }, [feeds]);

  /* -------------------------------------------------------------------------- */
  /* Config modal open                                                          */
  /* -------------------------------------------------------------------------- */

  const openConfig = (feed: FeedConfig) => {
    setConfigFeed(feed);
    setConfigForm({
      api_key: feed.api_key.includes("****") ? "" : feed.api_key,
      dealer_identifier: feed.dealer_identifier,
      auto_sync: feed.auto_sync,
      sync_interval_hours: feed.sync_interval_hours,
      enabled: feed.enabled,
    });
  };

  /* -------------------------------------------------------------------------- */
  /* Save config                                                                */
  /* -------------------------------------------------------------------------- */

  const handleSaveConfig = async () => {
    if (!configFeed) return;
    if (configForm.enabled && !configForm.dealer_identifier.trim()) return;

    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        platform: configFeed.platform,
        enabled: configForm.enabled,
        dealer_identifier: configForm.dealer_identifier,
        auto_sync: configForm.auto_sync,
        sync_interval_hours: configForm.sync_interval_hours,
      };
      // Only send api_key if user entered a new one (not blank placeholder)
      if (configForm.api_key.trim()) {
        payload.api_key = configForm.api_key;
      } else if (configForm.enabled && !configFeed.api_key) {
        setError("API key is required when enabling a feed.");
        setSaving(false);
        return;
      } else {
        // Keep existing key
        payload.api_key = configFeed.api_key;
      }

      const res = await fetch("/api/admin/syndication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setConfigFeed(null);
        fetchFeeds();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save configuration.");
      }
    } catch (err) {
      console.error("Save config failed:", err);
      setError("Failed to save configuration.");
    } finally {
      setSaving(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /* Toggle enable/disable                                                      */
  /* -------------------------------------------------------------------------- */

  const handleToggle = async (feed: FeedConfig) => {
    try {
      const res = await fetch("/api/admin/syndication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: feed.platform,
          enabled: !feed.enabled,
          api_key: feed.api_key,
          dealer_identifier: feed.dealer_identifier,
          auto_sync: feed.auto_sync,
          sync_interval_hours: feed.sync_interval_hours,
        }),
      });
      if (res.ok) {
        fetchFeeds();
      }
    } catch (err) {
      console.error("Toggle failed:", err);
    }
  };

  /* -------------------------------------------------------------------------- */
  /* Sync now (simulated)                                                       */
  /* -------------------------------------------------------------------------- */

  const handleSyncNow = async (platform: string) => {
    setSyncing(platform);
    // Simulate a sync by waiting briefly then refreshing
    await new Promise((r) => setTimeout(r, 1500));
    setSyncing(null);
    fetchFeeds();
  };

  /* -------------------------------------------------------------------------- */
  /* Export                                                                      */
  /* -------------------------------------------------------------------------- */

  const handleExport = async () => {
    if (!exportPlatform || !exportFormat) return;
    setExporting(true);
    setError("");
    try {
      const res = await fetch("/api/admin/syndication/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: exportPlatform, format: exportFormat }),
      });
      if (res.ok) {
        const disposition = res.headers.get("Content-Disposition") || "";
        const match = disposition.match(/filename="?([^"]+)"?/);
        const filename = match?.[1] || `${exportPlatform}-feed.${exportFormat}`;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setShowExport(false);
      } else {
        const data = await res.json().catch(() => ({ error: "Export failed" }));
        setError(data.error || "Export failed.");
      }
    } catch (err) {
      console.error("Export failed:", err);
      setError("Export failed.");
    } finally {
      setExporting(false);
    }
  };

  /* -------------------------------------------------------------------------- */
  /* Render                                                                     */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Listing Syndication</h1>
            <p className="mt-1 text-sm text-gray-500">
              Push inventory to third-party listing sites automatically
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowExport(true);
                setExportPlatform("");
                setExportFormat("");
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-surface-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              Export Feed
            </button>
            <button
              onClick={() => {
                const first = feeds.find((f) => !f.enabled);
                if (first) openConfig(first);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Manage Feed
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
            <button onClick={() => setError("")} className="ml-2 font-medium underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Stats cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Listings" value={String(stats.totalListings)} sub="across all platforms" color="brand" />
          <StatCard label="Active Platforms" value={String(stats.activePlatforms)} sub={`of ${feeds.length} configured`} color="green" />
          <StatCard label="Last Sync" value={timeAgo(stats.lastSyncTime)} sub={stats.lastSyncTime ? fmtDate(stats.lastSyncTime) : "No syncs yet"} color="purple" />
          <StatCard label="Error Rate" value={`${stats.errorRate}%`} sub="of synced vehicles" color="accent" />
        </div>

        {/* Platform cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loading ? (
            <div className="col-span-full py-12 text-center text-sm text-gray-400">
              Loading syndication feeds...
            </div>
          ) : (
            feeds.map((feed) => {
              const status = feedStatus(feed);
              return (
                <div
                  key={feed.id}
                  className="rounded-card border border-surface-border bg-white p-5 shadow-card"
                >
                  {/* Platform header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold ${PLATFORM_COLORS[feed.platform] || "bg-gray-100 text-gray-600"}`}
                      >
                        {(feed.platform_label || feed.platform).slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">
                          {feed.platform_label || PLATFORM_LABELS[feed.platform] || feed.platform}
                        </h3>
                        <span
                          className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[status]}`}
                        >
                          {feedStatusLabel(feed)}
                        </span>
                      </div>
                    </div>
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggle(feed)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                        feed.enabled ? "bg-brand-600" : "bg-gray-200"
                      }`}
                      role="switch"
                      aria-checked={feed.enabled}
                      aria-label={`Toggle ${feed.platform_label}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                          feed.enabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Stats */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500">Vehicles Synced</p>
                      <p className="text-lg font-semibold text-gray-900">{feed.vehicles_synced}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Last Sync</p>
                      <p className="text-sm font-medium text-gray-900">{timeAgo(feed.last_sync_at)}</p>
                    </div>
                    {feed.errors > 0 && (
                      <div className="col-span-2">
                        <p className="text-xs text-red-600">
                          {feed.errors} error{feed.errors !== 1 ? "s" : ""} on last sync
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleSyncNow(feed.platform)}
                      disabled={!feed.enabled || syncing === feed.platform}
                      className="flex-1 rounded-lg border border-surface-border px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {syncing === feed.platform ? "Syncing..." : "Sync Now"}
                    </button>
                    <button
                      onClick={() => openConfig(feed)}
                      className="flex-1 rounded-lg border border-surface-border px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-surface-subtle"
                    >
                      Configure
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Sync history table */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900">Sync History</h2>
          <div className="mt-3 overflow-hidden rounded-card border border-surface-border bg-white shadow-card">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-border">
                <thead className="bg-surface-subtle">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Platform
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                      Vehicles
                    </th>
                    <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 sm:table-cell">
                      Errors
                    </th>
                    <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 lg:table-cell">
                      Duration
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Completed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {syncHistory.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                        No sync history yet.
                      </td>
                    </tr>
                  ) : (
                    syncHistory.map((sync) => (
                      <tr key={sync.id} className="transition-colors hover:bg-surface-muted">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {PLATFORM_LABELS[sync.platform] || sync.platform}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${SYNC_STATUS_BADGE[sync.status] || "bg-gray-100 text-gray-600 ring-gray-400/20"}`}
                          >
                            {sync.status.charAt(0).toUpperCase() + sync.status.slice(1)}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 text-right text-sm text-gray-600 sm:table-cell">
                          {sync.vehicles}
                        </td>
                        <td className="hidden px-4 py-3 text-right text-sm sm:table-cell">
                          <span className={sync.errors > 0 ? "text-red-600 font-medium" : "text-gray-600"}>
                            {sync.errors}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3 text-right text-sm text-gray-600 lg:table-cell">
                          {(sync.duration_ms / 1000).toFixed(1)}s
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">
                          {fmtDate(sync.completed_at)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Configure Modal */}
      {configFeed && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-t-2xl sm:rounded-card bg-white p-6 shadow-xl max-h-[95dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                Configure {configFeed.platform_label || PLATFORM_LABELS[configFeed.platform]}
              </h2>
              <button
                onClick={() => setConfigFeed(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {/* Enabled toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Enable Feed</label>
                <button
                  onClick={() => setConfigForm({ ...configForm, enabled: !configForm.enabled })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                    configForm.enabled ? "bg-brand-600" : "bg-gray-200"
                  }`}
                  role="switch"
                  aria-checked={configForm.enabled}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                      configForm.enabled ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  API Key {configForm.enabled && "*"}
                </label>
                <input
                  type="password"
                  value={configForm.api_key}
                  onChange={(e) => setConfigForm({ ...configForm, api_key: e.target.value })}
                  placeholder={configFeed.api_key ? "Leave blank to keep current key" : "Enter API key"}
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Dealer Identifier */}
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Dealer Identifier {configForm.enabled && "*"}
                </label>
                <input
                  type="text"
                  value={configForm.dealer_identifier}
                  onChange={(e) => setConfigForm({ ...configForm, dealer_identifier: e.target.value })}
                  placeholder="e.g. WOLF-AT-4821"
                  className="mt-1 block w-full rounded-md border border-surface-border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Auto sync toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Auto Sync</label>
                <button
                  onClick={() => setConfigForm({ ...configForm, auto_sync: !configForm.auto_sync })}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                    configForm.auto_sync ? "bg-brand-600" : "bg-gray-200"
                  }`}
                  role="switch"
                  aria-checked={configForm.auto_sync}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                      configForm.auto_sync ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Sync interval */}
              {configForm.auto_sync && (
                <div>
                  <label className="block text-xs font-medium text-gray-500">Sync Interval (hours)</label>
                  <select
                    value={configForm.sync_interval_hours}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, sync_interval_hours: Number(e.target.value) })
                    }
                    className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value={1}>Every hour</option>
                    <option value={2}>Every 2 hours</option>
                    <option value={4}>Every 4 hours</option>
                    <option value={6}>Every 6 hours</option>
                    <option value={12}>Every 12 hours</option>
                    <option value={24}>Every 24 hours</option>
                  </select>
                </div>
              )}
            </div>

            {/* Error in modal */}
            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfigFeed(null)}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-card bg-white p-6 shadow-xl max-h-[95dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Export Feed</h2>
              <button
                onClick={() => setShowExport(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500">Platform *</label>
                <select
                  value={exportPlatform}
                  onChange={(e) => {
                    setExportPlatform(e.target.value);
                    const formats = FORMAT_OPTIONS[e.target.value] || [];
                    setExportFormat(formats[0] || "");
                  }}
                  className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Select platform</option>
                  {feeds.map((f) => (
                    <option key={f.platform} value={f.platform}>
                      {f.platform_label || PLATFORM_LABELS[f.platform]}
                    </option>
                  ))}
                </select>
              </div>
              {exportPlatform && (
                <div>
                  <label className="block text-xs font-medium text-gray-500">Format *</label>
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    {(FORMAT_OPTIONS[exportPlatform] || ["json"]).map((fmt) => (
                      <option key={fmt} value={fmt}>
                        {fmt.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowExport(false)}
                className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || !exportPlatform || !exportFormat}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exporting ? "Exporting..." : "Export"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Stat card subcomponent                                                     */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    brand: "border-l-brand-500",
    green: "border-l-green-500",
    purple: "border-l-purple-500",
    accent: "border-l-accent-500",
  };

  return (
    <div
      className={`rounded-card border border-surface-border border-l-4 bg-white p-4 shadow-card ${colorMap[color] || colorMap.brand}`}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
    </div>
  );
}
