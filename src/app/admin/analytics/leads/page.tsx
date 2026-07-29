"use client";

import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface LeadAnalyticsData {
  temperatureOverTime: { date: string; hot: number; warm: number; cool: number; cold: number }[];
  leadSources: { source: string; count: number; percentage: number }[];
  responseTime: { bucket: string; count: number }[];
  conversionBySource: { source: string; leads: number; converted: number; rate: number }[];
  recentLeads: {
    id: string;
    name: string;
    email: string;
    vehicle: string;
    temperature: "hot" | "warm" | "cool" | "cold";
    source: string;
    createdAt: string;
  }[];
}

/* -------------------------------------------------------------------------- */
/* Sample data                                                                */
/* -------------------------------------------------------------------------- */

function getSampleData(): LeadAnalyticsData {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });

  return {
    temperatureOverTime: days.map((date) => ({
      date,
      hot: Math.round(2 + Math.random() * 6),
      warm: Math.round(5 + Math.random() * 10),
      cool: Math.round(8 + Math.random() * 12),
      cold: Math.round(12 + Math.random() * 18),
    })),
    leadSources: [
      { source: "Website Form", count: 87, percentage: 35 },
      { source: "Chat Widget", count: 62, percentage: 25 },
      { source: "VDP Inquiry", count: 50, percentage: 20 },
      { source: "Phone", count: 30, percentage: 12 },
      { source: "Walk-in", count: 12, percentage: 5 },
      { source: "Third Party", count: 8, percentage: 3 },
    ],
    responseTime: [
      { bucket: "< 5 min", count: 42 },
      { bucket: "5-15 min", count: 67 },
      { bucket: "15-30 min", count: 38 },
      { bucket: "30-60 min", count: 24 },
      { bucket: "1-4 hr", count: 18 },
      { bucket: "> 4 hr", count: 9 },
    ],
    conversionBySource: [
      { source: "Website Form", leads: 87, converted: 14, rate: 16.1 },
      { source: "Chat Widget", leads: 62, converted: 8, rate: 12.9 },
      { source: "VDP Inquiry", leads: 50, converted: 11, rate: 22.0 },
      { source: "Phone", leads: 30, converted: 9, rate: 30.0 },
      { source: "Walk-in", leads: 12, converted: 6, rate: 50.0 },
      { source: "Third Party", leads: 8, converted: 1, rate: 12.5 },
    ],
    recentLeads: [
      { id: "L001", name: "Marcus Johnson", email: "marcus.j@email.com", vehicle: "2024 RAM 1500 Laramie", temperature: "hot", source: "VDP Inquiry", createdAt: "2026-03-26T14:22:00Z" },
      { id: "L002", name: "Sarah Chen", email: "sarah.c@email.com", vehicle: "2024 Toyota Tacoma TRD", temperature: "warm", source: "Chat Widget", createdAt: "2026-03-26T13:05:00Z" },
      { id: "L003", name: "David Williams", email: "david.w@email.com", vehicle: "2023 Ford F-150 XLT", temperature: "hot", source: "Website Form", createdAt: "2026-03-26T11:47:00Z" },
      { id: "L004", name: "Emily Rodriguez", email: "emily.r@email.com", vehicle: "Any SUV under $35k", temperature: "cool", source: "Phone", createdAt: "2026-03-26T10:18:00Z" },
      { id: "L005", name: "James Taylor", email: "james.t@email.com", vehicle: "2024 Jeep Wrangler", temperature: "warm", source: "Website Form", createdAt: "2026-03-26T09:33:00Z" },
      { id: "L006", name: "Ashley Brown", email: "ashley.b@email.com", vehicle: "2023 Chevy Silverado", temperature: "cold", source: "Third Party", createdAt: "2026-03-25T16:55:00Z" },
      { id: "L007", name: "Michael Davis", email: "michael.d@email.com", vehicle: "2024 RAM 1500", temperature: "cool", source: "Chat Widget", createdAt: "2026-03-25T15:12:00Z" },
      { id: "L008", name: "Jessica Wilson", email: "jessica.w@email.com", vehicle: "Honda Civic", temperature: "cold", source: "Website Form", createdAt: "2026-03-25T13:40:00Z" },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function LeadAnalyticsPage() {
  const [data, setData] = useState<LeadAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In production this would fetch from an API endpoint.
    // Using sample data directly for demo/development.
    const timer = setTimeout(() => {
      setData(getSampleData());
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (!data) return null;

  const tempColors = {
    hot: { bg: "bg-red-500", badge: "bg-red-100 text-red-700", dot: "bg-red-500" },
    warm: { bg: "bg-orange-500", badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
    cool: { bg: "bg-brand-600", badge: "bg-brand-100 text-brand-800", dot: "bg-brand-600" },
    cold: { bg: "bg-gray-400", badge: "bg-gray-100 text-gray-600", dot: "bg-gray-400" },
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lead Analytics</h1>
        <p className="mt-1 text-base text-gray-500">
          Lead temperature, source performance, and response metrics.
        </p>
      </div>

      {/* Sub-navigation */}
      <div className="flex gap-2 border-b border-surface-border pb-3">
        <TabLink href="/admin/analytics">Dashboard</TabLink>
        <TabLink href="/admin/analytics/leads" active>Leads</TabLink>
        <TabLink href="/admin/analytics/inventory">Inventory</TabLink>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Lead Temperature Over Time                                         */}
      {/* ------------------------------------------------------------------ */}
      <Card title="Lead Temperature Distribution Over Time (14 days)">
        <div className="overflow-x-auto">
          <div className="flex items-end gap-1 min-w-[600px] h-48">
            {data.temperatureOverTime.map((day) => {
              const total = day.hot + day.warm + day.cool + day.cold;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex flex-col-reverse" style={{ height: `${Math.min((total / 50) * 100, 100)}%` }}>
                    <div className="bg-red-500 rounded-b" style={{ height: `${(day.hot / total) * 100}%` }} title={`Hot: ${day.hot}`} />
                    <div className="bg-orange-500" style={{ height: `${(day.warm / total) * 100}%` }} title={`Warm: ${day.warm}`} />
                    <div className="bg-brand-600" style={{ height: `${(day.cool / total) * 100}%` }} title={`Cool: ${day.cool}`} />
                    <div className="bg-gray-400 rounded-t" style={{ height: `${(day.cold / total) * 100}%` }} title={`Cold: ${day.cold}`} />
                  </div>
                  <span className="text-[10px] text-gray-400 -rotate-45 origin-top-left whitespace-nowrap">
                    {day.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs">
          {(["hot", "warm", "cool", "cold"] as const).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${tempColors[t].dot}`} />
              <span className="capitalize text-gray-600">{t}</span>
            </span>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------------------------ */}
        {/* Lead Sources                                                       */}
        {/* ------------------------------------------------------------------ */}
        <Card title="Lead Sources">
          <div className="space-y-3">
            {data.leadSources.map((s) => (
              <div key={s.source}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-gray-700">{s.source}</span>
                  <span className="text-gray-500">{s.count} ({s.percentage}%)</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-subtle">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${s.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* Response Time                                                      */}
        {/* ------------------------------------------------------------------ */}
        <Card title="Response Time Distribution">
          <div className="space-y-3">
            {data.responseTime.map((r) => {
              const max = Math.max(...data.responseTime.map((x) => x.count));
              const color = r.bucket.startsWith("<") ? "bg-green-500"
                : r.bucket.startsWith("5") ? "bg-emerald-500"
                : r.bucket.startsWith("15") ? "bg-yellow-500"
                : r.bucket.startsWith("30") ? "bg-orange-500"
                : r.bucket.startsWith("1") ? "bg-red-400"
                : "bg-red-600";
              return (
                <div key={r.bucket}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">{r.bucket}</span>
                    <span className="font-semibold text-gray-900">{r.count}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-subtle">
                    <div
                      className={`h-full rounded-full ${color} transition-all`}
                      style={{ width: `${(r.count / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Conversion by Source                                                */}
      {/* ------------------------------------------------------------------ */}
      <Card title="Conversion Rate by Source">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="pb-2 text-left font-semibold text-gray-500 text-xs uppercase">Source</th>
                <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">Leads</th>
                <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">Converted</th>
                <th className="pb-2 text-right font-semibold text-gray-500 text-xs uppercase">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {data.conversionBySource.map((row) => (
                <tr key={row.source}>
                  <td className="py-2.5 font-medium text-gray-700">{row.source}</td>
                  <td className="py-2.5 text-right text-gray-500">{row.leads}</td>
                  <td className="py-2.5 text-right font-medium text-gray-900">{row.converted}</td>
                  <td className="py-2.5 text-right">
                    <span className={`font-semibold ${row.rate >= 20 ? "text-green-600" : row.rate >= 10 ? "text-yellow-600" : "text-red-600"}`}>
                      {row.rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Recent Leads Table                                                  */}
      {/* ------------------------------------------------------------------ */}
      <Card title="Recent Leads">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="pb-2 text-left font-semibold text-gray-500 text-xs uppercase">Name</th>
                <th className="pb-2 text-left font-semibold text-gray-500 text-xs uppercase">Vehicle Interest</th>
                <th className="pb-2 text-left font-semibold text-gray-500 text-xs uppercase">Source</th>
                <th className="pb-2 text-left font-semibold text-gray-500 text-xs uppercase">Temp</th>
                <th className="pb-2 text-left font-semibold text-gray-500 text-xs uppercase">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {data.recentLeads.map((lead) => (
                <tr key={lead.id} className="transition-colors hover:bg-surface-muted/50">
                  <td className="py-2.5">
                    <div className="font-medium text-gray-900">{lead.name}</div>
                    <div className="text-xs text-gray-400">{lead.email}</div>
                  </td>
                  <td className="py-2.5 text-gray-700">{lead.vehicle}</td>
                  <td className="py-2.5 text-gray-500">{lead.source}</td>
                  <td className="py-2.5">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tempColors[lead.temperature].badge}`}>
                      {lead.temperature}
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-400 whitespace-nowrap">
                    {new Date(lead.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-surface-border bg-white p-6 shadow-card">
      <h3 className="mb-4 text-base font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded bg-gray-200" />
      <div className="h-4 w-80 rounded bg-gray-100" />
      <div className="h-64 rounded-card bg-gray-100" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-64 rounded-card bg-gray-100" />
        <div className="h-64 rounded-card bg-gray-100" />
      </div>
    </div>
  );
}
