"use client";

import { useCallback, useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface FeedConfig {
  platform: string;
  platform_label: string;
  enabled: boolean;
  vehicles_synced: number;
  last_sync_at: string | null;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export function InventoryActions() {
  /* ---- CSV export state ---- */
  const [exporting, setExporting] = useState(false);

  /* ---- Syndication state ---- */
  const [showSyndicate, setShowSyndicate] = useState(false);
  const [feeds, setFeeds] = useState<FeedConfig[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  /* ---- Auto-dismiss toast ---- */
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  /* ---- Fetch syndication feeds ---- */
  const fetchFeeds = useCallback(async () => {
    setFeedsLoading(true);
    try {
      const res = await fetch("/api/admin/syndication");
      if (res.ok) {
        const data = await res.json();
        setFeeds(data.feeds ?? []);
      }
    } catch (err) {
      console.error("Failed to fetch syndication feeds:", err);
    } finally {
      setFeedsLoading(false);
    }
  }, []);

  /* ---- Handle CSV export ---- */
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/inventory/export");
      if (res.ok) {
        const disposition = res.headers.get("Content-Disposition") || "";
        const match = disposition.match(/filename="?([^"]+)"?/);
        const filename = match?.[1] || `inventory-export-${new Date().toISOString().slice(0, 10)}.csv`;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setToast({ type: "success", message: "Inventory CSV downloaded." });
      } else {
        setToast({ type: "error", message: "Failed to export inventory." });
      }
    } catch {
      setToast({ type: "error", message: "Failed to export inventory." });
    } finally {
      setExporting(false);
    }
  };

  /* ---- Handle syndication sync ---- */
  const handleSyncNow = async (platform: string, format: string) => {
    setSyncing(platform);
    try {
      const res = await fetch("/api/admin/syndication/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, format }),
      });
      if (res.ok) {
        setToast({ type: "success", message: `Inventory pushed to ${platformLabel(platform)}.` });
        setShowSyndicate(false);
      } else {
        const data = await res.json().catch(() => ({ error: "Sync failed" }));
        setToast({ type: "error", message: data.error || "Sync failed." });
      }
    } catch {
      setToast({ type: "error", message: "Sync failed." });
    } finally {
      setSyncing(null);
    }
  };

  /* ---- Open syndication dropdown ---- */
  const openSyndicate = () => {
    setShowSyndicate(!showSyndicate);
    if (!showSyndicate && feeds.length === 0) {
      fetchFeeds();
    }
  };

  return (
    <>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        {/* Export CSV */}
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-surface-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {exporting ? "Exporting..." : "Export CSV"}
        </button>

        {/* Syndicate / Push to Listings */}
        <div className="relative">
          <button
            onClick={openSyndicate}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-surface-border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-surface-subtle focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 sm:w-auto"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Push to Listings
          </button>

          {/* Dropdown */}
          {showSyndicate && (
            <>
              {/* Backdrop to close dropdown on outside click */}
              <div
                className="fixed inset-0 z-30"
                onClick={() => setShowSyndicate(false)}
              />
              <div className="absolute right-0 z-40 mt-2 w-72 rounded-card border border-surface-border bg-white p-4 shadow-lg sm:w-80">
                <h3 className="text-sm font-semibold text-gray-900">
                  Push Inventory to Listings
                </h3>
                <p className="mt-1 text-xs text-gray-500">
                  Sync your inventory to third-party listing platforms.
                </p>

                {feedsLoading ? (
                  <div className="mt-4 py-4 text-center text-xs text-gray-400">
                    Loading platforms...
                  </div>
                ) : feeds.length === 0 ? (
                  <div className="mt-4 py-4 text-center text-xs text-gray-400">
                    No syndication feeds configured.{" "}
                    <a
                      href="/admin/syndication"
                      className="font-medium text-brand-600 hover:underline"
                    >
                      Set up feeds
                    </a>
                  </div>
                ) : (
                  <ul className="mt-3 divide-y divide-surface-border">
                    {feeds.map((feed) => (
                      <li
                        key={feed.platform}
                        className="flex items-center justify-between py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {feed.platform_label || platformLabel(feed.platform)}
                          </p>
                          <p className="text-xs text-gray-400">
                            {feed.enabled ? (
                              <span className="text-green-600">
                                Enabled &middot; {feed.vehicles_synced} vehicles
                              </span>
                            ) : (
                              <span className="text-gray-400">Disabled</span>
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            handleSyncNow(
                              feed.platform,
                              defaultFormat(feed.platform),
                            )
                          }
                          disabled={!feed.enabled || syncing === feed.platform}
                          className="shrink-0 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {syncing === feed.platform ? "Syncing..." : "Sync Now"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 border-t border-surface-border pt-3">
                  <a
                    href="/admin/syndication"
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    Manage all syndication feeds
                  </a>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Add Vehicle */}
        <a
          href="/admin/inventory/add"
          className="inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 sm:w-auto"
        >
          + Add Vehicle
        </a>
      </div>

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg transition-all ${
            toast.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {toast.type === "success" ? (
            <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          )}
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-2 font-medium hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    autotrader: "AutoTrader",
    cars_com: "Cars.com",
    cargurus: "CarGurus",
    facebook_marketplace: "Facebook Marketplace",
    craigslist: "Craigslist",
  };
  return labels[platform] || platform;
}

function defaultFormat(platform: string): string {
  const formats: Record<string, string> = {
    autotrader: "xml",
    cars_com: "csv",
    cargurus: "json",
    facebook_marketplace: "json",
    craigslist: "csv",
  };
  return formats[platform] || "json";
}
