"use client";

import { useCallback, useEffect, useState } from "react";
import AnalyticsChat from "@/components/AnalyticsChat";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface SubDashboardItem {
  name: string;
  path: string;
  category: string;
  healthy: boolean;
  key_metrics: Record<string, number | string | boolean>;
  error?: string;
}

interface SubDashboardAgg {
  subdashboards: SubDashboardItem[];
  summary: { total: number; healthy: number; degraded: number };
}

interface DashboardData {
  keyMetrics: {
    visitors: { today: number; week: number; month: number };
    leadTemperature: { hot: number; warm: number; cool: number; cold: number };
    conversionRate: number;
    avgSessionDuration: string;
  };
  trafficEngagement: {
    topPages: { page: string; views: number }[];
    peakHours: { hour: number; count: number }[];
    referrers: { source: string; percentage: number }[];
    deviceSplit: { desktop: number; mobile: number; tablet: number };
  };
  vehicleIntelligence: {
    mostViewed: { name: string; views: number; vin: string }[];
    inventoryGaps: { query: string; searches: number }[];
    comparisonPatterns: { pair: string; count: number }[];
    photoEngagement: { vehicle: string; score: number }[];
  };
  conversionFunnel: {
    temperatureDistribution: { label: string; value: number; color: string }[];
    formAbandonment: { field: string; dropoff: number }[];
    exitIntentTriggers: { trigger: string; count: number }[];
    ctaVisibility: { cta: string; impressions: number; clicks: number }[];
  };
  uxHealth: {
    rageClicks: { count: number; locations: { page: string; element: string; count: number }[] };
    deadClicks: { count: number; locations: { page: string; element: string; count: number }[] };
    pageLoadPerformance: { page: string; avgLoadMs: number }[];
    mobileVsDesktopConversion: { mobile: number; desktop: number };
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function AnalyticsDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [subDashboards, setSubDashboards] = useState<SubDashboardAgg | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/analytics/dashboard")
        .then((res) => {
          if (res.status === 401 || res.status === 403) return null;
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        }),
      fetch("/api/admin/analytics/subdashboards")
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null),
    ])
      .then(([dashboard, subs]) => {
        if (dashboard) setData(dashboard);
        if (subs) setSubDashboards(subs);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const { keyMetrics, trafficEngagement, vehicleIntelligence, conversionFunnel, uxHealth } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
        <p className="mt-1 text-base text-gray-500">
          Behavioral insights from 39 signal generators across your dealership.
        </p>
      </div>

      {/* NLP Analytics Chat */}
      <AnalyticsChat />

      {/* Sub-navigation */}
      <div className="flex gap-2 border-b border-surface-border pb-3">
        <TabLink href="/admin/analytics" active>Dashboard</TabLink>
        <TabLink href="/admin/analytics/leads">Leads</TabLink>
        <TabLink href="/admin/analytics/inventory">Inventory</TabLink>
        <TabLink href="/admin/analytics/platform-health">Health</TabLink>
        <TabLink href="/admin/analytics/verification">Verification</TabLink>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Key Metrics — Top Row                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Visitors Today"
          value={keyMetrics.visitors.today.toLocaleString()}
          sub={`${keyMetrics.visitors.week.toLocaleString()} this week`}
          color="brand"
        />
        <MetricCard
          label="Hot Leads"
          value={keyMetrics.leadTemperature.hot}
          sub={`${keyMetrics.leadTemperature.warm} warm / ${keyMetrics.leadTemperature.cool} cool / ${keyMetrics.leadTemperature.cold} cold`}
          color="red"
        />
        <MetricCard
          label="Conversion Rate"
          value={`${keyMetrics.conversionRate}%`}
          sub="Visitor to lead"
          color="green"
        />
        <MetricCard
          label="Avg Session"
          value={keyMetrics.avgSessionDuration}
          sub="Time on site"
          color="blue"
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Traffic & Engagement                                               */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeading title="Traffic & Engagement" />
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Pages */}
        <Card title="Page Engagement Ranking">
          <div className="space-y-3">
            {trafficEngagement.topPages.map((p, i) => {
              const max = trafficEngagement.topPages[0]?.views || 1;
              return (
                <div key={p.page}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">
                      <span className="mr-2 text-gray-400">#{i + 1}</span>
                      {p.page}
                    </span>
                    <span className="font-semibold text-gray-900">{p.views.toLocaleString()}</span>
                  </div>
                  <Bar value={p.views} max={max} color="bg-brand-500" />
                </div>
              );
            })}
          </div>
        </Card>

        {/* Peak Hours */}
        <Card title="Peak Hours (24h)">
          <div className="flex items-end gap-1 h-40">
            {trafficEngagement.peakHours.map((h) => {
              const max = Math.max(...trafficEngagement.peakHours.map((x) => x.count), 1);
              const heightPct = Math.max((h.count / max) * 100, 2);
              return (
                <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-indigo-500 transition-all"
                    style={{ height: `${heightPct}%` }}
                    title={`${h.hour}:00 — ${h.count} visits`}
                  />
                  <span className="text-[10px] text-gray-400">
                    {h.hour % 6 === 0 ? `${h.hour}h` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Referrer Breakdown */}
        <Card title="Traffic Sources">
          <div className="space-y-3">
            {trafficEngagement.referrers.map((r) => (
              <div key={r.source}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">{r.source}</span>
                  <span className="font-semibold text-gray-900">{r.percentage}%</span>
                </div>
                <Bar value={r.percentage} max={100} color="bg-emerald-500" />
              </div>
            ))}
          </div>
        </Card>

        {/* Device Split */}
        <Card title="Device Split">
          <div className="space-y-4">
            {(["desktop", "mobile", "tablet"] as const).map((device) => {
              const val = trafficEngagement.deviceSplit[device];
              const colors = { desktop: "bg-blue-500", mobile: "bg-purple-500", tablet: "bg-orange-400" };
              return (
                <div key={device}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium capitalize text-gray-700">{device}</span>
                    <span className="font-semibold text-gray-900">{val}%</span>
                  </div>
                  <Bar value={val} max={100} color={colors[device]} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Vehicle Intelligence                                               */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeading title="Vehicle Intelligence" />
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Most Viewed */}
        <Card title="Most Viewed Vehicles">
          <div className="space-y-3">
            {vehicleIntelligence.mostViewed.map((v, i) => {
              const max = vehicleIntelligence.mostViewed[0]?.views || 1;
              return (
                <div key={v.vin}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">
                      <span className="mr-2 text-gray-400">#{i + 1}</span>
                      {v.name}
                    </span>
                    <span className="font-semibold text-gray-900">{v.views}</span>
                  </div>
                  <Bar value={v.views} max={max} color="bg-cyan-500" />
                </div>
              );
            })}
          </div>
        </Card>

        {/* Inventory Gaps */}
        <Card title="Inventory Gap Alerts">
          <p className="mb-3 text-xs text-gray-500">Searches with no matching inventory</p>
          {vehicleIntelligence.inventoryGaps.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No gaps detected</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="pb-2 text-left font-semibold text-gray-500 text-xs uppercase">Search Query</th>
                  <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">Searches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {vehicleIntelligence.inventoryGaps.map((g) => (
                  <tr key={g.query}>
                    <td className="py-2 text-gray-700">{g.query}</td>
                    <td className="py-2 text-right font-semibold text-red-600">{g.searches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Comparison Shopping */}
        <Card title="Comparison Shopping Patterns">
          <div className="space-y-2">
            {vehicleIntelligence.comparisonPatterns.map((c) => (
              <div key={c.pair} className="flex justify-between rounded-lg bg-surface-muted px-3 py-2 text-sm">
                <span className="text-gray-700">{c.pair}</span>
                <span className="font-semibold text-gray-900">{c.count}x</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Photo Engagement */}
        <Card title="Photo Engagement Scores">
          <div className="space-y-3">
            {vehicleIntelligence.photoEngagement.map((p) => (
              <div key={p.vehicle}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">{p.vehicle}</span>
                  <span className="font-semibold text-gray-900">{p.score}/100</span>
                </div>
                <Bar value={p.score} max={100} color="bg-amber-500" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Conversion Funnel                                                  */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeading title="Conversion Funnel" />
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Temperature Distribution */}
        <Card title="Lead Temperature Distribution">
          <div className="flex items-end gap-3 h-40">
            {conversionFunnel.temperatureDistribution.map((t) => {
              const max = Math.max(...conversionFunnel.temperatureDistribution.map((x) => x.value), 1);
              const heightPct = Math.max((t.value / max) * 100, 4);
              return (
                <div key={t.label} className="flex-1 flex flex-col items-center gap-2">
                  <span className="text-xs font-semibold text-gray-700">{t.value}</span>
                  <div
                    className="w-full rounded-t transition-all"
                    style={{ height: `${heightPct}%`, backgroundColor: t.color }}
                  />
                  <span className="text-xs font-medium text-gray-500">{t.label}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Form Abandonment */}
        <Card title="Form Abandonment Rate">
          <p className="mb-3 text-xs text-gray-500">Which fields lose people</p>
          <div className="space-y-3">
            {conversionFunnel.formAbandonment.map((f) => (
              <div key={f.field}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">{f.field}</span>
                  <span className="font-semibold text-red-600">{f.dropoff}% drop</span>
                </div>
                <Bar value={f.dropoff} max={100} color="bg-red-400" />
              </div>
            ))}
          </div>
        </Card>

        {/* Exit Intent */}
        <Card title="Exit Intent Triggers">
          <div className="space-y-2">
            {conversionFunnel.exitIntentTriggers.map((e) => (
              <div key={e.trigger} className="flex justify-between rounded-lg bg-surface-muted px-3 py-2 text-sm">
                <span className="text-gray-700">{e.trigger}</span>
                <span className="font-semibold text-orange-600">{e.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* CTA Visibility */}
        <Card title="CTA Visibility">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="pb-2 text-left font-semibold text-gray-500 text-xs uppercase">CTA</th>
                <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">Seen</th>
                <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">Clicked</th>
                <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">CTR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {conversionFunnel.ctaVisibility.map((c) => {
                const ctr = c.impressions > 0 ? ((c.clicks / c.impressions) * 100).toFixed(1) : "0";
                return (
                  <tr key={c.cta}>
                    <td className="py-2 text-gray-700">{c.cta}</td>
                    <td className="py-2 text-right text-gray-500">{c.impressions.toLocaleString()}</td>
                    <td className="py-2 text-right font-medium text-gray-900">{c.clicks.toLocaleString()}</td>
                    <td className="py-2 text-right font-semibold text-brand-600">{ctr}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* UX Health                                                          */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeading title="UX Health" />
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rage Clicks */}
        <Card title="Rage Clicks">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-700">
              {uxHealth.rageClicks.count}
            </span>
            <span className="text-sm text-gray-500">total rage clicks detected</span>
          </div>
          <div className="space-y-2">
            {uxHealth.rageClicks.locations.map((l, i) => (
              <div key={i} className="flex justify-between rounded-lg bg-red-50 px-3 py-2 text-sm">
                <span className="text-gray-700">{l.page} &mdash; <code className="text-xs">{l.element}</code></span>
                <span className="font-semibold text-red-600">{l.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Dead Clicks */}
        <Card title="Dead Clicks">
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-bold text-yellow-700">
              {uxHealth.deadClicks.count}
            </span>
            <span className="text-sm text-gray-500">total dead clicks detected</span>
          </div>
          <div className="space-y-2">
            {uxHealth.deadClicks.locations.map((l, i) => (
              <div key={i} className="flex justify-between rounded-lg bg-yellow-50 px-3 py-2 text-sm">
                <span className="text-gray-700">{l.page} &mdash; <code className="text-xs">{l.element}</code></span>
                <span className="font-semibold text-yellow-700">{l.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Page Load Performance */}
        <Card title="Page Load Performance">
          <div className="space-y-3">
            {uxHealth.pageLoadPerformance.map((p) => {
              const color = p.avgLoadMs < 1500 ? "bg-green-500" : p.avgLoadMs < 3000 ? "bg-yellow-500" : "bg-red-500";
              const label = p.avgLoadMs < 1500 ? "text-green-700" : p.avgLoadMs < 3000 ? "text-yellow-700" : "text-red-700";
              return (
                <div key={p.page}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">{p.page}</span>
                    <span className={`font-semibold ${label}`}>{(p.avgLoadMs / 1000).toFixed(2)}s</span>
                  </div>
                  <Bar value={p.avgLoadMs} max={5000} color={color} />
                </div>
              );
            })}
          </div>
        </Card>

        {/* Mobile vs Desktop Conversion */}
        <Card title="Mobile vs Desktop Conversion">
          <div className="flex items-center gap-8 py-4">
            <div className="flex-1 text-center">
              <p className="text-3xl font-bold text-purple-600">{uxHealth.mobileVsDesktopConversion.mobile}%</p>
              <p className="mt-1 text-sm font-medium text-gray-500">Mobile</p>
            </div>
            <div className="h-16 w-px bg-surface-border" />
            <div className="flex-1 text-center">
              <p className="text-3xl font-bold text-blue-600">{uxHealth.mobileVsDesktopConversion.desktop}%</p>
              <p className="mt-1 text-sm font-medium text-gray-500">Desktop</p>
            </div>
          </div>
          <div className="flex h-4 overflow-hidden rounded-full">
            <div
              className="bg-purple-500 transition-all"
              style={{ width: `${uxHealth.mobileVsDesktopConversion.mobile}%` }}
            />
            <div
              className="bg-blue-500 transition-all"
              style={{ width: `${uxHealth.mobileVsDesktopConversion.desktop}%` }}
            />
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Sub-Dashboard Aggregation                                          */}
      {/* ------------------------------------------------------------------ */}
      {subDashboards && (
        <>
          <SectionHeading title="Sub-Dashboard Health" />
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {subDashboards.subdashboards.map((sub) => (
              <a
                key={sub.path}
                href={sub.path}
                className={`block rounded-card border p-4 transition-colors hover:border-brand-400 ${
                  sub.healthy
                    ? "border-surface-border bg-white"
                    : "border-red-200 bg-red-50"
                }`}
                data-testid={`sub-${sub.name.toLowerCase().replace(/\s/g, "-")}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      sub.healthy ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <span className="text-sm font-semibold text-gray-900">{sub.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{sub.category}</span>
                </div>
                {Object.keys(sub.key_metrics).length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                    {Object.entries(sub.key_metrics).slice(0, 3).map(([k, v]) => (
                      <span key={k} className="text-xs text-gray-500">
                        {k.replace(/_/g, " ")}: <span className="font-semibold text-gray-700">{String(v)}</span>
                      </span>
                    ))}
                  </div>
                )}
                {sub.error && (
                  <p className="text-xs text-red-500 mt-1">{sub.error}</p>
                )}
              </a>
            ))}
          </div>
          <div className="text-sm text-gray-400 text-right">
            {subDashboards.summary.healthy}/{subDashboards.summary.total} sub-dashboards healthy
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared Components                                                          */
/* -------------------------------------------------------------------------- */

function TabLink({ href, children, active = false }: { href: string; children: React.ReactNode; active?: boolean }) {
  return (
    <a
      href={href}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-brand-600 text-white"
          : "text-gray-600 hover:bg-surface-muted hover:text-gray-900"
      }`}
    >
      {children}
    </a>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="border-b border-surface-border pb-2 text-lg font-bold text-gray-900">
      {title}
    </h2>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-6 shadow-card">
      <h3 className="mb-4 text-base font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub: string;
  color: string;
}) {
  const dotColors: Record<string, string> = {
    brand: "bg-brand-600",
    red: "bg-red-500",
    green: "bg-green-500",
    blue: "bg-blue-500",
  };
  return (
    <div className="rounded-card border border-surface-border bg-white p-5 shadow-card">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dotColors[color] || "bg-gray-400"}`} />
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-400">{sub}</p>
    </div>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.max((value / max) * 100, 2);
  return (
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-subtle">
      <div
        className={`h-full rounded-full ${color} transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 rounded bg-gray-200" />
      <div className="h-4 w-96 rounded bg-gray-100" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-card bg-gray-100" />
        ))}
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="grid gap-6 lg:grid-cols-2">
          <div className="h-64 rounded-card bg-gray-100" />
          <div className="h-64 rounded-card bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="rounded-full bg-red-100 p-4">
        <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <p className="mt-4 text-base font-semibold text-gray-900">Failed to load analytics</p>
      <p className="mt-1 text-sm text-gray-500">{message}</p>
    </div>
  );
}
