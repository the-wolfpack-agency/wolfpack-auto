import type { Metadata } from "next";
import Link from "next/link";
import { getOemNetworkDealers, getOemNetworkStats } from "@/db/queries/oem";

export const metadata: Metadata = { title: "Cross-Dealer Analytics" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(num: number, den: number): string {
  if (den === 0) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

function BarMeter({ value, max }: { value: number; max: number }) {
  const pctVal = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-brand-500"
          style={{ width: `${pctVal}%` }}
        />
      </div>
      <span className="text-xs text-gray-500">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OemAnalyticsPage() {
  const [stats, dealers] = await Promise.all([
    getOemNetworkStats(),
    getOemNetworkDealers(undefined, 100),
  ]);

  // Benchmarks — derive from live data
  const maxLeads = Math.max(...dealers.map((d) => d.lead_count), 1);
  const maxVehicles = Math.max(...dealers.map((d) => d.vehicle_count), 1);

  // Sort dealers by lead volume for ranking table
  const ranked = [...dealers].sort((a, b) => b.lead_count - a.lead_count);

  const migrationPending = dealers.length === 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Link href="/admin/oem" className="hover:text-brand-600">OEM Network</Link>
          <span>/</span>
          <span>Cross-Dealer Analytics</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Cross-Dealer Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Benchmark dealers against each other — inventory turns, lead velocity, program compliance.
        </p>
      </div>

      {migrationPending && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          <strong className="text-gray-700">No network data yet.</strong>{" "}
          Connect your database and link dealers to an OEM to see cross-dealer benchmarks.
        </div>
      )}

      {/* Network KPI summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            label: "Network Dealers",
            value: stats.total_dealers,
            sub: `${stats.active_dealers} active`,
          },
          {
            label: "Total Leads",
            value: stats.total_leads_network.toLocaleString(),
            sub: `${stats.network_close_rate}% close rate`,
          },
          {
            label: "Active Inventory",
            value: stats.total_vehicles_network.toLocaleString(),
            sub: "across all dealers",
          },
          {
            label: "Program Compliance",
            value:
              stats.avg_program_compliance > 0
                ? `${stats.avg_program_compliance}%`
                : "—",
            sub: "avg score",
          },
        ].map(({ label, value, sub }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
              {label}
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* Dealer ranking table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-gray-900">
            Dealer Performance Benchmark
          </h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Ranked by lead volume. Bars show relative share of network total.
          </p>
        </div>

        {ranked.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-400">
            No dealer data available. Add dealers to the network to see benchmarks.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-400">#</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-400">Dealer</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-400">Lead Volume</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-400">Inventory</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-400 text-right">Enrolled Programs</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-400 text-right">Program Score</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-gray-400">% of Network Leads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ranked.map((d, i) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-400 font-medium">
                      {i + 1}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{d.name}</p>
                      <p className="text-xs text-gray-400">{d.subdomain}</p>
                    </td>
                    <td className="px-5 py-3">
                      <BarMeter value={d.lead_count} max={maxLeads} />
                    </td>
                    <td className="px-5 py-3">
                      <BarMeter value={d.vehicle_count} max={maxVehicles} />
                    </td>
                    <td className="px-5 py-3 text-right text-gray-700">
                      {d.enrolled_programs}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {d.avg_program_score != null ? (
                        <span
                          className={`font-semibold ${
                            d.avg_program_score >= 80
                              ? "text-green-600"
                              : d.avg_program_score >= 60
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {d.avg_program_score.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600 font-medium">
                      {pct(d.lead_count, stats.total_leads_network)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Insights panel */}
      {ranked.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Top performer */}
          <div className="rounded-xl border border-green-200 bg-green-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-green-700">
              Top Performer
            </p>
            <p className="mt-2 text-base font-bold text-gray-900">
              {ranked[0].name}
            </p>
            <p className="text-sm text-green-700">
              {ranked[0].lead_count.toLocaleString()} leads ·{" "}
              {ranked[0].vehicle_count} vehicles
            </p>
          </div>

          {/* Needs attention — lowest score with at least 1 enrollment */}
          {(() => {
            const attention = [...dealers]
              .filter((d) => d.enrolled_programs > 0 && d.avg_program_score != null)
              .sort((a, b) => (a.avg_program_score ?? 0) - (b.avg_program_score ?? 0))[0];
            return attention ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-red-600">
                  Needs Attention
                </p>
                <p className="mt-2 text-base font-bold text-gray-900">
                  {attention.name}
                </p>
                <p className="text-sm text-red-600">
                  Program score: {attention.avg_program_score?.toFixed(1)}%
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Needs Attention
                </p>
                <p className="mt-2 text-sm text-gray-400">
                  Enroll dealers in programs to surface compliance alerts.
                </p>
              </div>
            );
          })()}

          {/* Network health */}
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-800">
              Network Health
            </p>
            <p className="mt-2 text-base font-bold text-gray-900">
              {stats.active_dealers}/{stats.total_dealers} active
            </p>
            <p className="text-sm text-brand-800">
              {pct(stats.active_dealers, stats.total_dealers)} dealer activation rate
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
